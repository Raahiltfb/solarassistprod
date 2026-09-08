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

print("=== 1. TESTING INVERTER HISTORY ENDPOINTS ===")

# A. Inverter Day (Detailed telemetry/power curve for a day)
res_inv_day = adapter._call_solis("/v1/api/inverterDay", {
    "id": inv_id,
    "sn": inv_sn,
    "money": "INR",
    "time": "2026-08-21",
    "timeZone": 5.5
})
print("inverterDay Code:", res_inv_day.get("code"), "| Msg:", res_inv_day.get("msg"))
if res_inv_day.get("code") == "0":
    data = res_inv_day.get("data", [])
    print(f"  Count: {len(data)}")
    if data:
        print("  Sample keys:", sorted(data[0].keys()) if isinstance(data[0], dict) else type(data[0]))
        print("  Sample point:", data[0])

# B. Inverter Month (Daily values for a month)
res_inv_month = adapter._call_solis("/v1/api/inverterMonth", {
    "id": inv_id,
    "sn": inv_sn,
    "money": "INR",
    "month": "2026-08",
    "timeZone": 5.5
})
print("inverterMonth Code:", res_inv_month.get("code"), "| Msg:", res_inv_month.get("msg"))
if res_inv_month.get("code") == "0":
    data = res_inv_month.get("data", [])
    print(f"  Count: {len(data)}")
    if data:
        print("  Sample keys:", sorted(data[0].keys()) if isinstance(data[0], dict) else type(data[0]))
        print("  Sample point:", data[0])

# C. Inverter Year (Monthly values for a year)
res_inv_year = adapter._call_solis("/v1/api/inverterYear", {
    "id": inv_id,
    "sn": inv_sn,
    "money": "INR",
    "year": "2026",
    "timeZone": 5.5
})
print("inverterYear Code:", res_inv_year.get("code"), "| Msg:", res_inv_year.get("msg"))
if res_inv_year.get("code") == "0":
    data = res_inv_year.get("data", [])
    print(f"  Count: {len(data)}")
    if data:
        print("  Sample keys:", sorted(data[0].keys()) if isinstance(data[0], dict) else type(data[0]))
        print("  Sample point:", data[0])

# D. Inverter Lifetime / All (Yearly values for lifetime)
res_inv_lifetime = adapter._call_solis("/v1/api/inverterLifetime", {
    "id": inv_id,
    "sn": inv_sn,
    "money": "INR",
    "timeZone": 5.5
})
print("inverterLifetime Code:", res_inv_lifetime.get("code"), "| Msg:", res_inv_lifetime.get("msg"))
if res_inv_lifetime.get("code") == "0":
    data = res_inv_lifetime.get("data", [])
    print(f"  Count: {len(data)}")
    if data:
        print("  Sample keys:", sorted(data[0].keys()) if isinstance(data[0], dict) else type(data[0]))
        print("  Sample point:", data[0])


print("\n=== 2. TESTING STATION HISTORY ENDPOINTS ===")

# A. Station Day (Power curve for the whole station/site)
res_st_day = adapter._call_solis("/v1/api/stationDay", {
    "id": station_id,
    "money": "INR",
    "time": "2026-08-21",
    "timeZone": 5.5
})
print("stationDay Code:", res_st_day.get("code"), "| Msg:", res_st_day.get("msg"))
if res_st_day.get("code") == "0":
    data = res_st_day.get("data", [])
    print(f"  Count: {len(data)}")
    if data:
        print("  Sample keys:", sorted(data[0].keys()) if isinstance(data[0], dict) else type(data[0]))
        print("  Sample point:", data[0])

# B. Station Month (Daily values for a month)
res_st_month = adapter._call_solis("/v1/api/stationMonth", {
    "id": station_id,
    "money": "INR",
    "month": "2026-08",
    "timeZone": 5.5
})
print("stationMonth Code:", res_st_month.get("code"), "| Msg:", res_st_month.get("msg"))
if res_st_month.get("code") == "0":
    data = res_st_month.get("data", [])
    print(f"  Count: {len(data)}")
    if data:
        print("  Sample keys:", sorted(data[0].keys()) if isinstance(data[0], dict) else type(data[0]))
        print("  Sample point:", data[0])

# C. Station Year (Monthly values for a year)
res_st_year = adapter._call_solis("/v1/api/stationYear", {
    "id": station_id,
    "money": "INR",
    "year": "2026",
    "timeZone": 5.5
})
print("stationYear Code:", res_st_year.get("code"), "| Msg:", res_st_year.get("msg"))
if res_st_year.get("code") == "0":
    data = res_st_year.get("data", [])
    print(f"  Count: {len(data)}")
    if data:
        print("  Sample keys:", sorted(data[0].keys()) if isinstance(data[0], dict) else type(data[0]))
        print("  Sample point:", data[0])

# D. Station Lifetime / All (Yearly values for lifetime)
res_st_lifetime = adapter._call_solis("/v1/api/stationLifetime", {
    "id": station_id,
    "money": "INR",
    "timeZone": 5.5
})
print("stationLifetime Code:", res_st_lifetime.get("code"), "| Msg:", res_st_lifetime.get("msg"))
if res_st_lifetime.get("code") == "0":
    data = res_st_lifetime.get("data", [])
    print(f"  Count: {len(data)}")
    if data:
        print("  Sample keys:", sorted(data[0].keys()) if isinstance(data[0], dict) else type(data[0]))
        print("  Sample point:", data[0])
