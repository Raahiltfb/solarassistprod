import os
import sys
import json
import hashlib
import hmac
import base64
import requests
from datetime import datetime, timezone

KEY_ID = os.getenv("SOLIS_KEY_ID") or "1300386381678106385"
KEY_SECRET = os.getenv("SOLIS_KEY_SECRET") or "a21fcc244b2f4fe48097ceca92a1c160"
API_URL = os.getenv("SOLIS_API_URL") or "https://www.soliscloud.com:13333"

def call_solis(endpoint, body_dict):
    body = json.dumps(body_dict)
    content_md5 = base64.b64encode(hashlib.md5(body.encode('utf-8')).digest()).decode('utf-8')
    date_str = datetime.now(timezone.utc).strftime('%a, %d %b %Y %H:%M:%S GMT')
    encrypt_str = f"POST\n{content_md5}\napplication/json\n{date_str}\n{endpoint}"
    hmac_obj = hmac.new(KEY_SECRET.encode('utf-8'), encrypt_str.encode('utf-8'), hashlib.sha1)
    sign = base64.b64encode(hmac_obj.digest()).decode('utf-8')
    
    headers = {
        "Content-Type": "application/json", 
        "Content-MD5": content_md5, 
        "Date": date_str, 
        "Authorization": f"API {KEY_ID}:{sign}"
    }
    try:
        res = requests.post(f"{API_URL}{endpoint}", headers=headers, data=body, timeout=20)
        return res.json()
    except Exception as e:
        return {"code": "-1", "msg": str(e)}

def audit():
    print("=== 1. USER STATION LIST ===")
    res_stations = call_solis("/v1/api/userStationList", {"pageNo": 1, "pageSize": 5})
    print("Station List Keys:", res_stations.get("data", {}).get("page", {}).get("records", [])[0].keys() if res_stations.get("data") else "Error")
    station_sample = res_stations.get("data", {}).get("page", {}).get("records", [])[0] if res_stations.get("data") else {}
    print("Station Sample Energy/Yield Fields:", {k: station_sample.get(k) for k in station_sample if "energy" in k.lower() or "power" in k.lower() or "capacity" in k.lower() or "yield" in k.lower() or "day" in k.lower() or "all" in k.lower() or "full" in k.lower()})

    station_id = station_sample.get("id")
    print(f"\n=== 2. STATION DETAIL (ID: {station_id}) ===")
    res_st_detail = call_solis("/v1/api/stationDetail", {"id": station_id})
    print(json.dumps(res_st_detail, indent=2)[:1000])

    print(f"\n=== 3. INVERTER LIST (Station ID: {station_id}) ===")
    res_inv_list = call_solis("/v1/api/inverterList", {"stationId": station_id, "pageNo": 1, "pageSize": 10})
    inv_records = res_inv_list.get("data", {}).get("page", {}).get("records", [])
    print(f"Found {len(inv_records)} inverters.")
    if inv_records:
        inv_sample = inv_records[0]
        print("Inverter List Sample Keys:", inv_sample.keys())
        inv_id = inv_sample.get("id")
        inv_sn = inv_sample.get("sn")
        
        print(f"\n=== 4. INVERTER DETAIL (Inverter ID: {inv_id}, SN: {inv_sn}) ===")
        res_inv_detail = call_solis("/v1/api/inverterDetail", {"id": inv_id, "sn": inv_sn})
        inv_data = res_inv_detail.get("data", {})
        print("Inverter Detail Data Keys:", list(inv_data.keys()))
        print("Inverter Energy/Yield Fields:", {k: inv_data.get(k) for k in inv_data if "energy" in k.lower() or "power" in k.lower() or "today" in k.lower() or "total" in k.lower() or "etotal" in k.lower() or "etoday" in k.lower() or "full" in k.lower() or "unit" in k.lower()})
        print("Inverter Strings Fields:", {k: inv_data.get(k) for k in inv_data if "upv" in k.lower() or "ipv" in k.lower() or "dcinputtype" in k.lower() or "pow" in k.lower()})

        # Test Historical endpoints if available
        today_str = datetime.now().strftime("%Y-%m-%d")
        month_str = datetime.now().strftime("%Y-%m")
        year_str = datetime.now().strftime("%Y")

        print("\n=== 5. TESTING INVERTER DAY / MONTH / YEAR API ENDPOINTS ===")
        res_inv_day = call_solis("/v1/api/inverterDay", {"id": inv_id, "sn": inv_sn, "money": "RMB", "time": today_str, "timeZone": 8})
        print("inverterDay Code:", res_inv_day.get("code"), "| Data count:", len(res_inv_day.get("data", [])) if isinstance(res_inv_day.get("data"), list) else type(res_inv_day.get("data")))
        if res_inv_day.get("data") and isinstance(res_inv_day.get("data"), list) and len(res_inv_day.get("data")) > 0:
            print("inverterDay Sample Point:", res_inv_day.get("data")[0])

        res_inv_month = call_solis("/v1/api/inverterMonth", {"id": inv_id, "sn": inv_sn, "money": "RMB", "month": month_str, "timeZone": 8})
        print("inverterMonth Code:", res_inv_month.get("code"), "| Data count:", len(res_inv_month.get("data", [])) if isinstance(res_inv_month.get("data"), list) else type(res_inv_month.get("data")))

        res_st_day = call_solis("/v1/api/stationDay", {"id": station_id, "money": "RMB", "time": today_str, "timeZone": 8})
        print("stationDay Code:", res_st_day.get("code"), "| Data count:", len(res_st_day.get("data", [])) if isinstance(res_st_day.get("data"), list) else type(res_st_day.get("data")))

if __name__ == "__main__":
    audit()
