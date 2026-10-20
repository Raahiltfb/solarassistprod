import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { actionId, isSchedule, entityType } = body;

    if (!actionId) {
      return NextResponse.json({ error: "Missing actionId" }, { status: 400 });
    }

    const serviceClient = createServiceClient();
    const nowIso = new Date().toISOString();

    // Verify user profile & access rights
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (isSchedule) {
      const cleanSiteId = typeof actionId === "string" ? actionId.replace(/^site-clean-/, "") : actionId;

      // 1. Try updating sites table
      const { data: siteData } = await serviceClient
        .from("sites")
        .update({
          cleaning_schedule_acknowledged_at: nowIso,
          cleaning_schedule_notes: "Schedule acknowledged by Client on " + nowIso.slice(0, 10),
        })
        .eq("id", cleanSiteId)
        .select("id, next_cleaning_date")
        .maybeSingle();

      // 2. Try updating work_orders
      const { data: woData } = await serviceClient
        .from("work_orders")
        .update({ client_acknowledged_at: nowIso })
        .eq("id", actionId)
        .select("site_id, scheduled_date")
        .maybeSingle();

      // 3. Try updating cleaning_visits
      const { data: cvData } = await serviceClient
        .from("cleaning_visits")
        .update({ acknowledged_at: nowIso, acknowledged_by: user.id })
        .eq("id", actionId)
        .select("site_id, scheduled_date")
        .maybeSingle();

      // Cross-synchronize matching visit/work_order/site on site and date if found
      const siteId = siteData?.id || woData?.site_id || cvData?.site_id;
      const scheduledDate = siteData?.next_cleaning_date || woData?.scheduled_date || cvData?.scheduled_date;

      if (siteId) {
        await serviceClient
          .from("sites")
          .update({
            cleaning_schedule_acknowledged_at: nowIso,
          })
          .eq("id", siteId);

        if (scheduledDate) {
          await Promise.all([
            serviceClient
              .from("work_orders")
              .update({ client_acknowledged_at: nowIso })
              .eq("site_id", siteId)
              .eq("scheduled_date", scheduledDate)
              .eq("type", "cleaning"),
            serviceClient
              .from("cleaning_visits")
              .update({ acknowledged_at: nowIso, acknowledged_by: user.id })
              .eq("site_id", siteId)
              .eq("scheduled_date", scheduledDate),
          ]);
        }
      }
    } else {
      // Completed Cleaning Acknowledgment
      // 1. Try updating cleaning_logs
      const { data: logData } = await serviceClient
        .from("cleaning_logs")
        .update({
          client_acknowledged: true,
          client_acknowledged_at: nowIso,
        })
        .eq("id", actionId)
        .select("site_id, work_order_id, cleaning_visit_id")
        .maybeSingle();

      // 2. Try updating work_orders
      const { data: woData } = await serviceClient
        .from("work_orders")
        .update({ client_acknowledged_at: nowIso })
        .eq("id", actionId)
        .select("site_id")
        .maybeSingle();

      // 3. Try updating cleaning_visits
      await serviceClient
        .from("cleaning_visits")
        .update({ acknowledged_at: nowIso, acknowledged_by: user.id })
        .eq("id", actionId);

      // If log has linked work_order_id or cleaning_visit_id, acknowledge them too
      if (logData?.work_order_id) {
        await serviceClient
          .from("work_orders")
          .update({ client_acknowledged_at: nowIso })
          .eq("id", logData.work_order_id);
      }
      if (logData?.cleaning_visit_id) {
        await serviceClient
          .from("cleaning_visits")
          .update({ acknowledged_at: nowIso, acknowledged_by: user.id })
          .eq("id", logData.cleaning_visit_id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Acknowledge API error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to acknowledge" },
      { status: 500 }
    );
  }
}
