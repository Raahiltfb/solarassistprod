import os
import sys
import json
sys.path.append(os.path.join(os.getcwd(), "backend"))

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv("backend/.env")

from adapters.solis import SolisAdapter

key_id = os.getenv("SOLIS_KEY_ID")
key_secret = os.getenv("SOLIS_KEY_SECRET")
api_url = os.getenv("SOLIS_API_URL")

adapter = SolisAdapter(key_id=key_id, key_secret=key_secret, api_url=api_url)

station_id = "1298491919450740665" # Maxima CHS Solar plant

# Try different state parameters for alarmList
# 0 = active, 1 = resolved, -1 = all? Or try omitting it.
states_to_test = [0, 1, -1, None]

for state in states_to_test:
    body = {
        "pageNo": "1",
        "pageSize": "100",
        "stationId": int(station_id),
    }
    if state is not None:
        body["state"] = state
        
    res = adapter._call_solis("/v1/api/alarmList", body)
    code = res.get("code")
    msg = res.get("msg")
    records = res.get("data", {}).get("records", []) if res.get("data") else []
    print(f"State: {state} | Code: {code} | Msg: {msg} | Records Count: {len(records)}")
    if records:
        print(f"  Sample Record Keys: {list(records[0].keys())}")
        print(f"  Sample Record: {records[0]}")
