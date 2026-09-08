import os
import sys
import json
from datetime import datetime, timezone
sys.path.append(os.path.join(os.getcwd(), "backend"))

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv("backend/.env")

from supabase import create_client

url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
sb = create_client(url, key)

print("--- RECENT SYNC RUNS (Last 15) ---")
sync_runs = sb.from_("sync_runs").select("*").order("started_at", desc=True).limit(15).execute()
for sr in (sync_runs.data or []):
    print(f"ID: {sr.get('id')} | Source: {sr.get('trigger_source')} | Status: {sr.get('status')} | Started: {sr.get('started_at')} | Finished: {sr.get('finished_at')} | Error: {sr.get('error_message')}")

print("\n--- RECENT ALERTS IN DATABASE (Last 15) ---")
alerts = sb.from_("alerts").select("*, sites(name)").order("triggered_at", desc=True).limit(15).execute()
for a in (alerts.data or []):
    site_name = a.get("sites", {}).get("name") if a.get("sites") else "Unknown"
    print(f"Site: {site_name:<25} | Code: {a.get('code'):<8} | Status: {a.get('status'):<12} | Severity: {a.get('severity'):<8} | Triggered: {a.get('triggered_at')} | Resolved: {a.get('resolved_at')}")

print("\n--- CURRENT OPEN/ACTIVE ALERTS IN DATABASE ---")
open_alerts = sb.from_("alerts").select("*, sites(name)").eq("status", "open").order("triggered_at", desc=True).execute()
print(f"Total Open Alerts in DB: {len(open_alerts.data or [])}")
for a in (open_alerts.data or []):
    site_name = a.get("sites", {}).get("name") if a.get("sites") else "Unknown"
    print(f"  Site: {site_name:<25} | Code: {a.get('code'):<8} | Title: {a.get('title'):<30} | Triggered: {a.get('triggered_at')}")

