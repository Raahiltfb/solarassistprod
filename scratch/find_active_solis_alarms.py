import os
import sys
import json
from datetime import datetime, timezone
sys.path.append(os.path.join(os.getcwd(), "backend"))

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv("backend/.env")

from adapters.solis import SolisAdapter
from supabase import create_client

url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
sb = create_client(url, key)

key_id = os.getenv("SOLIS_KEY_ID")
key_secret = os.getenv("SOLIS_KEY_SECRET")
api_url = os.getenv("SOLIS_API_URL")
adapter = SolisAdapter(key_id=key_id, key_secret=key_secret, api_url=api_url)

user_stations_res = adapter._call_solis("/v1/api/userStationList", {"pageNo": "1", "pageSize": "100"})
stations = user_stations_res.get("data", {}).get("page", {}).get("records", [])

all_records = []
active_alarms = []

print(f"Scanning {len(stations)} stations for alarms...")

for st in stations:
    st_id = str(st.get("id"))
    st_name = st.get("stationName")
    
    # Fetch alarms WITHOUT state parameter
    body = {
        "pageNo": "1",
        "pageSize": "100",
        "stationId": st_id
    }
    res = adapter._call_solis("/v1/api/alarmList", body)
    recs = res.get("data", {}).get("records", []) if res.get("data") else []
    
    for r in recs:
        r["_station_name"] = st_name
        all_records.append(r)
        
        # Check active criteria: alarmEndTime missing/0/None, OR state == 0/1/'0'/'1', or state != 2/'2'
        end_time = r.get("alarmEndTime")
        state_val = str(r.get("state"))
        
        if not end_time or end_time == 0 or state_val in ["0", "1"]:
            active_alarms.append(r)

print(f"\nTotal Alarm Records Fetched across all stations (without state parameter): {len(all_records)}")
print(f"Total Active Alarms Found: {len(active_alarms)}")

print("\n--- ACTIVE ALARMS DETAILS ---")
for a in active_alarms:
    begin_ts = a.get("alarmBeginTime")
    begin_str = datetime.fromtimestamp(begin_ts/1000, tz=timezone.utc).isoformat() if begin_ts else "N/A"
    end_ts = a.get("alarmEndTime")
    end_str = datetime.fromtimestamp(end_ts/1000, tz=timezone.utc).isoformat() if (end_ts and end_ts > 0) else "Active (No End Time)"
    print(f"Station: {a.get('_station_name')} ({a.get('stationId')})")
    print(f"  Device SN: {a.get('alarmDeviceSn')}")
    print(f"  Code: {a.get('alarmCode')} | Level: {a.get('alarmLevel')} | State: {a.get('state')}")
    print(f"  Msg: {a.get('alarmMsg')}")
    print(f"  Advice: {a.get('advice')}")
    print(f"  Begin: {begin_str} ({begin_ts})")
    print(f"  End: {end_str} ({end_ts})")
    print("-" * 50)

print("\n--- RECENT 10 ALARMS (ANY STATE) ---")
sorted_recs = sorted(all_records, key=lambda x: x.get("alarmBeginTime") or 0, reverse=True)
for a in sorted_recs[:10]:
    begin_ts = a.get("alarmBeginTime")
    begin_str = datetime.fromtimestamp(begin_ts/1000, tz=timezone.utc).isoformat() if begin_ts else "N/A"
    end_ts = a.get("alarmEndTime")
    end_str = datetime.fromtimestamp(end_ts/1000, tz=timezone.utc).isoformat() if (end_ts and end_ts > 0) else "Active"
    print(f"Station: {a.get('_station_name')} | Code: {a.get('alarmCode')} | Msg: {a.get('alarmMsg')} | State: {a.get('state')} | Begin: {begin_str} | End: {end_str}")

