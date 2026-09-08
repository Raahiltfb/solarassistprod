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

print(f"Auditing alarmList endpoint across all {len(stations)} stations...\n")

active_alarms_with_state_0 = {}
active_alarms_without_state = {}

for st in stations:
    st_id = str(st.get("id"))
    st_name = st.get("stationName")
    
    # Method A: state = 0
    res_state0 = adapter._call_solis("/v1/api/alarmList", {"pageNo": "1", "pageSize": "100", "stationId": st_id, "state": 0})
    recs_state0 = res_state0.get("data", {}).get("records", []) if res_state0.get("data") else []
    
    # Method B: no state filter
    res_nostate = adapter._call_solis("/v1/api/alarmList", {"pageNo": "1", "pageSize": "100", "stationId": st_id})
    recs_nostate = res_nostate.get("data", {}).get("records", []) if res_nostate.get("data") else []
    active_nostate = [r for r in recs_nostate if str(r.get("state")) in ["0", "1"]]
    
    active_alarms_with_state_0[st_name] = recs_state0
    active_alarms_without_state[st_name] = active_nostate

print(f"{'Station Name':<30} | {'Active (state=0)':<18} | {'Active (no state filter)':<25}")
print("-" * 80)

all_station_names = set(active_alarms_with_state_0.keys()) | set(active_alarms_without_state.keys())
for st_name in sorted(all_station_names):
    c1 = len(active_alarms_with_state_0.get(st_name, []))
    c2 = len(active_alarms_without_state.get(st_name, []))
    diff = "" if c1 == c2 else f"  ⚠️ MISMATCH (state=0 has {c1}, no state has {c2})"
    print(f"{st_name:<30} | {c1:<18} | {c2:<25}{diff}")

print("\n--- DETAILED MISMATCH ANALYSIS ---")
for st_name in sorted(all_station_names):
    list1 = active_alarms_with_state_0.get(st_name, [])
    list2 = active_alarms_without_state.get(st_name, [])
    if len(list1) != len(list2):
        print(f"\nStation: {st_name}")
        print("  From state=0:")
        for r in list1:
            print(f"    Code: {r.get('alarmCode')} | Msg: {r.get('alarmMsg')} | State: {r.get('state')} | Begin: {r.get('alarmBeginTime')}")
        print("  From no state filter (first 100):")
        for r in list2:
            print(f"    Code: {r.get('alarmCode')} | Msg: {r.get('alarmMsg')} | State: {r.get('state')} | Begin: {r.get('alarmBeginTime')}")

