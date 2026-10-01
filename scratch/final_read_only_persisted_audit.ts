import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import { buildGeographicClusters, haversineDistanceKm } from "../frontend/lib/cleaning-scheduler";

const env = fs.readFileSync("frontend/.env.local", "utf8");
let url = "", key = "";
env.split("\n").forEach(line => {
  if (line.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) url = line.split("=")[1].trim().replace(/['"]/g, "");
  if (line.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) key = line.split("=")[1].trim().replace(/['"]/g, "");
});

const sb = createClient(url, key);

async function runReadOnlyVerification() {
  console.log("=== EXECUTING FINAL READ-ONLY PERSISTED DATABASE AUDIT FOR OCTOBER 2026 ===");

  const [visitsRes, sitesRes, rulesRes, teamsRes] = await Promise.all([
    sb.from("cleaning_visits").select("*, sites(*), technician_teams(*)").eq("cycle_period", "2026-10").order("scheduled_date", { ascending: true }),
    sb.from("sites").select("*").order("name"),
    sb.from("site_cleaning_rules").select("*"),
    sb.from("technician_teams").select("*"),
  ]);

  const visits = visitsRes.data || [];
  const sites = sitesRes.data || [];
  const rules = rulesRes.data || [];
  const teams = teamsRes.data || [];

  const ruleMap = new Map(rules.map(r => [r.site_id, r]));
  const teamMap = new Map(teams.map(t => [t.id, t]));

  // Build physical location clusters
  const clusters = buildGeographicClusters(sites);

  console.log(`Loaded ${visits.length} persisted cleaning visits across ${sites.length} sites and ${clusters.length} physical locations.\n`);

  // 1. Overall counts check
  const scheduledVisits = visits.filter(v => v.status === "planned" || v.status === "approved" || v.status === "published");
  const unscheduledVisits = visits.filter(v => v.status === "unscheduled");
  const sitesRepresented = new Set(visits.map(v => v.site_id));

  let invariantFailures: string[] = [];

  if (visits.length !== 117) invariantFailures.push(`Total required visits is ${visits.length}, expected 117.`);
  if (scheduledVisits.length !== 117) invariantFailures.push(`Scheduled visits is ${scheduledVisits.length}, expected 117.`);
  if (unscheduledVisits.length !== 0) invariantFailures.push(`Unscheduled visits is ${unscheduledVisits.length}, expected 0.`);
  if (sitesRepresented.size !== 35) invariantFailures.push(`Sites represented is ${sitesRepresented.size}, expected 35.`);

  // 2. Check for duplicate site/cycle assignments & null fields
  const seenSeq = new Set<string>();
  visits.forEach(v => {
    const seqKey = `${v.site_id}:${v.visit_sequence_in_month}`;
    if (seenSeq.has(seqKey)) {
      invariantFailures.push(`Duplicate visit sequence for site ${v.site_id} seq ${v.visit_sequence_in_month}`);
    }
    seenSeq.add(seqKey);

    if (!v.scheduled_date) invariantFailures.push(`Visit ${v.id} missing scheduled_date`);
    if (!v.assigned_team_id) invariantFailures.push(`Visit ${v.id} missing assigned_team_id`);
  });

  // 3. Team Daily Workload Check (Max 480m)
  const teamDayWorkloads = new Map<string, { workload: number; sites: string[]; teamName: string; date: string }>();

  visits.forEach(v => {
    if (!v.assigned_team_id || !v.scheduled_date) return;
    const key = `${v.assigned_team_id}:${v.scheduled_date}`;
    const entry = teamDayWorkloads.get(key) || {
      workload: 0,
      sites: [],
      teamName: v.technician_teams?.name || v.assigned_team_id,
      date: v.scheduled_date,
    };
    const cleaningMins = v.estimated_cleaning_mins || 90;
    const travelMins = v.estimated_travel_mins || 0;
    entry.workload += (cleaningMins + travelMins);
    entry.sites.push(v.sites?.name || v.site_id);
    teamDayWorkloads.set(key, entry);
  });

  let maxWorkload = 0;
  let maxWorkloadKey = "";
  teamDayWorkloads.forEach((data, key) => {
    if (data.workload > maxWorkload) {
      maxWorkload = data.workload;
      maxWorkloadKey = key;
    }
    if (data.workload > 480) {
      invariantFailures.push(`Team-Day ${data.teamName} on ${data.date} workload ${data.workload}m exceeds 480m limit.`);
    }
  });

  // 4. Weekday & Blackout Constraints Check
  visits.forEach(v => {
    if (!v.scheduled_date) return;
    const rule = ruleMap.get(v.site_id);
    if (!rule) return;

    const [y, m, d] = v.scheduled_date.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const day = dateObj.getDay();
    const isoWk = day === 0 ? 7 : day;

    if (rule.allowed_weekdays && rule.allowed_weekdays.length > 0 && !rule.allowed_weekdays.includes(isoWk)) {
      invariantFailures.push(`Site ${v.sites?.name} scheduled on ${v.scheduled_date} (ISO weekday ${isoWk}) violating allowed_weekdays ${rule.allowed_weekdays.join(",")}`);
    }
    if (rule.blackout_dates && rule.blackout_dates.includes(v.scheduled_date)) {
      invariantFailures.push(`Site ${v.sites?.name} scheduled on blackout date ${v.scheduled_date}`);
    }
  });

  // 5. Detailed Physical Location Audit
  console.log("=== PHYSICAL LOCATION AUDIT BREAKDOWN ===");
  const distinctLocVisitDates = new Set<string>();
  const distinctTeamDays = new Set<string>(teamDayWorkloads.keys());

  clusters.forEach((cluster, idx) => {
    const clusterSites = cluster.sites;
    const clusterSiteIds = new Set(clusterSites.map(s => s.id));
    const clusterVisits = visits.filter(v => clusterSiteIds.has(v.site_id));

    // Group cluster visits by visit_sequence_in_month
    const cycleMap = new Map<number, typeof visits>();
    clusterVisits.forEach(v => {
      const seqVisits = cycleMap.get(v.visit_sequence_in_month) || [];
      seqVisits.push(v);
      cycleMap.set(v.visit_sequence_in_month, seqVisits);
    });

    console.log(`\nLocation ${idx + 1}: ${cluster.cluster_name} (${clusterSites.length} sites, ${cycleMap.size} cycles)`);
    console.log(`Sites: ${clusterSites.map(s => s.name).join(", ")}`);

    let totalLocCleaningMins = 0;

    cycleMap.forEach((cVisits, seq) => {
      const dates = Array.from(new Set(cVisits.map(v => v.scheduled_date)));
      const teamsAssigned = Array.from(new Set(cVisits.map(v => v.technician_teams?.name || v.assigned_team_id)));
      const cycleCleaningMins = cVisits.reduce((sum, v) => sum + (v.estimated_cleaning_mins || 90), 0);
      const cycleTravelMins = cVisits.reduce((sum, v) => sum + (v.estimated_travel_mins || 0), 0);
      const cycleWorkload = cycleCleaningMins + cycleTravelMins;
      totalLocCleaningMins += cycleWorkload;

      dates.forEach(d => distinctLocVisitDates.add(`${cluster.cluster_id}:${d}`));

      console.log(`  - Cycle ${seq}: Date(s): [${dates.join(", ")}], Team(s): [${teamsAssigned.join(", ")}], Workload: ${cycleWorkload}m (Clean: ${cycleCleaningMins}m, Travel: ${cycleTravelMins}m), Visits: ${cVisits.length}`);

      // Check single-date & single-team batching invariant for cycle workload <= 480m
      if (cycleWorkload <= 480) {
        if (dates.length > 1) {
          invariantFailures.push(`Location ${cluster.cluster_name} Cycle ${seq} workload ${cycleWorkload}m <= 480m but split across dates: ${dates.join(", ")}`);
        }
        if (teamsAssigned.length > 1) {
          invariantFailures.push(`Location ${cluster.cluster_name} Cycle ${seq} assigned to multiple teams on same cycle: ${teamsAssigned.join(", ")}`);
        }
      }
    });

    // Special checks for focus locations
    const clusterNameLower = cluster.cluster_name.toLowerCase();

    if (clusterNameLower.includes("dosti")) {
      cycleMap.forEach((cVisits, seq) => {
        const dates = new Set(cVisits.map(v => v.scheduled_date));
        if (dates.size > 1) invariantFailures.push(`Dosti Jade Cycle ${seq} split across dates: ${Array.from(dates).join(", ")}`);
      });
    } else if (clusterNameLower.includes("madhukosh")) {
      cycleMap.forEach((cVisits, seq) => {
        const dates = new Set(cVisits.map(v => v.scheduled_date));
        if (dates.size > 1) invariantFailures.push(`Madhukosh Cycle ${seq} split across dates: ${Array.from(dates).join(", ")}`);
      });
    } else if (clusterNameLower.includes("thakur")) {
      cycleMap.forEach((cVisits, seq) => {
        const dates = new Set(cVisits.map(v => v.scheduled_date));
        if (dates.size > 1) invariantFailures.push(`MK Thakur Cycle ${seq} split across dates: ${Array.from(dates).join(", ")}`);
      });
    } else if (clusterNameLower.includes("garcinia")) {
      cycleMap.forEach((cVisits, seq) => {
        const dates = new Set(cVisits.map(v => v.scheduled_date));
        if (dates.size > 1) invariantFailures.push(`Garcinia Cycle ${seq} split across dates: ${Array.from(dates).join(", ")}`);
      });
    } else if (clusterNameLower.includes("alcove")) {
      cycleMap.forEach((cVisits, seq) => {
        const teamsAssigned = new Set(cVisits.map(v => v.assigned_team_id));
        if (teamsAssigned.size > 1) {
          invariantFailures.push(`Alcove Cycle ${seq} split across multiple teams: ${Array.from(teamsAssigned).join(", ")}`);
        }
      });
    }
  });

  console.log("\n==================================================");
  console.log("FINAL PERSISTED OCTOBER VERIFICATION SUMMARY");
  console.log("==================================================");
  console.log(`Total Visits: ${visits.length}`);
  console.log(`Scheduled Visits: ${scheduledVisits.length}`);
  console.log(`Unscheduled Visits: ${unscheduledVisits.length}`);
  console.log(`Physical Locations: ${clusters.length}`);
  console.log(`Physical Location Service Dates: ${distinctLocVisitDates.size}`);
  console.log(`Team-Days: ${distinctTeamDays.size}`);
  console.log(`Maximum Team-Day Workload: ${maxWorkload}m (${maxWorkloadKey})`);
  console.log(`Invariant Exception Count: ${invariantFailures.length}`);

  if (invariantFailures.length > 0) {
    console.error("\nINVARIANT VIOLATIONS FOUND:");
    invariantFailures.forEach((err, i) => console.error(`  ${i + 1}. ${err}`));
    process.exit(1);
  } else {
    console.log("\nFINAL PERSISTED OCTOBER VERIFICATION: PASS");
  }
}

runReadOnlyVerification();
