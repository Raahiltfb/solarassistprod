import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

const env = fs.readFileSync("frontend/.env.local", "utf8");
let url = "", key = "";
env.split("\n").forEach(line => {
  if (line.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) url = line.split("=")[1].trim().replace(/['"]/g, "");
  if (line.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) key = line.split("=")[1].trim().replace(/['"]/g, "");
});

const sb = createClient(url, key);

async function verifyAudit() {
  const [visitsRes, sitesRes, rulesRes, assignmentsRes] = await Promise.all([
    sb.from("cleaning_visits").select("*, sites(*)").eq("cycle_period", "2026-10"),
    sb.from("sites").select("*"),
    sb.from("site_cleaning_rules").select("*"),
    sb.from("cleaning_plan_assignments").select("*"),
  ]);

  const visits = visitsRes.data || [];
  const sites = sitesRes.data || [];
  const rules = rulesRes.data || [];
  const assignments = assignmentsRes.data || [];

  console.log("=== OCTOBER 2026 AUDIT REPORT ===");
  console.log("Total DB visits:", visits.length);
  const plannedVisits = visits.filter(v => v.status === "planned" || v.status === "approved" || v.status === "published");
  const unscheduledVisits = visits.filter(v => v.status === "unscheduled");

  console.log("Required visits:", visits.length);
  console.log("Scheduled/Planned visits:", plannedVisits.length);
  console.log("Unscheduled visits:", unscheduledVisits.length);

  // 1. Check duplicate site/date/sequence assignments
  const seenVisits = new Set<string>();
  let duplicateCount = 0;
  visits.forEach(v => {
    const key = `${v.site_id}:${v.cycle_period}:${v.visit_sequence_in_month}`;
    if (seenVisits.has(key)) duplicateCount++;
    seenVisits.add(key);
  });

  // 2. Check 35 sites & 23 physical locations represented
  const siteIdsRepresented = new Set(visits.map(v => v.site_id));
  console.log("Sites represented in schedule:", siteIdsRepresented.size, "/ 35");

  // 3. Check team daily capacity <= 480 mins
  const teamDayWorkload = new Map<string, number>();
  plannedVisits.forEach(v => {
    const key = `${v.assigned_team_id}:${v.scheduled_date}`;
    const mins = (v.estimated_cleaning_mins || 90) + (v.estimated_travel_mins || 0);
    teamDayWorkload.set(key, (teamDayWorkload.get(key) || 0) + mins);
  });

  let maxWorkload = 0;
  let capacityViolations = 0;
  teamDayWorkload.forEach((workload, key) => {
    if (workload > maxWorkload) maxWorkload = workload;
    if (workload > 480) capacityViolations++;
  });
  console.log("Capacity violations (>480m):", capacityViolations, `(Max workload: ${maxWorkload}m)`);

  // 4. Check allowed weekdays & blackout violations
  let weekdayViolations = 0;
  let blackoutViolations = 0;
  const ruleMap = new Map(rules.map(r => [r.site_id, r]));

  plannedVisits.forEach(v => {
    const rule = ruleMap.get(v.site_id);
    if (!rule || !v.scheduled_date) return;
    const [y, m, d] = v.scheduled_date.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const day = dateObj.getDay();
    const isoWk = day === 0 ? 7 : day;

    if (rule.allowed_weekdays && rule.allowed_weekdays.length > 0) {
      if (!rule.allowed_weekdays.includes(isoWk)) weekdayViolations++;
    }
    if (rule.blackout_dates && rule.blackout_dates.includes(v.scheduled_date)) {
      blackoutViolations++;
    }
  });

  console.log("Weekday violations:", weekdayViolations);
  console.log("Blackout violations:", blackoutViolations);

  // 5. Check physical location batching for key clusters
  // Dosti: Dosti Jade Wing A & Dosti Jade Wing B
  const dostiA = sites.find(s => s.name.includes("Dosti Jade Wing A"));
  const dostiB = sites.find(s => s.name.includes("Dosti Jade Wing B"));
  let dostiBatchingViolations = 0;
  if (dostiA && dostiB) {
    for (let seq = 1; seq <= 4; seq++) {
      const vA = visits.find(v => v.site_id === dostiA.id && v.visit_sequence_in_month === seq);
      const vB = visits.find(v => v.site_id === dostiB.id && v.visit_sequence_in_month === seq);
      if (vA && vB && vA.scheduled_date !== vB.scheduled_date) {
        dostiBatchingViolations++;
      }
    }
  }

  // Madhukosh: A1 & A2
  const madhuA1 = sites.find(s => s.name.includes("Madhukosh society A1"));
  const madhuA2 = sites.find(s => s.name.includes("Madhukosh society A2"));
  let madhuBatchingViolations = 0;
  if (madhuA1 && madhuA2) {
    for (let seq = 1; seq <= 3; seq++) {
      const vA1 = visits.find(v => v.site_id === madhuA1.id && v.visit_sequence_in_month === seq);
      const vA2 = visits.find(v => v.site_id === madhuA2.id && v.visit_sequence_in_month === seq);
      if (vA1 && vA2 && vA1.scheduled_date !== vA2.scheduled_date) {
        madhuBatchingViolations++;
      }
    }
  }

  // Garcinia: 11.7 & 37.4
  const garc1 = sites.find(s => s.name.includes("Garcinia 11.7"));
  const garc2 = sites.find(s => s.name.includes("Garcinia 37.4"));
  let garcBatchingViolations = 0;
  if (garc1 && garc2) {
    for (let seq = 1; seq <= 4; seq++) {
      const vG1 = visits.find(v => v.site_id === garc1.id && v.visit_sequence_in_month === seq);
      const vG2 = visits.find(v => v.site_id === garc2.id && v.visit_sequence_in_month === seq);
      if (vG1 && vG2 && vG1.scheduled_date !== vG2.scheduled_date) {
        garcBatchingViolations++;
      }
    }
  }

  console.log("Location batching violations (Dosti, Madhukosh, Garcinia):", dostiBatchingViolations + madhuBatchingViolations + garcBatchingViolations);
  console.log("Duplicate visits:", duplicateCount);

  console.log("\nFINAL VERIFICATION SCOREBOARD:");
  console.log("Required:", visits.length);
  console.log("Scheduled:", plannedVisits.length);
  console.log("Unscheduled:", unscheduledVisits.length);
  console.log("Capacity violations:", capacityViolations);
  console.log("Weekday violations:", weekdayViolations);
  console.log("Blackout violations:", blackoutViolations);
  console.log("Location batching violations:", dostiBatchingViolations + madhuBatchingViolations + garcBatchingViolations);
  console.log("Duplicate visits:", duplicateCount);
}

verifyAudit();
