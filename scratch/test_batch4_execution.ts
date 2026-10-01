import { createClient } from "@supabase/supabase-js";
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

async function runBatch4Test() {
  console.log("=== BATCH 4 TECHNICIAN EXECUTION & DASHBOARD INTEGRATION TEST ===");

  const cyclePeriod = "2026-09";

  // 1. Fetch published cleaning_visits in DB
  const { data: publishedVisits } = await sb
    .from("cleaning_visits")
    .select("*")
    .eq("cycle_period", cyclePeriod)
    .eq("status", "published");

  console.log(`✓ Total Published Canonical Visits for cycle 2026-09: ${publishedVisits?.length}`);
  assert(publishedVisits && publishedVisits.length > 0, "No published cleaning_visits found in DB!");

  const targetVisit = publishedVisits[0];
  console.log(`Target Visit for Execution Test: Site ID ${targetVisit.site_id}, Current Status: ${targetVisit.status}`);

  // 2. Simulate technician log submission
  const completedAtIso = new Date().toISOString();
  const { data: logData, error: logErr } = await sb
    .from("cleaning_logs")
    .insert({
      site_id: targetVisit.site_id,
      performed_at: completedAtIso,
      remarks: "Batch 4 Automated Technician Execution Test",
      safety_photo_url: "https://example.com/safety.jpg",
      before_photo_url: "https://example.com/before.jpg",
      after_photo_url: "https://example.com/after.jpg",
      damage_observed: false,
    })
    .select()
    .single();

  assert(!logErr && logData, `Failed to create cleaning_log: ${logErr?.message}`);
  console.log(`✓ Created test cleaning_log record ID: ${logData.id}`);

  // 3. Test State Transition: published -> completed
  assert(isValidStateTransition(targetVisit.status, "completed"), `Invalid state transition from ${targetVisit.status} to completed`);

  const { error: visitUpdateErr } = await sb
    .from("cleaning_visits")
    .update({
      status: "completed",
      execution_log_id: logData.id,
      completed_at: completedAtIso,
      updated_at: completedAtIso,
    })
    .eq("id", targetVisit.id);

  assert(!visitUpdateErr, `Failed to update cleaning_visit status: ${visitUpdateErr?.message}`);
  console.log(`✓ Successfully updated canonical cleaning_visit ID ${targetVisit.id} to 'completed'!`);

  // 4. Query back and verify execution linkage
  const { data: verifiedVisit } = await sb
    .from("cleaning_visits")
    .select("*")
    .eq("id", targetVisit.id)
    .single();

  assert(verifiedVisit.status === "completed", "Status is not completed!");
  assert(verifiedVisit.execution_log_id === logData.id, "execution_log_id does not match!");
  assert(new Date(verifiedVisit.completed_at).getTime() === new Date(completedAtIso).getTime(), "completed_at timestamp does not match!");

  console.log("✓ Verified canonical cleaning_visit execution linkage:");
  console.log(`  - Status: ${verifiedVisit.status}`);
  console.log(`  - Execution Log ID: ${verifiedVisit.execution_log_id}`);
  console.log(`  - Completed At: ${verifiedVisit.completed_at}`);

  // 5. Query Command Center metrics
  const { data: currentCycleVisits } = await sb
    .from("cleaning_visits")
    .select("*")
    .eq("cycle_period", cyclePeriod);

  const completedCount = (currentCycleVisits || []).filter((v) => v.status === "completed").length;
  const publishedCount = (currentCycleVisits || []).filter((v) => v.status === "published").length;
  const unscheduledCount = (currentCycleVisits || []).filter((v) => v.status === "unscheduled").length;

  console.log(`✓ Command Center Canonical Metrics for ${cyclePeriod}:`);
  console.log(`  - Completed: ${completedCount}`);
  console.log(`  - Published: ${publishedCount}`);
  console.log(`  - Unscheduled: ${unscheduledCount}`);

  console.log("\n=== ALL BATCH 4 VERIFICATION CHECKS PASSED PERFECTLY ===");
}

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
}

runBatch4Test();
