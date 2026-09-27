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
  const { data: teams } = await sb.from("technician_teams").select("*");
  console.log("Teams:", teams);

  const { data: members, error } = await sb.from("technician_team_members").select("*");
  console.log("technician_team_members error:", error);
  console.log("technician_team_members data:", members);
}

main().catch(console.error);
