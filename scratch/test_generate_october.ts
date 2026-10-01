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

async function test() {
  const orgId = "c1e566ff-c676-4ceb-a2f1-c904783e2fa5";
  const [sitesRes, rulesRes, teamsRes] = await Promise.all([
    sb.from("sites").select("*").eq("org_id", orgId).order("name"),
    sb.from("site_cleaning_rules").select("*"),
    sb.from("technician_teams").select("*, technician_team_members(*, profiles(*))").eq("org_id", orgId).eq("is_active", true),
  ]);

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: sitesRes.data || [],
    rules: rulesRes.data || [],
    teams: teamsRes.data || [],
  });

  console.log("Total required visits:", result.auditReport.total_required_visits);
  console.log("Assignments count:", result.assignments.length);
  console.log("Unscheduled count:", result.unscheduledSites.length);
  if (result.unscheduledSites.length > 0) {
    console.log("Unscheduled sites details:", JSON.stringify(result.unscheduledSites, null, 2));
  }
}

test();
