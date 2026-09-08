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

# Test multiple inverters and months
test_cases = [
    ("1308675217950723534", "110690218030009", "2026-08"),
    ("1308675217950723534", "110690218030009", "2026-07"),
    ("1308675217949215626", "1805060246080104", "2025-08"),
    ("1308675217949215626", "1805060246080104", "2025-01"),
    ("1308675217950287160", "181100025A290037", "2026-08"),
]

for inv_id, inv_sn, month in test_cases:
    print(f"\n=================== Inv ID: {inv_id} | SN: {inv_sn} | Month: {month} ===================")
    res = adapter._call_solis("/v1/api/inverterMonth", {
        "id": inv_id,
        "sn": inv_sn,
        "money": "INR",
        "month": month,
        "timeZone": 5.5
    })
    if res.get("code") == "0":
        data = res.get("data", [])
        print(f"Total daily records returned: {len(data)}")
        non_zero = [r for r in data if r.get("energy", 0) > 0]
        print(f"Non-zero daily records: {len(non_zero)}")
        if non_zero:
            sample = non_zero[0]
            print("Sample record with energy > 0:")
            for k in ["dateStr", "energy", "energyStr", "energyPec", "fullHour", "money", "moneyStr"]:
                print(f"  {k}: {sample.get(k)}")
            print("Full sample keys:", sorted(sample.keys()))
    else:
        print(f"Error: {res.get('msg')}")
