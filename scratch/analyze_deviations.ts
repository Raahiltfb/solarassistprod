import {
  generateMonthlyCleaningPlan,
  buildGeographicClusters,
  getIsoWeekday,
  haversineDistanceKm,
} from "../frontend/lib/cleaning-scheduler";
import { Site, SiteCleaningRule, TechnicianTeam } from "../frontend/lib/types";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

let envLocalText = "";
try {
  envLocalText = fs.readFileSync(path.join(__dirname, "../frontend/.env.local"), "utf-8");
} catch (e) {}

const envVars: Record<string, string> = {};
envLocalText.split("\n").forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || "";
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    envVars[key] = value;
  }
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || envVars["NEXT_PUBLIC_SUPABASE_URL"] || "https://stg-solarassist.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || envVars["SUPABASE_SERVICE_ROLE_KEY"] || envVars["NEXT_PUBLIC_SUPABASE_ANON_KEY"] || "";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

function parseDateStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

async function analyzeDeviations() {
  const orgId = "c1e566ff-c676-4ceb-a2f1-c904783e2fa5";
  const [sitesRes, rulesRes, teamsRes] = await Promise.all([
    sb.from("sites").select("*").eq("org_id", orgId).order("name"),
    sb.from("site_cleaning_rules").select("*"),
    sb.from("technician_teams").select("*").eq("org_id", orgId).eq("is_active", true),
  ]);

  const sites: Site[] = sitesRes.data ?? [];
  const rules: SiteCleaningRule[] = rulesRes.data ?? [];
  const teams: TechnicianTeam[] = teamsRes.data ?? [];

  const result = generateMonthlyCleaningPlan({
    year: 2026,
    month: 10,
    sites,
    rules,
    teams,
    planningCapacityMins: 480,
  });

  const ruleMap = new Map<string, SiteCleaningRule>();
  rules.forEach((r) => ruleMap.set(r.site_id, r));
  const siteMap = new Map<string, Site>();
  sites.forEach((s) => siteMap.set(s.id, s));

  const clusters = buildGeographicClusters(sites);
  const siteClusterMap = new Map<string, string>();
  clusters.forEach((c) => {
    c.sites.forEach((s) => siteClusterMap.set(s.id, c.cluster_name));
  });

  const scheduled = result.proposedVisits.filter((v) => v.status === "planned");

  const deviations: any[] = [];

  scheduled.forEach((v) => {
    const s = siteMap.get(v.site_id)!;
    const targetObj = parseDateStr(v.target_due_date);
    const schObj = parseDateStr(v.scheduled_date!);
    const diffDays = Math.round((schObj.getTime() - targetObj.getTime()) / 86400000);

    if (Math.abs(diffDays) > 3) {
      const locName = siteClusterMap.get(v.site_id) || s.name;
      deviations.push({
        site_name: s.name,
        target_due_date: v.target_due_date,
        scheduled_date: v.scheduled_date,
        deviation_days: diffDays,
        physical_location: locName,
        team_id: v.assigned_team_id,
        rationale: v.planner_rationale,
      });
    }
  });

  console.log(JSON.stringify(deviations, null, 2));
}

analyzeDeviations();
