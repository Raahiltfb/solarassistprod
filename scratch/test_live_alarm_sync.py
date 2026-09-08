import os
import sys
import json
sys.path.append(os.path.join(os.getcwd(), "backend"))

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv("backend/.env")

from sync_service import poll_and_sync_all
from supabase import create_client

url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
sb = create_client(url, key)

print("Starting poll_and_sync_all execution...")
summary = poll_and_sync_all(trigger_source="manual_test")
print("Sync Summary:", json.dumps(summary, indent=2))

print("\n--- OPEN/ACTIVE ALERTS IN DATABASE AFTER SYNC ---")
open_alerts = sb.from_("alerts").select("*, sites(name)").eq("status", "open").order("triggered_at", desc=True).execute()
print(f"Total Open Alerts in DB: {len(open_alerts.data or [])}")
for a in (open_alerts.data or []):
    site_name = a.get("sites", {}).get("name") if a.get("sites") else "Unknown"
    print(f"  Site: {site_name:<25} | Code: {a.get('code'):<8} | Title: {a.get('title'):<30} | Triggered: {a.get('triggered_at')}")

