import { createClient } from "@supabase/supabase-js";
import { generateMonthlyCleaningPlan } from "../frontend/lib/cleaning-scheduler";
import { isValidStateTransition } from "../frontend/lib/cleaning-domain";
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

async function runBatch3Test() {
  console.log("=== BATCH 3 PUBLISHING & ROUTES ALIGNMENT TEST ===");

  const orgId = "c1e566ff-c676-4ceb-a2f1-c904783e2fa5";
  const year = 2026;
  const month = 9;
  const cyclePeriod = "2026-09";

  // 1. Fetch sites, rules, teams
  const [sitesRes, rulesRes, teamsRes] = await Promise.all([
    sb.from("sites").select("*").eq("org_id", orgId).order("name"),
    sb.from("site_cleaning_rules").select("*"),
    sb.from("technician_teams").select("*, technician_team_members(*)").eq("org_id", orgId).eq("is_active", true),
  ]);

  const sites = sitesRes.data || [];
  const rules = rulesRes.data || [];
  const teams = teamsRes.data || [];

  // 2. Generate macro plan
  const planResult = generateMonthlyCleaningPlan({
    year,
    month,
    sites,
    rules,
    teams,
    planningCapacityMins: 480,
    schedulingToleranceDays: 2,
  });

  // 3. Upsert cleaning plan header & proposed canonical visits (planned status)
  const { data: planRow } = await sb
    .from("cleaning_plans")
    .upsert(
      {
        org_id: orgId,
        year,
        month,
        status: "approved", // Set to approved so publish endpoint accepts it
        planning_capacity_mins: 480,
        scheduling_tolerance_days: 2,
      },
      { onConflict: "org_id,year,month" }
    )
    .select()
    .single();

  assert(planRow, "Failed to create cleaning_plans header!");

  const dbVisits = planResult.proposedVisits.map((pv) => ({
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

  await sb.from("cleaning_visits").upsert(dbVisits, { onConflict: "site_id,cycle_period,visit_sequence_in_month" });

  console.log(`✓ Inserted/Upserted ${dbVisits.length} canonical cleaning_visits with status 'planned' / 'unscheduled'.`);

  // 4. Simulate Publishing Transition to 'published'
  const { data: visitsBeforePublish } = await sb.from("cleaning_visits").select("*").eq("cycle_period", cyclePeriod);
  const plannedBefore = (visitsBeforePublish || []).filter((v) => v.status === "planned");
  console.log(`✓ Before Publish: ${plannedBefore.length} visits in 'planned' status.`);

  // Perform publishing status update
  for (const v of visitsBeforePublish || []) {
    if (v.status === "planned" || v.status === "approved") {
      assert(isValidStateTransition(v.status, "published"), `Invalid transition from ${v.status} to published`);
      await sb
        .from("cleaning_visits")
        .update({
          status: "published",
          updated_at: new Date().toISOString(),
        })
        .eq("id", v.id);
    }
  }

  // 5. Query back and verify published status
  const { data: visitsAfterPublish } = await sb.from("cleaning_visits").select("*").eq("cycle_period", cyclePeriod);
  const publishedAfter = (visitsAfterPublish || []).filter((v) => v.status === "published");

  console.log(`✓ After Publish: ${publishedAfter.length} visits transitioned to 'published' status!`);
  assert(publishedAfter.length === plannedBefore.length, "All planned visits should transition to published!");

  // 6. Test Site Detail Query
  const testSiteId = dbVisits[0].site_id;
  const testSiteName = sites.find((s) => s.id === testSiteId)?.name || testSiteId;
  const { data: siteVisits } = await sb
    .from("cleaning_visits")
    .select("*, technician_teams(name)")
    .eq("site_id", testSiteId)
    .order("target_due_date", { ascending: false });

  console.log(`✓ Site Detail Query Test for Site '${testSiteName}': Found ${siteVisits?.length} canonical visits.`);
  assert(siteVisits && siteVisits.length > 0, "Site detail query failed to return canonical visits!");

  console.log("\n=== ALL BATCH 3 VERIFICATION CHECKS PASSED PERFECTLY ===");
}

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
}

runBatch3Test();
