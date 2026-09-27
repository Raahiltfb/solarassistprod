import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { processAlertAutomation } from "@/lib/automation/engine";

export async function POST(req: Request) {
  try {
    const sb = process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceClient() : await createClient();
    const body = await req.json();
    const { scenario = "critical_outage", site_id } = body;

    // 1. Get target site
    let targetSiteId = site_id;
    if (!targetSiteId) {
      const { data: firstSite } = await sb.from("sites").select("id, org_id").limit(1).maybeSingle();
      if (!firstSite) {
        return NextResponse.json({ error: "No sites available for simulation" }, { status: 400 });
      }
      targetSiteId = firstSite.id;
    }

    const { data: site } = await sb.from("sites").select("id, org_id, name").eq("id", targetSiteId).single();
    const orgId = site?.org_id || null;

    // Scenario definitions
    let code = "SOLIS_ERR_01";
    let title = "[DEMO SIMULATION] Inverter Isolation Fault & Critical Shutdown";
    let severity: "critical" | "high" | "medium" | "low" = "critical";
    let description = "Simulated sudden inverter shutdown due to low isolation resistance on DC bus.";
    let requiresTechnician = true;

    if (scenario === "string_underperformance") {
      code = "SUNGROW_STR_03";
      title = "[DEMO SIMULATION] String 3 Voltage Drop & Power Degradation";
      severity = "high";
      description = "Simulated String 3 underperformance (35% power drop relative to adjacent strings).";
    } else if (scenario === "human_review") {
      code = "TELEMETRY_DRIFT";
      title = "[DEMO SIMULATION] Ambiguous Telemetry Anomaly (Sensor Drift)";
      severity = "medium";
      description = "Simulated ambiguous voltage telemetry mismatch across phase R and phase S.";
      requiresTechnician = false;
    } else if (scenario === "grid_failure") {
      code = "GRID_OUTAGE_01";
      title = "[DEMO SIMULATION] External Grid Failure (DISCOM Downtime)";
      severity = "high";
      description = "Simulated 33kV DISCOM feeder trip. External grid power unavailable.";
      requiresTechnician = false;
    } else if (scenario === "recurring_escalate") {
      code = "RECURRING_FAULT_01";
      title = "[DEMO SIMULATION] Persistent Inverter Over-Temperature Failure";
      severity = "critical";
      description = "Simulated 4th repeat failure of cooling fan / thermal breaker in 7 days.";

      // Insert 2 prior historical alerts within 7 days to trigger recurrence >= 3
      const past3Days = new Date(Date.now() - 3 * 86400_000).toISOString();
      const past5Days = new Date(Date.now() - 5 * 86400_000).toISOString();

      await sb.from("alerts").insert([
        {
          org_id: orgId,
          site_id: targetSiteId,
          code,
          title: "[DEMO] Prior Thermal Trip (Day -5)",
          severity: "critical",
          status: "resolved",
          triggered_at: past5Days,
        },
        {
          org_id: orgId,
          site_id: targetSiteId,
          code,
          title: "[DEMO] Prior Thermal Trip (Day -3)",
          severity: "critical",
          status: "resolved",
          triggered_at: past3Days,
        },
      ]);
    }

    // 2. Create Demo Alert
    const { data: demoAlert, error: alertErr } = await sb
      .from("alerts")
      .insert({
        org_id: orgId,
        site_id: targetSiteId,
        code,
        title,
        severity,
        description,
        requires_technician: requiresTechnician,
        status: "open",
        triggered_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (alertErr || !demoAlert) {
      return NextResponse.json({ error: `Failed to create demo alert: ${alertErr?.message}` }, { status: 500 });
    }

    // 3. Process through Automation Decision Engine
    const autoResult = await processAlertAutomation(demoAlert.id, sb);

    // 4. Fetch enriched result (ticket, work order, assigned technician)
    let ticket: any = null;
    let workOrder: any = null;
    let technician: any = null;

    if (autoResult.ticket_id) {
      const { data: tData } = await sb.from("tickets").select("*").eq("id", autoResult.ticket_id).maybeSingle();
      ticket = tData;
    }

    if (autoResult.work_order_id) {
      const { data: woData } = await sb
        .from("work_orders")
        .select("*, profiles:technician_id(id, full_name, phone)")
        .eq("id", autoResult.work_order_id)
        .maybeSingle();

      workOrder = woData;
      technician = woData?.profiles || null;
    }

    return NextResponse.json({
      success: true,
      scenario,
      site_name: site?.name || "Target Site",
      alert: demoAlert,
      automation_result: autoResult,
      ticket,
      work_order: workOrder,
      assigned_technician: technician,
    });
  } catch (err: any) {
    console.error("Sandbox simulation error:", err);
    return NextResponse.json({ error: err?.message || "Simulation server error" }, { status: 500 });
  }
}
