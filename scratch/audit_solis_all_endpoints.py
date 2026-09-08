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

# Inverter ID: 1308675217950723534, SN: 110690218030009
inv_id = "1308675217950723534"
inv_sn = "110690218030009"
station_id = "1298491919450740665" # Maxima CHS Solar plant

endpoints = [
    ("/v1/api/inverterAll", {"id": inv_id, "sn": inv_sn, "money": "INR", "timeZone": 5.5}),
    ("/v1/api/stationAll", {"id": station_id, "money": "INR", "timeZone": 5.5}),
]

for endpoint, body in endpoints:
    res = adapter._call_solis(endpoint, body)
    print(f"Endpoint: {endpoint} | Code: {res.get('code')} | Msg: {res.get('msg')}")
    if res.get("code") == "0":
        data = res.get("data", [])
        print(f"  Count: {len(data)}")
        if data:
            print("  Sample point:", data[0])
