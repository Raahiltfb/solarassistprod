import { createClient } from "@supabase/supabase-js";
import fs from "fs";

let url = "", key = "";
const envStr = fs.readFileSync("frontend/.env.local", "utf-8");
envStr.split("\n").forEach(line => {
  if (line.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) url = line.split("=")[1].trim().replace(/['"]/g, "");
  if (line.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) key = line.split("=")[1].trim().replace(/['"]/g, "");
  if (!key && line.startsWith("NEXT_PUBLIC_SUPABASE_ANON_KEY=")) key = line.split("=")[1].trim().replace(/['"]/g, "");
});

const sb = createClient(url, key);

async function check() {
  const { data: visits } = await sb.from("cleaning_visits").select("id, scheduled_date, assigned_team_id, sites(name)").eq("cycle_period", "2026-10");
  console.log("Total visits in Oct:", visits?.length);
  const byDateTeam: Record<string, number> = {};
  visits?.forEach(v => {
    const k = `${v.scheduled_date} | team:${v.assigned_team_id}`;
    byDateTeam[k] = (byDateTeam[k] || 0) + 1;
  });
  console.log("Visits breakdown by date and team:", byDateTeam);
}

check();
