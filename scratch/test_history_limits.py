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

inv_id = "1308675217950723534"
inv_sn = "110690218030009"

dates_to_test = ["2026-01-01", "2025-08-20", "2024-08-20", "2023-08-20"]

for dt in dates_to_test:
    res = adapter._call_solis("/v1/api/inverterDay", {
        "id": inv_id,
        "sn": inv_sn,
        "money": "INR",
        "time": dt,
        "timeZone": 5.5
    })
    print(f"Date: {dt} | Code: {res.get('code')} | Msg: {res.get('msg')} | Count: {len(res.get('data', [])) if isinstance(res.get('data'), list) else type(res.get('data'))}")
