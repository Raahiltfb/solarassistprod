import os
import sys
import requests
from dotenv import load_dotenv

sys.path.append(os.path.join(os.getcwd(), "backend"))
load_dotenv(".env")
load_dotenv("backend/.env")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}"
}

def count_all():
    # 1. Total backfilled telemetry rows
    # Because PostgREST doesn't support complex operators on JSONB easily or count cleanly without count=exact headers, we make requests with Prefer header.
    headers_exact = {**headers, "Prefer": "count=exact"}
    
    # Detailed backfilled rows (contain backfilled:true inside metrics, and ac_power_kw > 0.0)
    # Midday summary records have ac_power_kw = 0.0, so this separates them!
    res_det = requests.get(f"{SUPABASE_URL}/rest/v1/telemetry", headers=headers_exact, params={
        "select": "id",
        "ac_power_kw": "gt.0",
        "metrics->backfilled": "eq.true",
        "limit": "1"
    })
    det_count = res_det.headers.get("Content-Range").split("/")[-1] if res_det.headers.get("Content-Range") else "0"
    
    # Midday summary backfilled rows (contain backfilled:true inside metrics, and ac_power_kw = 0.0)
    res_mid = requests.get(f"{SUPABASE_URL}/rest/v1/telemetry", headers=headers_exact, params={
        "select": "id",
        "ac_power_kw": "eq.0",
        "metrics->backfilled": "eq.true",
        "limit": "1"
    })
    mid_count = res_mid.headers.get("Content-Range").split("/")[-1] if res_mid.headers.get("Content-Range") else "0"
    
    # 2. Total string telemetry records
    res_str = requests.get(f"{SUPABASE_URL}/rest/v1/string_telemetry", headers=headers_exact, params={
        "select": "timestamp",
        "limit": "1"
    })
    str_count = res_str.headers.get("Content-Range").split("/")[-1] if res_str.headers.get("Content-Range") else "0"
    
    # 3. Total backfilled alerts
    res_alt = requests.get(f"{SUPABASE_URL}/rest/v1/alerts", headers=headers_exact, params={
        "select": "id",
        "oem": "eq.solis",
        "limit": "1"
    })
    alt_count = res_alt.headers.get("Content-Range").split("/")[-1] if res_alt.headers.get("Content-Range") else "0"
    
    # 4. Total Inverters count
    res_inv = requests.get(f"{SUPABASE_URL}/rest/v1/inverters", headers=headers_exact, params={
        "select": "id",
        "limit": "1"
    })
    inv_count = res_inv.headers.get("Content-Range").split("/")[-1] if res_inv.headers.get("Content-Range") else "0"
    
    print("Database Parity & Verification Audit:")
    print(f"  Historical Midday Summary Records: {mid_count}")
    print(f"  Detailed 5-minute Telemetry Records (AC, MPPT): {det_count}")
    print(f"  String Telemetry Records: {str_count}")
    print(f"  Historical Alarms/Alerts: {alt_count}")
    print(f"  Total Inverters: {inv_count}")

if __name__ == "__main__":
    count_all()
