import { formatDate } from "./utils";

export interface SiteCleaningResolution {
  siteId: string;
  siteName: string;
  isScheduled: boolean;
  scheduledDate: string | null;
  status: string;
  isAcknowledged: boolean;
  daysUntil: number | null;
  isWithin2Days: boolean;
  displayDate: string;
  displayStatus: string;
  formattedDate: string;
  lastCleanedOn: string | null;
  cycleDays: number;
  visitId?: string | null;
  workOrderId?: string | null;
}

/**
 * Resolves the single source of truth for a site's cleaning schedule.
 * Hierarchy:
 * 1. Confirmed upcoming cleaning visit in cleaning_visits (status in published, scheduled, planned, approved)
 * 2. Confirmed upcoming cleaning work order in work_orders (type === 'cleaning', not cancelled)
 * 3. Confirmed upcoming schedule date on sites table (next_cleaning_date >= todayStr)
 * 4. Fallback: projected date based on last_cleaned_on + cleaning_cycle_days
 */
export function resolveSiteCleaning(
  site: {
    id: string;
    name?: string;
    next_cleaning_date?: string | null;
    cleaning_schedule_type?: string | null;
    cleaning_schedule_notes?: string | null;
    cleaning_schedule_acknowledged_at?: string | null;
    last_cleaned_on?: string | null;
    cleaning_cycle_days?: number | null;
  },
  options?: {
    visits?: any[];
    workOrders?: any[];
    todayStr?: string;
  }
): SiteCleaningResolution {
  const todayStr = options?.todayStr || new Date().toISOString().slice(0, 10);
  const cycleDays = site.cleaning_cycle_days || 30;

  // 1. Check cleaning_visits for this site
  const futureVisits = (options?.visits || [])
    .filter(
      (v) =>
        v.site_id === site.id &&
        v.scheduled_date &&
        v.scheduled_date >= todayStr &&
        ["published", "scheduled", "planned", "approved"].includes(v.status)
    )
    .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime());

  const canonicalVisit = futureVisits[0];

  // 2. Check work_orders for this site
  const futureWos = (options?.workOrders || [])
    .filter(
      (wo) =>
        wo.site_id === site.id &&
        wo.type === "cleaning" &&
        wo.scheduled_date &&
        wo.scheduled_date >= todayStr &&
        wo.status !== "cancelled"
    )
    .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime());

  const canonicalWo = futureWos[0];

  // 3. Check sites.next_cleaning_date
  const siteScheduleDate =
    site.next_cleaning_date && site.next_cleaning_date >= todayStr
      ? site.next_cleaning_date
      : null;

  // Resolve earliest confirmed scheduled date
  const scheduledDate =
    canonicalVisit?.scheduled_date ||
    canonicalWo?.scheduled_date ||
    siteScheduleDate ||
    null;

  const isScheduled = Boolean(scheduledDate);

  // Acknowledgment check
  const isAcknowledged = Boolean(
    site.cleaning_schedule_acknowledged_at ||
      canonicalVisit?.acknowledged_at ||
      canonicalWo?.client_acknowledged_at ||
      (site.cleaning_schedule_notes && site.cleaning_schedule_notes.includes("[ACKNOWLEDGED]"))
  );

  let daysUntil: number | null = null;
  let isWithin2Days = false;

  if (scheduledDate) {
    const targetDate = new Date(scheduledDate.slice(0, 10) + "T00:00:00");
    const todayDate = new Date(todayStr + "T00:00:00");
    daysUntil = Math.round((targetDate.getTime() - todayDate.getTime()) / 86400000);
    isWithin2Days = daysUntil >= 0 && daysUntil <= 2;
  }

  // Calculate projected date from routine interval if not scheduled
  let projectedDate: string | null = null;
  if (site.last_cleaned_on) {
    const lastDate = new Date(site.last_cleaned_on);
    const projTime = lastDate.getTime() + cycleDays * 86400000;
    projectedDate = new Date(projTime).toISOString().slice(0, 10);
  }

  let displayDate: string;
  let displayStatus: string;

  if (isScheduled && scheduledDate) {
    displayDate = scheduledDate;
    if (isWithin2Days) {
      displayStatus = daysUntil === 0 ? "Cleaning Scheduled Today" : daysUntil === 1 ? "Cleaning Tomorrow" : "2 Days in Advance";
    } else {
      displayStatus = `Scheduled in ${daysUntil} days`;
    }
  } else if (projectedDate) {
    displayDate = projectedDate;
    displayStatus = projectedDate >= todayStr ? `Projected (${cycleDays}d cycle)` : "Routine Cycle Due";
  } else {
    displayDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    displayStatus = "Routine Maintenance Care";
  }

  return {
    siteId: site.id,
    siteName: site.name || "Solar Site",
    isScheduled,
    scheduledDate,
    status: isScheduled ? (canonicalVisit?.status || canonicalWo?.status || site.cleaning_schedule_type || "scheduled") : "projected",
    isAcknowledged,
    daysUntil,
    isWithin2Days,
    displayDate,
    displayStatus,
    formattedDate: formatDate(displayDate),
    lastCleanedOn: site.last_cleaned_on || null,
    cycleDays,
    visitId: canonicalVisit?.id || null,
    workOrderId: canonicalWo?.id || null,
  };
}

/**
 * Atomically synchronizes a scheduled cleaning across:
 * 1. public.sites (next_cleaning_date, cleaning_schedule_type, cleaning_schedule_acknowledged_at = null)
 * 2. public.cleaning_visits (canonical visit upsert)
 * 3. public.work_orders (cleaning work order upsert)
 */
export async function syncScheduledCleaning(
  supabase: any,
  {
    siteId,
    scheduledDate,
    scheduleType = "manual",
    notes = "",
    teamId = null,
    userId = null,
  }: {
    siteId: string;
    scheduledDate: string;
    scheduleType?: "manual" | "approved" | "planner" | "work_order";
    notes?: string;
    teamId?: string | null;
    userId?: string | null;
  }
) {
  // 1. Fetch Site Record
  const { data: site, error: siteFetchErr } = await supabase
    .from("sites")
    .select("id, name, org_id, cleaning_cycle_days")
    .eq("id", siteId)
    .single();

  if (siteFetchErr || !site) {
    throw new Error(siteFetchErr?.message || "Site not found for scheduling");
  }

  const cyclePeriod = scheduledDate.slice(0, 7);

  // 2. Update sites table
  const { error: siteUpdateErr } = await supabase
    .from("sites")
    .update({
      next_cleaning_date: scheduledDate,
      cleaning_schedule_type: scheduleType,
      cleaning_schedule_notes: notes || `Cleaning scheduled for ${scheduledDate}`,
      cleaning_schedule_acknowledged_at: null, // Reset acknowledgment so client receives notification popup!
    })
    .eq("id", siteId);

  if (siteUpdateErr) {
    console.error("Error updating site next_cleaning_date:", siteUpdateErr);
  }

  // 3. Upsert canonical cleaning_visits
  const { data: existingVisits } = await supabase
    .from("cleaning_visits")
    .select("id, scheduled_date, visit_sequence_in_month")
    .eq("site_id", siteId)
    .eq("cycle_period", cyclePeriod);

  const visitOnDate = (existingVisits || []).find((v: any) => v.scheduled_date === scheduledDate);

  if (visitOnDate) {
    await supabase
      .from("cleaning_visits")
      .update({
        status: "published",
        target_due_date: scheduledDate,
        assigned_team_id: teamId || undefined,
        acknowledged_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", visitOnDate.id);
  } else {
    const maxSeq = (existingVisits || []).reduce(
      (max: number, v: any) => Math.max(max, v.visit_sequence_in_month || 1),
      0
    );
    await supabase.from("cleaning_visits").insert({
      org_id: site.org_id,
      site_id: siteId,
      cycle_period: cyclePeriod,
      visit_sequence_in_month: maxSeq + 1,
      target_due_date: scheduledDate,
      scheduled_date: scheduledDate,
      status: "published",
      assigned_team_id: teamId || null,
      acknowledged_at: null,
    });
  }

  // 4. Upsert work_orders
  const { data: existingWo } = await supabase
    .from("work_orders")
    .select("id")
    .eq("site_id", siteId)
    .eq("scheduled_date", scheduledDate)
    .eq("type", "cleaning")
    .maybeSingle();

  if (existingWo) {
    await supabase
      .from("work_orders")
      .update({
        status: "scheduled",
        team_id: teamId || undefined,
        client_acknowledged_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingWo.id);
  } else {
    await supabase.from("work_orders").insert({
      org_id: site.org_id,
      site_id: siteId,
      team_id: teamId || null,
      created_by: userId || null,
      title: `Module Cleaning: ${site.name}`,
      description: notes || `Scheduled solar panel module cleaning service request.`,
      type: "cleaning",
      status: "scheduled",
      scheduled_date: scheduledDate,
      estimated_duration_mins: 90,
    });
  }

  return {
    siteId,
    siteName: site.name,
    scheduledDate,
    status: "scheduled",
  };
}

/**
 * Reconciles all sites in the database so that cleaning_visits, work_orders, and sites.next_cleaning_date
 * match each other perfectly.
 */
export async function reconcileAllSiteCleaningSchedules(supabase: any) {
  const todayStr = new Date().toISOString().slice(0, 10);

  // Fetch all sites
  const { data: sites } = await supabase
    .from("sites")
    .select("id, name, org_id, next_cleaning_date, cleaning_schedule_type");

  if (!sites) return;

  // Fetch all upcoming cleaning visits
  const { data: visits } = await supabase
    .from("cleaning_visits")
    .select("id, site_id, scheduled_date, status")
    .gte("scheduled_date", todayStr)
    .in("status", ["published", "scheduled", "planned", "approved"]);

  // Fetch all upcoming cleaning work orders
  const { data: workOrders } = await supabase
    .from("work_orders")
    .select("id, site_id, scheduled_date, status")
    .eq("type", "cleaning")
    .gte("scheduled_date", todayStr)
    .neq("status", "cancelled");

  const visitMap = new Map<string, string>();
  for (const v of visits || []) {
    if (!visitMap.has(v.site_id) || v.scheduled_date < visitMap.get(v.site_id)!) {
      visitMap.set(v.site_id, v.scheduled_date);
    }
  }

  const woMap = new Map<string, string>();
  for (const wo of workOrders || []) {
    if (!woMap.has(wo.site_id) || wo.scheduled_date < woMap.get(wo.site_id)!) {
      woMap.set(wo.site_id, wo.scheduled_date);
    }
  }

  for (const site of sites) {
    const scheduledDate =
      site.next_cleaning_date && site.next_cleaning_date >= todayStr
        ? site.next_cleaning_date
        : visitMap.get(site.id) || woMap.get(site.id);

    if (scheduledDate) {
      // Ensure site table has this date
      if (site.next_cleaning_date !== scheduledDate) {
        await supabase
          .from("sites")
          .update({
            next_cleaning_date: scheduledDate,
            cleaning_schedule_type: site.cleaning_schedule_type || "scheduled",
          })
          .eq("id", site.id);
      }

      // Ensure cleaning_visits has this date
      const cyclePeriod = scheduledDate.slice(0, 7);
      const { data: existingVisit } = await supabase
        .from("cleaning_visits")
        .select("id, scheduled_date")
        .eq("site_id", site.id)
        .eq("cycle_period", cyclePeriod)
        .eq("scheduled_date", scheduledDate)
        .maybeSingle();

      if (!existingVisit) {
        const { data: monthVisits } = await supabase
          .from("cleaning_visits")
          .select("visit_sequence_in_month")
          .eq("site_id", site.id)
          .eq("cycle_period", cyclePeriod);

        const maxSeq = (monthVisits || []).reduce(
          (max: number, v: any) => Math.max(max, v.visit_sequence_in_month || 1),
          0
        );

        await supabase.from("cleaning_visits").insert({
          org_id: site.org_id,
          site_id: site.id,
          cycle_period: cyclePeriod,
          visit_sequence_in_month: maxSeq + 1,
          target_due_date: scheduledDate,
          scheduled_date: scheduledDate,
          status: "published",
        });
      }

      // Ensure work_orders has this date
      const { data: existingWo } = await supabase
        .from("work_orders")
        .select("id")
        .eq("site_id", site.id)
        .eq("scheduled_date", scheduledDate)
        .eq("type", "cleaning")
        .maybeSingle();

      if (!existingWo) {
        await supabase.from("work_orders").insert({
          org_id: site.org_id,
          site_id: site.id,
          type: "cleaning",
          status: "scheduled",
          scheduled_date: scheduledDate,
          title: `Module Cleaning: ${site.name}`,
          description: `Scheduled solar panel module cleaning service request.`,
          estimated_duration_mins: 90,
        });
      }
    }
  }
}
