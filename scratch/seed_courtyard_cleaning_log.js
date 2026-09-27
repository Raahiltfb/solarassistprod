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

async function main() {
  const { data: sites } = await sb.from("sites").select("*").ilike("name", "%Courtyard%");
  if (!sites || sites.length === 0) {
    console.error("Courtyard site not found!");
    return;
  }

  const site = sites[0];
  console.log(`Courtyard Site ID: ${site.id}`);

  // 1. Ensure site table has last_cleaned_on set to 2026-09-14
  const { error: siteUpdateErr } = await sb.from("sites").update({
    last_cleaned_on: "2026-09-14",
    next_cleaning_date: "2026-09-29",
    cleaning_cycle_days: 15
  }).eq("id", site.id);

  if (siteUpdateErr) console.error("Error updating site record:", siteUpdateErr);
  else console.log("✓ Site last_cleaned_on set to 2026-09-14");

  // 2. Check if a cleaning_logs entry exists for 2026-09-14
  const { data: existingLogs } = await sb.from("cleaning_logs").select("*").eq("site_id", site.id);
  
  const hasSept14Log = existingLogs && existingLogs.some(l => l.performed_at && l.performed_at.startsWith("2026-09-14"));

  if (!hasSept14Log) {
    const { data: newLog, error: logErr } = await sb.from("cleaning_logs").insert([{
      site_id: site.id,
      performed_at: "2026-09-14T10:00:00+05:30",
      remarks: "Routine solar panel module cleaning completed by Courtyard Ivy Team. Surface dust removed and peak module efficiency verified.",
      client_acknowledged: true,
      client_acknowledged_at: "2026-09-14T11:30:00+05:30"
    }]).select();

    if (logErr) console.error("Error inserting cleaning log:", logErr);
    else console.log("✓ Inserted 14th Sept 2026 cleaning log:", newLog);
  } else {
    console.log("✓ 14th Sept 2026 cleaning log already present.");
  }
}

main().catch(console.error);
