import os
import sys
import json
import time
sys.path.append(os.path.join(os.getcwd(), "backend"))

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv("backend/.env")

from adapters.solis import SolisAdapter

key_id = os.getenv("SOLIS_KEY_ID")
key_secret = os.getenv("SOLIS_KEY_SECRET")
api_url = os.getenv("SOLIS_API_URL")

adapter = SolisAdapter(key_id=key_id, key_secret=key_secret, api_url=api_url)

sn = "1805090258020049"
oem_id = "1308675217950093373"

print("1. Calling inverterDetail...")
for i in range(5):
    res = adapter._call_solis("/v1/api/inverterDetail", {"id": oem_id, "sn": sn})
    print(f"Attempt {i+1} | Code: {res.get('code')} | Msg: {res.get('msg')}")
    if res.get("code") == "0":
        print("Success! Details keys:", list(res.get("data", {}).keys()))
        print("Sample data:", res.get("data"))
        break
    time.sleep(3)

print("\n2. Calling inverterDay for a specific date...")
date_str = "2026-08-17"
for i in range(5):
    res = adapter._call_solis("/v1/api/inverterDay", {
        "id": oem_id,
        "sn": sn,
        "money": "INR",
        "time": date_str,
        "timeZone": 5.5
    })
    print(f"Attempt {i+1} | Code: {res.get('code')} | Msg: {res.get('msg')}")
    if res.get("code") == "0":
        points = res.get("data", [])
        print(f"Success! Points count: {len(points)}")
        break
    time.sleep(3)
