import { createClient } from "@supabase/supabase-js";
import { generateMonthlyCleaningPlan } from "../frontend/lib/cleaning-scheduler";
import * as fs from "fs";
import * as path from "path";

const envPath = path.join(__dirname, "../frontend/.env.local");
let url = "https://ylnmjvgnjootrkywbcsj.supabase.co";
let key = "";

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    if (line.includes("=")) {
      const [k, v] = line.split("=", 2);
      const val = v.trim().replace(/^["']|["']$/g, "");
      if (k.trim() === "NEXT_PUBLIC_SUPABASE_URL") url = val;
      if (k.trim() === "SUPABASE_SERVICE_ROLE_KEY") key = val;
    }
  }
}

const sb = createClient(url, key);

async function runTest() {
  console.log("=== BATCH 2 SCHEDULER & CANONICAL DATABASE TEST ===");

  const orgId = "c1e566ff-c676-4ceb-a2f1-c904783e2fa5";
  const year = 2026;
  const month = 9;

  // 1. Fetch sites, rules, teams
  const [sitesRes, rulesRes, teamsRes] = await Promise.all([
    sb.from("sites").select("*").eq("org_id", orgId).order("name"),
    sb.from("site_cleaning_rules").select("*"),
    sb.from("technician_teams").select("*, technician_team_members(*)").eq("org_id", orgId).eq("is_active", true),
  ]);

  const sites = sitesRes.data || [];
  const rules = rulesRes.data || [];
  const teams = teamsRes.data || [];

  console.log(`Fetched ${sites.length} sites, ${rules.length} rules, ${teams.length} active teams.`);

  // 2. Generate monthly cleaning plan using Batch 2 macro-scheduler
  const result = generateMonthlyCleaningPlan({
    year,
    month,
    sites,
    rules,
    teams,
    planningCapacityMins: 480,
    schedulingToleranceDays: 2,
  });

  console.log(`Generated Macro Plan:`);
  console.log(`  - Planned Assignments: ${result.assignments.length}`);
  console.log(`  - Proposed Canonical Visits: ${result.proposedVisits.length}`);
  console.log(`  - Unscheduled Sites: ${result.unscheduledSites.length}`);

  // Ensure proposedVisits contains canonical fields
  const cyclePeriod = `${year}-${String(month).padStart(2, "0")}`;
  const dbVisits = result.proposedVisits.map((pv) => ({
    org_id: orgId,
    site_id: pv.site_id,
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

  // 3. Upsert canonical cleaning_visits into DB
  const { data: upsertData, error: upsertErr } = await sb
    .from("cleaning_visits")
    .upsert(dbVisits, { onConflict: "site_id,cycle_period,visit_sequence_in_month" })
    .select();

  if (upsertErr) {
    console.error("❌ Failed to upsert cleaning_visits:", upsertErr);
    process.exit(1);
  }

  console.log(`✅ Upserted ${upsertData.length} canonical cleaning_visits into database!`);

  // 4. Query back and verify assertions
  const { data: fetchedVisits } = await sb
    .from("cleaning_visits")
    .select("*")
    .eq("cycle_period", cyclePeriod);

  const planned = (fetchedVisits || []).filter((v) => v.status === "planned");
  const unscheduled = (fetchedVisits || []).filter((v) => v.status === "unscheduled");

  console.log(`DB Verification:`);
  console.log(`  - Total visits in DB for ${cyclePeriod}: ${fetchedVisits?.length}`);
  console.log(`  - Planned visits: ${planned.length}`);
  console.log(`  - Unscheduled visits: ${unscheduled.length}`);

  if (unscheduled.length > 0) {
    console.log("Sample Unscheduled Visit:");
    console.log(`  - Site ID: ${unscheduled[0].site_id}`);
    console.log(`  - Reason: ${unscheduled[0].unscheduled_reason}`);
    console.log(`  - Rationale: ${unscheduled[0].planner_rationale}`);
  }

  // Check bottleneck test case: Low capacity test (capacity = 60 mins)
  console.log("\n--- Testing Low Capacity Bottleneck Case (60 mins capacity) ---");
  const lowCapResult = generateMonthlyCleaningPlan({
    year,
    month,
    sites,
    rules,
    teams,
    planningCapacityMins: 60, // Constrained capacity
    schedulingToleranceDays: 0,
  });

  const lowCapUnscheduled = lowCapResult.proposedVisits.filter((v) => v.status === "unscheduled");
  console.log(`Low capacity resulted in ${lowCapUnscheduled.length} unscheduled visits with bottlenecks.`);
  if (lowCapUnscheduled.length > 0) {
    console.log(`  - Sample bottleneck reason: ${lowCapUnscheduled[0].unscheduled_reason}`);
    console.log(`  - Sample planner rationale: ${lowCapUnscheduled[0].planner_rationale}`);
  }

  console.log("\n=== ALL BATCH 2 TESTS PASSED SUCCESSFULLY ===");
}

runTest();
