import os
import sys
import json
sys.path.append(os.path.join(os.getcwd(), "backend"))

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv("backend/.env")

from adapters.solis import SolisAdapter
from supabase import create_client

url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

sb = create_client(url, key)

# Get all inverters and site OEM device IDs / station IDs
inverters_res = sb.from_("inverters").select("id, site_id, oem_device_id, serial_number, sites(id, name, location)").execute()
inverters = inverters_res.data or []

key_id = os.getenv("SOLIS_KEY_ID")
key_secret = os.getenv("SOLIS_KEY_SECRET")
api_url = os.getenv("SOLIS_API_URL")

adapter = SolisAdapter(key_id=key_id, key_secret=key_secret, api_url=api_url)

station_map = {}
for inv in inverters:
    site = inv.get("sites") or {}
    # Let's get station IDs for site
    site_id = inv.get("site_id")
    # We can fetch station IDs using userStationList or from saved plant_id
    # Let's call userStationList to map stationId to site
    
user_stations_res = adapter._call_solis("/v1/api/userStationList", {"pageNo": "1", "pageSize": "100"})
stations = user_stations_res.get("data", {}).get("page", {}).get("records", [])

print(f"Found {len(stations)} Solis Stations/Plants:")
for st in stations:
    st_id = str(st.get("id"))
    st_name = st.get("stationName")
    print(f"\n--- Station: {st_name} (ID: {st_id}) ---")
    
    # Test different state payloads
    test_cases = [
        ("No state field", {}),
        ("state=0 (int)", {"state": 0}),
        ("state=1 (int)", {"state": 1}),
        ("state=2 (int)", {"state": 2}),
        ("state='0' (str)", {"state": "0"}),
        ("state='1' (str)", {"state": "1"}),
        ("state='2' (str)", {"state": "2"}),
    ]
    
    for label, extra in test_cases:
        body = {
            "pageNo": "1",
            "pageSize": "100",
            "stationId": st_id,
            **extra
        }
        res = adapter._call_solis("/v1/api/alarmList", body)
        code = res.get("code")
        records = res.get("data", {}).get("records", []) if res.get("data") else []
        
        # Check active vs resolved in returned records
        # Record state values: '0', '1', '2'?
        states_in_recs = set(r.get("state") for r in records) if records else set()
        active_recs = [r for r in records if r.get("state") in [0, "0", 0.0] or r.get("alarmEndTime") is None or r.get("alarmEndTime") == 0]
        
        print(f"  {label:<20} -> Code: {code} | Records: {len(records)} | Unique 'state' values in records: {states_in_recs}")
        if active_recs:
            print(f"    *** ACTIVE ALARMS FOUND in this payload! Count: {len(active_recs)} ***")
            for a in active_recs:
                print(f"        Code: {a.get('alarmCode')} | Msg: {a.get('alarmMsg')} | Begin: {a.get('alarmBeginTime')} | End: {a.get('alarmEndTime')} | State: {a.get('state')}")
        elif records and label == "No state field":
            print(f"    Sample record 'state' field: {records[0].get('state')} | begin: {records[0].get('alarmBeginTime')} | end: {records[0].get('alarmEndTime')}")

