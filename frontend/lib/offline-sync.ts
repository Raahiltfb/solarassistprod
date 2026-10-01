import { SupabaseClient } from "@supabase/supabase-js";
import { isValidStateTransition } from "./cleaning-domain";

export interface QueuedOfflineAction {
  id: string;
  type: "status_change" | "gps_check_in" | "cleaning_submission";
  timestamp: string;
  payload: any;
}

const STORAGE_KEY = "solarassist_offline_queue_v1";
const CACHE_ROUTE_KEY = "solarassist_cached_today_route_v1";

export function getOfflineQueue(): QueuedOfflineAction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Error reading offline queue:", err);
    return [];
  }
}

export function saveOfflineQueue(queue: QueuedOfflineAction[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error("Error saving offline queue:", err);
  }
}

export function enqueueOfflineAction(
  type: QueuedOfflineAction["type"],
  payload: any
): QueuedOfflineAction {
  const queue = getOfflineQueue();
  const action: QueuedOfflineAction = {
    id: `action-${crypto.randomUUID()}`,
    type,
    timestamp: new Date().toISOString(),
    payload,
  };
  queue.push(action);
  saveOfflineQueue(queue);
  return action;
}

export function dequeueOfflineAction(id: string): void {
  const queue = getOfflineQueue();
  const filtered = queue.filter((a) => a.id !== id);
  saveOfflineQueue(filtered);
}

export function clearOfflineQueue(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function cacheTodayRoute(routeData: any): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_ROUTE_KEY, JSON.stringify(routeData));
  } catch (err) {
    console.error("Error caching today route:", err);
  }
}

export function getCachedTodayRoute(): any | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_ROUTE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("Error reading cached today route:", err);
    return null;
  }
}

/**
 * Helper to convert Base64 data URL to Blob for upload
 */
function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(",");
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Processes all queued offline actions when connectivity is restored
 */
export async function processOfflineQueue(sb: SupabaseClient): Promise<{
  successCount: number;
  failedCount: number;
}> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { successCount: 0, failedCount: 0 };

  let successCount = 0;
  let failedCount = 0;

  for (const action of queue) {
    try {
      if (action.type === "status_change") {
        const { work_order_id, status, site_id } = action.payload;

        if (work_order_id) {
          await sb
            .from("work_orders")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("id", work_order_id);
        }

        if (site_id) {
          const { data: activeVisit } = await sb
            .from("cleaning_visits")
            .select("*")
            .eq("site_id", site_id)
            .in("status", ["published", "en_route", "in_progress", "planned", "approved"])
            .order("target_due_date", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (activeVisit && isValidStateTransition(activeVisit.status, status)) {
            await sb
              .from("cleaning_visits")
              .update({ status, updated_at: new Date().toISOString() })
              .eq("id", activeVisit.id);
          }
        }
        dequeueOfflineAction(action.id);
        successCount++;
      } else if (action.type === "gps_check_in") {
        const { work_order_id, site_id, lat, lng, timestamp } = action.payload;

        if (work_order_id) {
          await sb
            .from("work_orders")
            .update({
              status: "in_progress",
              check_in_at: timestamp || new Date().toISOString(),
              check_in_lat: lat,
              check_in_lng: lng,
              updated_at: new Date().toISOString(),
            })
            .eq("id", work_order_id);
        }

        if (site_id) {
          const { data: activeVisit } = await sb
            .from("cleaning_visits")
            .select("*")
            .eq("site_id", site_id)
            .in("status", ["published", "en_route", "in_progress", "planned", "approved"])
            .order("target_due_date", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (activeVisit && isValidStateTransition(activeVisit.status, "in_progress")) {
            await sb
              .from("cleaning_visits")
              .update({
                status: "in_progress",
                started_at: timestamp || new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", activeVisit.id);
          }
        }
        dequeueOfflineAction(action.id);
        successCount++;
      } else if (action.type === "cleaning_submission") {
        const p = action.payload;

        // Upload photos if they are base64 strings
        const uploadPhotoIfNeeded = async (photoVal: string, kind: string) => {
          if (!photoVal) return null;
          if (photoVal.startsWith("http")) return photoVal;
          if (photoVal.startsWith("data:")) {
            const blob = dataURLtoBlob(photoVal);
            const path = `cleaning/offline-${crypto.randomUUID()}-${kind}.jpg`;
            const { error: upErr } = await sb.storage
              .from("solar-uploads")
              .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
            if (upErr) throw upErr;
            const { data: pubData } = sb.storage.from("solar-uploads").getPublicUrl(path);
            return pubData.publicUrl;
          }
          return photoVal;
        };

        const safetyUrl = await uploadPhotoIfNeeded(p.safety, "safety");
        const beforeUrl = await uploadPhotoIfNeeded(p.before, "before");
        const afterUrl = await uploadPhotoIfNeeded(p.after, "after");
        const damageUrl = p.damageObserved ? await uploadPhotoIfNeeded(p.damagePhoto, "damage") : null;

        const completedAtIso = p.completedAt || new Date().toISOString();

        const { data: logData, error: logErr } = await sb
          .from("cleaning_logs")
          .insert({
            site_id: p.site_id,
            work_order_id: p.work_order_id || null,
            performed_by: p.performed_by || null,
            performed_at: completedAtIso,
            remarks: p.remarks || null,
            safety_photo_url: safetyUrl,
            before_photo_url: beforeUrl,
            after_photo_url: afterUrl,
            damage_observed: Boolean(p.damageObserved),
            damage_type: p.damageObserved ? p.damageType : null,
            damage_photo_url: damageUrl,
          })
          .select()
          .single();

        if (logErr) throw logErr;

        await sb
          .from("sites")
          .update({ last_cleaned_on: completedAtIso.slice(0, 10) })
          .eq("id", p.site_id);

        const { data: activeVisit } = await sb
          .from("cleaning_visits")
          .select("*")
          .eq("site_id", p.site_id)
          .in("status", ["published", "en_route", "in_progress", "planned", "approved"])
          .order("target_due_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeVisit && isValidStateTransition(activeVisit.status, "completed")) {
          await sb
            .from("cleaning_visits")
            .update({
              status: "completed",
              execution_log_id: logData.id,
              completed_at: completedAtIso,
              updated_at: completedAtIso,
            })
            .eq("id", activeVisit.id);
        }

        if (p.work_order_id) {
          await sb
            .from("work_orders")
            .update({
              status: "completed",
              completed_at: completedAtIso,
              updated_at: completedAtIso,
            })
            .eq("id", p.work_order_id);
        }

        dequeueOfflineAction(action.id);
        successCount++;
      }
    } catch (err) {
      console.error(`Error processing offline action ${action.id}:`, err);
      failedCount++;
    }
  }

  return { successCount, failedCount };
}
