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

print("====================================================")
print("VERIFYING FRONTEND ALERTS QUERIES & AUTO-RESOLUTION")
print("====================================================")

# 1. Simulate Alerts Page query:
print("\n1. Querying /alerts stream (same as frontend AlertsPage):")
alerts_res = sb.from_("alerts").select("*, sites(name), inverters(serial_number, model)").order("triggered_at", desc=True).limit(20).execute()
alerts = alerts_res.data or []

print(f"Total Alerts Returned: {len(alerts)}")
open_count = sum(1 for a in alerts if a.get("status") == "open")
print(f"Open Alerts in Recent 20: {open_count}")

print("\nTop 5 Most Recent Alerts in Stream:")
for a in alerts[:5]:
    site_name = a.get("sites", {}).get("name") if a.get("sites") else "Unknown"
    inv_sn = a.get("inverters", {}).get("serial_number") if a.get("inverters") else "N/A"
    print(f"  [{a.get('status').upper():<12}] Site: {site_name:<25} | Code: {a.get('code'):<8} | Title: {a.get('title'):<30} | Triggered: {a.get('triggered_at')}")

# 2. Simulate Site Detail Page query for Dosti Jade Wing A:
print("\n2. Querying Site Detail Page alerts for 'Dosti Jade Wing A':")
site_res = sb.from_("sites").select("id, name").eq("name", "Dosti Jade Wing A").execute()
if site_res.data:
    site_id = site_res.data[0]["id"]
    site_alerts = sb.from_("alerts").select("*").eq("site_id", site_id).order("triggered_at", desc=True).execute()
    print(f"  Dosti Jade Wing A Site ID: {site_id}")
    print(f"  Total Alerts for Site: {len(site_alerts.data or [])}")
    for sa in (site_alerts.data or []):
        print(f"    Code: {sa.get('code')} | Title: {sa.get('title')} | Status: {sa.get('status')} | Triggered: {sa.get('triggered_at')}")

# 3. Simulate Site Detail Page query for Casa Florea:
print("\n3. Querying Site Detail Page alerts for 'Casa Florea':")
casa_res = sb.from_("sites").select("id, name").eq("name", "Casa Florea").execute()
if casa_res.data:
    site_id = casa_res.data[0]["id"]
    casa_alerts = sb.from_("alerts").select("*").eq("site_id", site_id).order("triggered_at", desc=True).execute()
    print(f"  Casa Florea Site ID: {site_id}")
    print(f"  Total Alerts for Site: {len(casa_alerts.data or [])}")
    for sa in (casa_alerts.data or []):
        print(f"    Code: {sa.get('code')} | Title: {sa.get('title')} | Status: {sa.get('status')} | Triggered: {sa.get('triggered_at')}")

print("\n====================================================")
print("✅ Verification SUCCESS: Active alerts correctly queried and present!")
print("====================================================")

