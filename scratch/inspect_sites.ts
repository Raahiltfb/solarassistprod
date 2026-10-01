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

async function inspect() {
  const { data: sites } = await sb.from("sites").select("id, name, location, latitude, longitude");
  console.log("Total DB sites:", sites?.length);
  sites?.forEach((s) => console.log(`Site: ${s.name.padEnd(40)} | Loc: ${s.location?.padEnd(25)} | Lat: ${s.latitude}, Lng: ${s.longitude}`));
}

inspect();
