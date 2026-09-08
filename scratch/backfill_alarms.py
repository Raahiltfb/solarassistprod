import os
import sys
import time
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv

sys.path.append(os.path.join(os.getcwd(), "backend"))

load_dotenv(".env")
load_dotenv("backend/.env")

from adapters.solis import SolisAdapter

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Missing Supabase credentials.")
    sys.exit(1)

adapter = SolisAdapter(
    key_id=os.getenv("SOLIS_KEY_ID"),
    key_secret=os.getenv("SOLIS_KEY_SECRET"),
    api_url=os.getenv("SOLIS_API_URL")
)


def supabase_select(table: str, params: dict = None):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}"
    }
    for attempt in range(3):
        try:
            res = requests.get(url, headers=headers, params=params, timeout=30)
            if res.status_code == 200:
                return res.json()
            else:
                print(f"Supabase Select Error ({res.status_code}): {res.text}")
                return []
        except Exception as e:
            print(f"  Connection attempt {attempt+1} failed: {e}")
            time.sleep(2)
    return []


def supabase_insert(table: str, rows: list):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    for attempt in range(3):
        try:
            res = requests.post(url, headers=headers, json=rows, timeout=30)
            if res.status_code in (200, 201):
                return res.json()
            else:
                print(f"Supabase Insert Error ({res.status_code}): {res.text}")
                return []
        except Exception as e:
            print(f"  Connection attempt {attempt+1} failed: {e}")
            time.sleep(2)
    return []


def backfill_alarms():
    print("Fetching sites and inverters from Supabase...")
    sites = supabase_select("sites", {"select": "id,org_id,name"})
    inverters = supabase_select("inverters", {"select": "id,oem_device_id,serial_number,site_id"})
    
    # Map inverter IDs and SNs
    inv_map = {inv["serial_number"]: inv["id"] for inv in inverters}
    oem_inv_map = {inv["oem_device_id"]: inv["id"] for inv in inverters}
    site_org_map = {s["id"]: s["org_id"] for s in sites}
    
    processed_stations = set()
    total_inserted = 0
    
    for idx, inv in enumerate(inverters, start=1):
        oem_device_id = inv["oem_device_id"]
        site_id = inv["site_id"]
        org_id = site_org_map.get(site_id)
        
        print(f"\n[{idx}/{len(inverters)}] Resolving station for Inverter SN: {inv['serial_number']} (OEM ID: {oem_device_id})...")
        time.sleep(0.5)
        
        detail_res = adapter._call_solis("/v1/api/inverterDetail", {"id": oem_device_id})
        if detail_res.get("code") != "0":
            print(f"  Failed to fetch inverter details: {detail_res.get('msg')}")
            continue
            
        station_id = detail_res.get("data", {}).get("stationId")
        if not station_id:
            print("  Station ID not found in inverter details.")
            continue
            
        station_id = str(station_id)
        if station_id in processed_stations:
            print(f"  Station ID {station_id} already processed. Skipping.")
            continue
            
        processed_stations.add(station_id)
        print(f"  Discovered Station ID: {station_id}. Auditing alarms...")
        
        # Fetch existing alerts for this site to prevent duplicates
        existing_alerts = supabase_select("alerts", {
            "select": "code,triggered_at",
            "site_id": f"eq.{site_id}"
        })
        existing_keys = set((a.get("code"), a.get("triggered_at")) for a in existing_alerts)
        
        page = 1
        records_to_insert = []
        
        while True:
            body = {
                "pageNo": str(page),
                "pageSize": "100",
                "stationId": int(station_id),
            }
            res = adapter._call_solis("/v1/api/alarmList", body)
            if res.get("code") != "0":
                print(f"    API Error on alarmList: {res.get('msg')}")
                break
                
            data = res.get("data", {})
            records = data.get("records", []) if isinstance(data, dict) else []
            if not records:
                break
                
            for alarm in records:
                code = str(alarm.get("alarmCode") or "")
                alarm_begin = alarm.get("alarmBeginTime")
                if not code or not alarm_begin:
                    continue
                    
                triggered_at = datetime.fromtimestamp(int(alarm_begin)/1000, tz=timezone.utc).isoformat()
                
                # Duplicate check
                if (code, triggered_at) in existing_keys:
                    continue
                    
                alarm_end = alarm.get("alarmEndTime")
                resolved_at = datetime.fromtimestamp(int(alarm_end)/1000, tz=timezone.utc).isoformat() if alarm_end else None
                
                state_val = str(alarm.get("state"))
                status = "resolved" if (state_val == "2" or resolved_at) else "active"
                
                device_sn = alarm.get("alarmDeviceSn")
                device_oem_id = str(alarm.get("alarmDeviceId") or "")
                
                # Map to database inverter ID
                target_inverter_id = inv_map.get(device_sn) or oem_inv_map.get(device_oem_id)
                
                lvl = str(alarm.get("alarmLevel") or "1")
                if lvl == "3":
                    severity = "critical"
                elif lvl == "2":
                    severity = "high"
                elif lvl == "1":
                    severity = "medium"
                else:
                    severity = "low"
                    
                alerts_row = {
                    "org_id": org_id,
                    "site_id": site_id,
                    "inverter_id": target_inverter_id,
                    "code": code,
                    "alarm_code": code,
                    "title": alarm.get("alarmMsg") or "Fault Detected",
                    "description": alarm.get("advice") or alarm.get("alarmMsg") or "",
                    "severity": severity,
                    "status": status,
                    "triggered_at": triggered_at,
                    "resolved_at": resolved_at,
                    "oem": "solis",
                    "is_auto_resolvable": True
                }
                
                records_to_insert.append(alerts_row)
                existing_keys.add((code, triggered_at))
                
            if len(records) < 100:
                break
            page += 1
            time.sleep(0.2)
            
        print(f"  Identified {len(records_to_insert)} new alarms to insert for Station {station_id}.")
        
        if records_to_insert:
            batch_size = 100
            for i in range(0, len(records_to_insert), batch_size):
                chunk = records_to_insert[i:i+batch_size]
                inserted = supabase_insert("alerts", chunk)
                total_inserted += len(inserted)
                
    print(f"\nAlarms backfill complete. Inserted {total_inserted} alerts into database.")


if __name__ == "__main__":
    backfill_alarms()
