import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import { generateMonthlyCleaningPlan } from "../frontend/lib/cleaning-scheduler";

const env = fs.readFileSync("frontend/.env.local", "utf8");
let url = "", key = "";
env.split("\n").forEach(line => {
  if (line.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) url = line.split("=")[1].trim().replace(/['"]/g, "");
  if (line.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) key = line.split("=")[1].trim().replace(/['"]/g, "");
});

const sb = createClient(url, key);

async function runPlanOctober() {
  const orgId = "c1e566ff-c676-4ceb-a2f1-c904783e2fa5";
  const year = 2026;
  const month = 10;
  const planningCapacityMins = 480;
  const schedulingToleranceDays = 2;

  // 1. Fetch data as generate route does
  const [sitesRes, rulesRes, teamsRes, prevPlanRes, cleaningLogsRes] = await Promise.all([
    sb.from("sites").select("*").eq("org_id", orgId).order("name"),
    sb.from("site_cleaning_rules").select("*"),
    sb.from("technician_teams").select("*, technician_team_members(*, profiles(*))").eq("org_id", orgId).eq("is_active", true),
    sb.from("cleaning_plans").select("*, cleaning_plan_assignments(*)").eq("org_id", orgId).eq("year", 2026).eq("month", 9).maybeSingle(),
    sb.from("cleaning_logs").select("*").order("performed_at", { ascending: false }),
  ]);

  const sites = sitesRes.data ?? [];
  const rules = rulesRes.data ?? [];
  const teams = teamsRes.data ?? [];
  const prevPlan = prevPlanRes.data ?? null;
  const cleaningLogs = cleaningLogsRes.data ?? [];

  const previousTeamMap = new Map<string, string>();
  if (prevPlan && prevPlan.cleaning_plan_assignments) {
    for (const pa of prevPlan.cleaning_plan_assignments) {
      if (pa.site_id && pa.team_id) {
        previousTeamMap.set(pa.site_id, pa.team_id);
      }
    }
  }
  for (const log of cleaningLogs) {
    if (log.site_id && log.team_id && !previousTeamMap.has(log.site_id)) {
      previousTeamMap.set(log.site_id, log.team_id);
    }
  }

  const latestCleanedMap = new Map<string, string>();
  for (const log of cleaningLogs) {
    if (log.site_id && !latestCleanedMap.has(log.site_id)) {
      latestCleanedMap.set(log.site_id, log.performed_at.split("T")[0]);
    }
  }

  const enhancedSites = sites.map((s) => ({
    ...s,
    last_cleaned_on: s.last_cleaned_on || null,
  }));

  // Run macro scheduler
  const result = generateMonthlyCleaningPlan({
    year,
    month,
    sites: enhancedSites,
    rules,
    teams,
    planningCapacityMins,
    schedulingToleranceDays,
    previousTeamAssignments: previousTeamMap,
  });

  console.log("Macro scheduler result - unscheduled count:", result.unscheduledSites.length);
  if (result.unscheduledSites.length > 0) {
    console.log("Macro scheduler unscheduled sites:", result.unscheduledSites);
  }

  // Upsert plan header
  const planPayload = {
    org_id: orgId,
    year,
    month,
    status: "draft" as const,
    planning_capacity_mins: planningCapacityMins,
    scheduling_tolerance_days: schedulingToleranceDays,
    notes: `Generated on ${new Date().toISOString().split("T")[0]} via Assistant Macro-Scheduler`,
  };

  const { data: planRow, error: planErr } = await sb
    .from("cleaning_plans")
    .upsert(planPayload, { onConflict: "org_id,year,month" })
    .select()
    .single();

  if (planErr || !planRow) {
    console.error("Plan err:", planErr);
    return;
  }

  // Replace cleaning_plan_assignments
  await sb.from("cleaning_plan_assignments").delete().eq("plan_id", planRow.id);

  if (result.assignments.length > 0) {
    const dbAssignments = result.assignments.map((a) => ({
      plan_id: planRow.id,
      site_id: a.site_id,
      team_id: a.team_id,
      target_date: a.target_date,
      scheduled_date: a.scheduled_date,
      sequence_order: a.sequence_order,
      estimated_cleaning_mins: a.estimated_cleaning_mins,
      estimated_travel_mins: a.estimated_travel_mins,
      estimated_distance_km: a.estimated_distance_km,
      constraint_state: a.constraint_state,
      constraint_notes: a.constraint_notes,
      scheduler_rationale: a.scheduler_rationale,
    }));

    await sb.from("cleaning_plan_assignments").insert(dbAssignments);
  }

  // Upsert cleaning_visits
  if (result.proposedVisits && result.proposedVisits.length > 0) {
    const cyclePeriod = `${year}-${String(month).padStart(2, "0")}`;

    await sb
      .from("cleaning_visits")
      .delete()
      .eq("org_id", orgId)
      .eq("cycle_period", cyclePeriod)
      .eq("status", "unscheduled");

    const dbVisits = result.proposedVisits.map((pv) => ({
      org_id: orgId,
      site_id: pv.site_id,
      plan_id: planRow.id,
      cycle_period: pv.cycle_period,
      visit_sequence_in_month: pv.visit_sequence_in_month,
      target_due_date: pv.target_due_date,
      scheduled_date: pv.scheduled_date,
      assigned_team_id: pv.assigned_team_id,
      status: pv.status,
      constraint_state: pv.constraint_state,
      constraint_notes: pv.constraint_notes,
      unscheduled_reason: pv.unscheduled_reason,
      planner_rationale: pv.planner_rationale,
      estimated_cleaning_mins: pv.estimated_cleaning_mins,
      estimated_travel_mins: pv.estimated_travel_mins,
      estimated_distance_km: pv.estimated_distance_km,
      updated_at: new Date().toISOString(),
    }));

    await sb
      .from("cleaning_visits")
      .upsert(dbVisits, { onConflict: "site_id,cycle_period,visit_sequence_in_month" });
  }

  // Verify resulting DB state
  const { data: dbVisits } = await sb
    .from("cleaning_visits")
    .select("*, sites(name)")
    .eq("cycle_period", "2026-10");

  const totalReq = dbVisits ? dbVisits.length : 0;
  const scheduled = dbVisits ? dbVisits.filter(v => v.status !== "unscheduled").length : 0;
  const unscheduled = dbVisits ? dbVisits.filter(v => v.status === "unscheduled").length : 0;

  console.log("=== DB RESULT AFTER PLAN OCTOBER ===");
  console.log("Required visits:", totalReq);
  console.log("Scheduled visits:", scheduled);
  console.log("Unscheduled visits:", unscheduled);
}

runPlanOctober();
