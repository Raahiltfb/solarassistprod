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

stations = adapter.list_stations()

for s in stations:
    if s.name in ["Bwssb WTP Bangalore", "Ivy by courtyard", "Crestia Solar"]:
        print(f"\n=================== Station: {s.name} ===================")
        res = adapter._call_solis("/v1/api/inverterList", {"stationId": s.plant_id, "pageNo": 1, "pageSize": 100})
        records = res.get("data", {}).get("page", {}).get("records", [])
        for r in records:
            print(f"\nInverter SN: {r.get('sn')}")
            for k, v in sorted(r.items()):
                print(f"  {k}: {v}")
