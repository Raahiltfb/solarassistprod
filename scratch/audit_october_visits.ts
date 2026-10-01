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

async function run() {
  const orgId = "c1e566ff-c676-4ceb-a2f1-c904783e2fa5";
  const [sitesRes, rulesRes, teamsRes, cleaningLogsRes] = await Promise.all([
    sb.from("sites").select("*").eq("org_id", orgId).order("name"),
    sb.from("site_cleaning_rules").select("*"),
    sb.from("technician_teams").select("*, technician_team_members(*, profiles(*))").eq("org_id", orgId).eq("is_active", true),
    sb.from("cleaning_logs").select("*").order("performed_at", { ascending: false }),
  ]);

  const latestCleanedMap = new Map<string, string>();
  for (const log of cleaningLogsRes.data || []) {
    if (log.site_id && !latestCleanedMap.has(log.site_id)) {
      latestCleanedMap.set(log.site_id, log.performed_at.split("T")[0]);
    }
  }

  const enhancedSites = (sitesRes.data || []).map((s) => ({
    ...s,
    last_cleaned_on: s.last_cleaned_on || latestCleanedMap.get(s.id) || null,
  }));

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites: enhancedSites,
    rules: rulesRes.data || [],
    teams: teamsRes.data || [],
  });

  console.log("Total sites:", enhancedSites.length);
  console.log("Total required visits:", result.auditReport.total_required_visits);
  console.log("Total scheduled visits:", result.proposedVisits.length);
  console.log("Total unscheduled visits:", result.unscheduledSites.length);

  // Group by site
  const siteVisitsMap = new Map<string, number>();
  result.proposedVisits.forEach((pv) => {
    siteVisitsMap.set(pv.site_id, (siteVisitsMap.get(pv.site_id) || 0) + 1);
  });

  console.log("\nVisits per site:");
  enhancedSites.forEach((s) => {
    const count = siteVisitsMap.get(s.id) || 0;
    console.log(`- ${s.name}: ${count} visits (last_cleaned_on: ${s.last_cleaned_on})`);
  });
}

run();
