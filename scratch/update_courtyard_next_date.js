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
  if (sites && sites.length > 0) {
    const site = sites[0];
    const lastCleaned = site.last_cleaned_on || "2026-09-14";
    const cycleDays = site.cleaning_cycle_days || 15;
    const baseDate = new Date(lastCleaned);
    const nextDate = new Date(baseDate.getTime() + cycleDays * 86400_000);
    const nextStr = nextDate.toISOString().slice(0, 10);

    const { error } = await sb.from("sites").update({
      next_cleaning_date: nextStr
    }).eq("id", site.id);

    if (error) console.error("Error updating next_cleaning_date:", error);
    else console.log(`Updated Courtyard site ${site.id} next_cleaning_date to ${nextStr}`);
  }
}

main().catch(console.error);
