const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const envFile = fs.readFileSync(path.join(__dirname, "../frontend/.env.local"), "utf8");
const envVars = {};
envFile.split("\n").forEach(line => {
  const [k, v] = line.split("=");
  if (k && v) envVars[k.trim()] = v.trim().replace(/^"|"$/g, '');
});

const sb = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

async function cleanSlate() {
  console.log("=== CLEAN SLATE UTILITY FOR COURTYARD IVY DEMO ===");
  
  // 1. Get Courtyard Ivy Site
  const { data: sites, error: siteErr } = await sb.from("sites").select("*").ilike("name", "%Courtyard%");
  if (siteErr || !sites || sites.length === 0) {
    console.error("Courtyard Ivy site not found:", siteErr);
    return;
  }

  const site = sites[0];
  console.log(`Target Site: ${site.name} (ID: ${site.id})`);

  // 2. Clean up Work Orders created for testing on Courtyard Ivy
  const { data: wos, error: woErr } = await sb.from("work_orders").delete().eq("site_id", site.id).select();
  console.log(`Cleaned up ${wos?.length || 0} test work orders for Courtyard Ivy.`);

  // 3. Clean up Tickets created for testing on Courtyard Ivy
  const { data: tickets, error: tErr } = await sb.from("tickets").delete().eq("site_id", site.id).select();
  console.log(`Cleaned up ${tickets?.length || 0} test tickets for Courtyard Ivy.`);

  // 4. Clean up synthetic/test Alerts for Courtyard Ivy
  const { data: alerts, error: aErr } = await sb.from("alerts").delete().eq("site_id", site.id).select();
  console.log(`Cleaned up ${alerts?.length || 0} test/synthetic alerts for Courtyard Ivy.`);

  // 5. Clean up test Cleaning Logs for Courtyard Ivy (except preserving last_cleaned_on state)
  const { data: logs, error: lErr } = await sb.from("cleaning_logs").delete().eq("site_id", site.id).select();
  console.log(`Cleaned up ${logs?.length || 0} test cleaning logs for Courtyard Ivy.`);

  // 6. Ensure last_cleaned_on remains 2026-09-14 and next_cleaning_date is 2026-09-29
  const { error: updateErr } = await sb.from("sites").update({
    last_cleaned_on: "2026-09-14",
    next_cleaning_date: "2026-09-29",
    cleaning_cycle_days: 15
  }).eq("id", site.id);

  if (updateErr) {
    console.error("Error restoring site state:", updateErr);
  } else {
    console.log("✓ Site state preserved: last_cleaned_on = '2026-09-14', next_cleaning_date = '2026-09-29'");
  }

  console.log("=== CLEAN SLATE COMPLETE — READY FOR DEMO ===");
}

cleanSlate().catch(console.error);
