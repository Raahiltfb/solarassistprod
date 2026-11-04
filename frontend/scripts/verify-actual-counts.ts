import { createClient } from "@supabase/supabase-js";
import { verifyTestEnvironmentSafety, STAGING_PROJECT_REF } from "./scale-test-guard";
import { SEED_IDS } from "./seed";

async function main() {
  const targetUrl = process.env.TEST_SUPABASE_URL || "";
  const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || "";
  verifyTestEnvironmentSafety(targetUrl, true);

  const sb = createClient(targetUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  console.log("=== Staging Post-Seed Row Count & Identity Verification ===");

  // 1. Organizations
  const { data: orgs, count: orgCount } = await sb.from("organizations").select("id, name, slug", { count: "exact" });
  console.log(`\n1. Organizations (${orgCount}):`);
  orgs?.forEach(o => console.log(`   - ${o.slug}: ${o.id} (Matches SEED_IDS: ${Object.values(SEED_IDS.orgs).includes(o.id)})`));

  // 2. Auth Users & Profiles
  const { data: listData } = await sb.auth.admin.listUsers();
  const { data: profiles, count: profCount } = await sb.from("profiles").select("id, email, role, org_id", { count: "exact" });
  console.log(`\n2. Auth Users (${listData.users.length}) & Profiles (${profCount}):`);
  listData.users.forEach(u => {
    console.log(`   - Auth User: ${u.email} | id: ${u.id} | metadata: ${JSON.stringify(u.user_metadata)}`);
  });
  profiles?.forEach(p => {
    console.log(`   - Profile: ${p.email} | role: ${p.role} | org: ${p.org_id}`);
  });

  // 3. Workforce Teams & Members
  const { data: teams, count: teamCount } = await sb.from("technician_teams").select("id, name, org_id", { count: "exact" });
  const { count: memberCount } = await sb.from("technician_team_members").select("*", { count: "exact", head: true });
  console.log(`\n3. Workforce Teams (${teamCount}) & Members (${memberCount}):`);
  teams?.forEach(t => console.log(`   - ${t.name}: ${t.id} (org: ${t.org_id})`));

  // 4. Sites
  const { data: sites, count: siteCount } = await sb.from("sites").select("id, name, org_id, capacity_kwp", { count: "exact" });
  console.log(`\n4. Sites (${siteCount}):`);
  sites?.forEach(s => console.log(`   - ${s.name}: ${s.id} (${s.capacity_kwp} kWp)`));

  // 5. Inverters
  const { count: invCount } = await sb.from("inverters").select("*", { count: "exact", head: true });
  console.log(`\n5. Inverters Count: ${invCount}`);

  // 6. Strings
  const { count: strCount } = await sb.from("strings").select("*", { count: "exact", head: true });
  console.log(`\n6. Strings Count: ${strCount}`);

  // 7. Telemetry
  const { count: telCount } = await sb.from("telemetry").select("*", { count: "exact", head: true });
  console.log(`\n7. Inverter Telemetry Count: ${telCount}`);

  // 8. String Telemetry
  const { count: strTelCount } = await sb.from("string_telemetry").select("*", { count: "exact", head: true });
  console.log(`\n8. String Telemetry Count: ${strTelCount}`);

  // 9. Alerts
  const { data: alerts, count: alertCount } = await sb.from("alerts").select("id, code, title, severity", { count: "exact" });
  console.log(`\n9. Alerts (${alertCount}):`);
  alerts?.forEach(a => console.log(`   - [${a.severity}] ${a.code}: ${a.title} (id: ${a.id})`));

  // 10. Tickets
  const { data: tickets, count: ticketCount } = await sb.from("tickets").select("id, title, priority, status", { count: "exact" });
  console.log(`\n10. Tickets (${ticketCount}):`);
  tickets?.forEach(t => console.log(`   - [${t.priority}] ${t.title} (status: ${t.status}, id: ${t.id})`));

  // 11. Cleaning Rules
  const { count: ruleCount } = await sb.from("site_cleaning_rules").select("*", { count: "exact", head: true });
  console.log(`\n11. Site Cleaning Rules Count: ${ruleCount}`);

  // 12. Cleaning Logs
  const { count: logCount } = await sb.from("cleaning_logs").select("*", { count: "exact", head: true });
  console.log(`\n12. Cleaning Logs Count: ${logCount}`);
}

main().catch(console.error);
