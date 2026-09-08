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

def check_counts():
    # 1. Fetch telemetry with backfilled metrics
    url = f"{SUPABASE_URL}/rest/v1/telemetry"
    res = requests.get(url, headers=headers, params={
        "select": "id,timestamp,metrics,current_r_a,voltage_r_v",
        "inverter_id": "eq.e5ba6438-2495-41c8-a048-9e2266038c75", # Inverter 5
        "limit": "5000"
    })
    records = res.json()
    detailed_backfilled = []
    midday_backfilled = []
    
    for r in records:
        metrics = r.get("metrics") or {}
        ts = r["timestamp"]
        # check if it is midday backfill
        is_midday = ts.split("T")[1].startswith("12:00:00")
        
        if metrics.get("backfilled") is True:
            if is_midday:
                midday_backfilled.append(r)
            else:
                detailed_backfilled.append(r)
                
    print("Inverter 1:")
    print("  Midday backfilled summary records count:", len(midday_backfilled))
    print("  Detailed 5-minute backfilled telemetry records count:", len(detailed_backfilled))
    if detailed_backfilled:
        print("  Sample Detailed Record timestamp:", detailed_backfilled[0]["timestamp"])
        print("  Sample Detailed Record parameters (AC, MPPT):")
        print("    voltage_r_v:", detailed_backfilled[0]["voltage_r_v"])
        print("    current_r_a:", detailed_backfilled[0]["current_r_a"])
        print("    metrics (MPPT):", detailed_backfilled[0]["metrics"])
        
    # 2. Check string telemetry
    # Fetch first string ID for Inverter 1
    str_res = requests.get(f"{SUPABASE_URL}/rest/v1/strings", headers=headers, params={
        "inverter_id": "eq.e5ba6438-2495-41c8-a048-9e2266038c75"
    })
    strings = str_res.json()
    if strings:
        str_id = strings[0]["id"]
        # count string telemetry records
        st_res = requests.get(f"{SUPABASE_URL}/rest/v1/string_telemetry", headers=headers, params={
            "select": "timestamp,voltage_v,current_a,power_kw",
            "string_id": f"eq.{str_id}",
            "limit": "100"
        })
        st_records = st_res.json()
        print(f"  String #1 (Index {strings[0]['string_index']}) telemetry records count:", len(st_records))
        if st_records:
            print("  Sample String Telemetry:")
            print("    timestamp:", st_records[0]["timestamp"])
            print("    voltage_v:", st_records[0]["voltage_v"])
            print("    current_a:", st_records[0]["current_a"])
            
    # 3. Check alarms
    headers_with_count = {**headers, "Prefer": "count=exact"}
    alerts_res = requests.get(f"{SUPABASE_URL}/rest/v1/alerts", headers=headers_with_count, params={
        "select": "id",
        "oem": "eq.solis",
        "limit": "1"
    })
    print("\nTotal backfilled Solis alerts in database:", alerts_res.headers.get("Content-Range"))

if __name__ == "__main__":
    check_counts()
