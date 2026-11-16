#!/usr/bin/env python3
"""
Backfill historical telemetry for Sungrow / Ratnesh Ispat
Site ID: e8a19f84-877e-4280-b46b-2081bb68428e
OEM PS ID: 1376094
"""

import os
import sys
import json
import time
import requests
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

# Target Supabase credentials
SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE"

# Sungrow credentials
SUNGROW_URL = "https://gateway.isolarcloud.in"
APP_KEY = "B3500A80C94EADF9C52E01D7790A96DD"
SECRET_KEY = "k2a5vg8w7qdua4nqet6rsspnrhsmr3in"
USER_ACCOUNT = "maintain.ispat@ratneshgroup.in"
USER_PASSWORD = "Ratnesh123"
PS_ID = 1376094

SITE_ID = "e8a19f84-877e-4280-b46b-2081bb68428e"

INVERTER_MAPPING = {
    "1376094_1_1_7": {
        "id": "b4ad016c-60f8-4b97-a3ae-06294ba419cf",
        "capacity_kw": 125.0,
        "sn": "A2372112981",
        "model": "SG125CX-P2"
    },
    "1376094_1_1_5": {
        "id": "2bdb63d3-2821-40c6-b27a-f55ca2802d53",
        "capacity_kw": 125.0,
        "sn": "A2353107119",
        "model": "SG125CX-P2"
    },
    "1376094_1_1_3": {
        "id": "a12f9075-d6bb-4b34-ab8c-c35bee303d21",
        "capacity_kw": 100.0,
        "sn": "I23A3100057",
        "model": "SG110CX"
    },
    "1376094_1_2_6": {
        "id": "89c53550-9e7a-4887-8269-36b991a8d6a4",
        "capacity_kw": 125.0,
        "sn": "A2372012262",
        "model": "SG125CX-P2"
    }
}

# Core point IDs for Sungrow commercial inverter minute data:
# 1: Daily Gen (Wh), 2: Total Gen (Wh), 4: Temp (C), 14: DC Power (W), 24: AC Power (W)
# 18, 19, 20: Phase V (A, B, C), 21, 22, 23: Phase I (A, B, C), 26: PF, 27: Freq, 28: Eff, 29: Status
# 5, 7, 9, 45, 47, 49, 51, 53: MPPT 1..8 V
# 6, 8, 10, 46, 48, 50, 52, 54: MPPT 1..8 I
POINTS = [
    1, 2, 4, 14, 18, 19, 20, 21, 22, 23, 24, 26, 27, 28, 29,
    5, 6, 7, 8, 9, 10, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54
]
POINTS_STR = ",".join(f"p{p}" for p in POINTS)


def get_token():
    res = requests.post(
        f"{SUNGROW_URL}/openapi/login",
        headers={
            "Content-Type": "application/json;charset=UTF-8",
            "appkey": APP_KEY,
            "sys_code": "901",
            "x-access-key": SECRET_KEY
        },
        json={
            "appkey": APP_KEY,
            "sys_code": "901",
            "user_account": USER_ACCOUNT,
            "user_password": USER_PASSWORD
        },
        timeout=20
    )
    res.raise_for_status()
    data = res.json()
    if data.get("result_code") == "1" and data.get("result_data"):
        return data["result_data"]["token"]
    raise RuntimeError(f"Sungrow login failed: {data}")


def fetch_strings_map():
    url = f"{SUPABASE_URL}/rest/v1/strings?select=id,inverter_id,string_index"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}"
    }
    r = requests.get(url, headers=headers)
    r.raise_for_status()
    # map: (inverter_id, string_index) -> string_id
    strings_map = {}
    for s in r.json():
        strings_map[(s["inverter_id"], s["string_index"])] = s["id"]
    return strings_map


def fetch_window(token, st_str, et_str):
    headers = {
        "Content-Type": "application/json;charset=UTF-8",
        "appkey": APP_KEY,
        "sys_code": "901",
        "token": token,
        "x-access-key": SECRET_KEY
    }
    payload = {
        "appkey": APP_KEY,
        "token": token,
        "ps_id": PS_ID,
        "device_type": 1,
        "ps_key_list": list(INVERTER_MAPPING.keys()),
        "points": POINTS_STR,
        "start_time_stamp": st_str,
        "end_time_stamp": et_str,
        "minute_interval": "15"
    }
    try:
        r = requests.post(f"{SUNGROW_URL}/openapi/getDevicePointMinuteDataList", headers=headers, json=payload, timeout=25)
        if r.status_code == 200:
            res = r.json()
            if res.get("result_code") == "1":
                return res.get("result_data", {})
    except Exception as e:
        print(f"Error fetching window {st_str}-{et_str}: {e}")
    return {}


def parse_frames(result_data, strings_map):
    telemetry_records = []
    string_records = []

    # MPPT mapping to string index 1..8:
    # String 1: p5 (V), p6 (I)
    # String 2: p7 (V), p8 (I)
    # String 3: p9 (V), p10 (I)
    # String 4: p45 (V), p46 (I)
    # String 5: p47 (V), p48 (I)
    # String 6: p49 (V), p50 (I)
    # String 7: p51 (V), p52 (I)
    # String 8: p53 (V), p54 (I)
    mppt_pairs = [
        (1, "p5", "p6"),
        (2, "p7", "p8"),
        (3, "p9", "p10"),
        (4, "p45", "p46"),
        (5, "p47", "p48"),
        (6, "p49", "p50"),
        (7, "p51", "p52"),
        (8, "p53", "p54")
    ]

    for dev_key, frames in result_data.items():
        inv_info = INVERTER_MAPPING.get(dev_key)
        if not inv_info or not frames:
            continue

        inv_id = inv_info["id"]
        cap_kw = inv_info["capacity_kw"]

        for f in frames:
            ts_str = f.get("time_stamp")
            if not ts_str:
                continue

            # Sungrow timestamps are in IST (GMT+5:30)
            # Format: YYYYMMDDHHmmss
            try:
                dt_local = datetime.strptime(ts_str, "%Y%m%d%H%M%S")
                # Convert from IST (UTC+5:30) to UTC
                ist_offset = timedelta(hours=5, minutes=30)
                dt_utc = dt_local - ist_offset
                iso_timestamp = dt_utc.replace(tzinfo=timezone.utc).isoformat()
            except Exception:
                continue

            daily_kwh = round(float(f.get("p1") or 0.0) / 1000.0, 2)
            total_kwh = round(float(f.get("p2") or 0.0) / 1000.0, 2)
            temp_c = float(f.get("p4") or 35.0)
            dc_kw = round(float(f.get("p14") or 0.0) / 1000.0, 3)
            ac_kw = round(float(f.get("p24") or 0.0) / 1000.0, 3)
            
            is_online = (ac_kw > 0) or (dc_kw > 0) or (f.get("p29") == "并网运行")
            eff = round((ac_kw / dc_kw) * 100.0, 2) if dc_kw > 0 else (98.0 if is_online else 0.0)
            spec_yield = round(daily_kwh / cap_kw, 3) if cap_kw > 0 else 0.0

            v_r = float(f.get("p18") or 0.0) or None
            v_s = float(f.get("p19") or 0.0) or None
            v_t = float(f.get("p20") or 0.0) or None
            c_r = float(f.get("p21") or 0.0) or None
            c_s = float(f.get("p22") or 0.0) or None
            c_t = float(f.get("p23") or 0.0) or None
            pf = float(f.get("p26") or 1.0)
            freq = float(f.get("p27") or 50.0)

            t_rec = {
                "inverter_id": inv_id,
                "timestamp": iso_timestamp,
                "ac_power_kw": ac_kw,
                "dc_power_kw": dc_kw,
                "energy_kwh": total_kwh,
                "efficiency_pct": eff,
                "temperature_c": temp_c,
                "daily_generation_kwh": daily_kwh,
                "total_generation_kwh": total_kwh,
                "specific_yield": spec_yield,
                "online_status": is_online,
                "last_update": iso_timestamp,
                "frequency_hz": freq,
                "power_factor": pf,
                "voltage_r_v": v_r,
                "voltage_s_v": v_s,
                "voltage_t_v": v_t,
                "current_r_a": c_r,
                "current_s_a": c_s,
                "current_t_a": c_t,
                "metrics": {
                    "raw_sungrow": {
                        "p1": f.get("p1"),
                        "p2": f.get("p2"),
                        "p14": f.get("p14"),
                        "p24": f.get("p24"),
                        "p29": f.get("p29")
                    }
                }
            }
            telemetry_records.append(t_rec)

            # MPPT strings
            for s_idx, v_key, i_key in mppt_pairs:
                v_str = float(f.get(v_key) or 0.0)
                i_str = float(f.get(i_key) or 0.0)
                if v_str > 10.0 or i_str > 0.05:
                    p_str_kw = round((v_str * i_str) / 1000.0, 3)
                    s_id = strings_map.get((inv_id, s_idx))
                    if s_id:
                        string_records.append({
                            "string_id": s_id,
                            "timestamp": iso_timestamp,
                            "voltage_v": v_str,
                            "current_a": i_str,
                            "power_kw": p_str_kw,
                            "status": "ok" if p_str_kw > 0.05 else "low_current",
                            "metrics": {"mppt_index": s_idx}
                        })

    return telemetry_records, string_records


def insert_records(table, records, on_conflict_cols=None):
    if not records:
        return 0
    query_str = f"?on_conflict={on_conflict_cols}" if on_conflict_cols else ""
    url = f"{SUPABASE_URL}/rest/v1/{table}{query_str}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates"
    }
    chunk_size = 500
    inserted = 0
    for i in range(0, len(records), chunk_size):
        chunk = records[i:i + chunk_size]
        r = requests.post(url, headers=headers, json=chunk)
        if r.status_code in (200, 201):
            inserted += len(chunk)
        else:
            print(f"Warning: Insert into {table} returned {r.status_code}: {r.text[:200]}")
    return inserted


def backfill_date(token, date_str, strings_map):
    # 7 two-hour windows from 05:00 to 19:00 IST
    windows = [
        (f"{date_str}050000", f"{date_str}070000"),
        (f"{date_str}070000", f"{date_str}090000"),
        (f"{date_str}090000", f"{date_str}110000"),
        (f"{date_str}110000", f"{date_str}130000"),
        (f"{date_str}130000", f"{date_str}150000"),
        (f"{date_str}150000", f"{date_str}170000"),
        (f"{date_str}170000", f"{date_str}190000"),
    ]
    all_t = []
    all_s = []
    for st, et in windows:
        res_data = fetch_window(token, st, et)
        if res_data:
            t_recs, s_recs = parse_frames(res_data, strings_map)
            all_t.extend(t_recs)
            all_s.extend(s_recs)

    t_count = insert_records("telemetry", all_t, "inverter_id,timestamp")
    s_count = insert_records("string_telemetry", all_s, "string_id,timestamp")
    return len(all_t), t_count, len(all_s), s_count


def run_backfill(start_date, end_date, max_workers=5):
    print(f"=== Starting Sungrow Backfill: {start_date} to {end_date} (workers={max_workers}) ===")
    token = get_token()
    print("Obtained iSolarCloud token successfully.")
    strings_map = fetch_strings_map()
    print(f"Loaded {len(strings_map)} string mappings.")

    current = datetime.strptime(start_date, "%Y%m%d")
    end = datetime.strptime(end_date, "%Y%m%d")

    dates = []
    while current <= end:
        dates.append(current.strftime("%Y%m%d"))
        current += timedelta(days=1)

    total_days = len(dates)
    print(f"Total days to process: {total_days}")
    start_time = time.time()

    total_t = 0
    total_s = 0
    completed_days = 0

    # Process in parallel using ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(backfill_date, token, d_str, strings_map): (i, d_str) for i, d_str in enumerate(dates)}
        for future in as_completed(futures):
            idx, d_str = futures[future]
            completed_days += 1
            try:
                t_gen, t_ins, s_gen, s_ins = future.result()
                total_t += t_ins
                total_s += s_ins
                if t_gen > 0 or (completed_days % 10 == 0) or completed_days == total_days:
                    print(f"[{completed_days}/{total_days}] ({round(completed_days/total_days*100, 1)}%) {d_str} -> T: +{t_ins}, S: +{s_ins} | Cum: {total_t} T, {total_s} S")
            except Exception as e:
                print(f"Error processing {d_str}: {e}")

    elapsed = round(time.time() - start_time, 1)
    print(f"\n=== BACKFILL COMPLETE in {elapsed}s ===")
    print(f"Total Telemetry Ingested: {total_t}")
    print(f"Total String Telemetry Ingested: {total_s}")


if __name__ == "__main__":
    s_date = sys.argv[1] if len(sys.argv) > 1 else "20250627"
    e_date = sys.argv[2] if len(sys.argv) > 2 else "20261116"
    workers = int(sys.argv[3]) if len(sys.argv) > 3 else 5
    run_backfill(s_date, e_date, max_workers=workers)
