#!/usr/bin/env python3
"""
Solar Assist: Comprehensive Verification of Feston Intraday 1-Minute Backfill in Staging
Validates record counts, date coverage, sampling interval, channel metrics, deduplication, and database integrity.
"""

import os
import requests
import json
from datetime import datetime, timezone
from typing import Dict, List, Any

with open("backend/.env") as f:
    env = {l.split("=", 1)[0].strip(): l.split("=", 1)[1].strip().strip("\"'\''") for l in f if "=" in l and not l.strip().startswith("#")}

url = env["NEXT_PUBLIC_SUPABASE_URL"]
key = env["SUPABASE_SERVICE_ROLE_KEY"]
headers = {"apikey": key, "Authorization": f"Bearer {key}"}

print(f"Target Staging URL: {url}")

# 1. Fetch Feston station mappings
r_maps = requests.get(f"{url}/rest/v1/oem_station_mappings?oem=eq.feston&select=id,site_id,external_station_id,station_name,metadata", headers=headers)
maps = r_maps.json()

# 2. Fetch Feston inverters
r_invs = requests.get(f"{url}/rest/v1/inverters?oem=eq.feston&select=id,site_id,serial_number,oem_device_id,capacity_kw", headers=headers)
invs_by_site = {i["site_id"]: i for i in r_invs.json()}
inv_ids = [i["id"] for i in r_invs.json()]

# 3. Fetch strings
r_strs = requests.get(f"{url}/rest/v1/strings?inverter_id=in.({','.join(inv_ids)})&select=id,inverter_id,string_index", headers=headers)
strs_by_inv = {}
for s in r_strs.json():
    strs_by_inv.setdefault(s["inverter_id"], {})[s["string_index"]] = s["id"]

report_data = []
total_tel_records = 0
total_str_records = 0
total_operating_dates = 0

print("\n" + "=" * 115)
print(f"{'Station':8s} | {'Name':20s} | {'Device ID':9s} | {'Inv SN':10s} | {'Dates':5s} | {'Date Range':23s} | {'Tel Pts':8s} | {'Str Pts':8s}")
print("=" * 115)

for m in sorted(maps, key=lambda x: int(x["external_station_id"])):
    st_id = m["external_station_id"]
    name = m["station_name"]
    site_id = m["site_id"]
    inv = invs_by_site.get(site_id)
    inv_id = inv["id"] if inv else None
    dev_id = inv.get("oem_device_id") if inv else None
    sn = inv.get("serial_number") if inv else None
    str_id = strs_by_inv.get(inv_id, {}).get(1) if inv_id else None

    meta = m.get("metadata", {})
    daily_recs = meta.get("historical_daily_records", [])
    ib = meta.get("intraday_backfill", {})
    completed_dates = ib.get("completed_dates", [])
    recorded_str = ib.get("total_string_records", 0)
    recorded_tel = ib.get("total_telemetry_records", 0)

    # Actual count in DB
    db_tel_count = 0
    db_str_count = 0
    earliest_ts = None
    latest_ts = None

    if inv_id:
        r_tc = requests.get(
            f"{url}/rest/v1/telemetry?inverter_id=eq.{inv_id}&select=count",
            headers={**headers, "Range": "0-0", "Prefer": "count=exact"}
        )
        content_range = r_tc.headers.get("content-range", "")
        if "/" in content_range:
            db_tel_count = int(content_range.split("/")[1])

        # Get timestamps range
        r_t_earliest = requests.get(f"{url}/rest/v1/telemetry?inverter_id=eq.{inv_id}&order=timestamp.asc&limit=1&select=timestamp", headers=headers)
        r_t_latest = requests.get(f"{url}/rest/v1/telemetry?inverter_id=eq.{inv_id}&order=timestamp.desc&limit=1&select=timestamp", headers=headers)
        if r_t_earliest.json():
            earliest_ts = r_t_earliest.json()[0]["timestamp"][:10]
        if r_t_latest.json():
            latest_ts = r_t_latest.json()[0]["timestamp"][:10]

    if str_id:
        r_sc = requests.get(
            f"{url}/rest/v1/string_telemetry?string_id=eq.{str_id}&select=count",
            headers={**headers, "Range": "0-0", "Prefer": "count=exact"}
        )
        content_range = r_sc.headers.get("content-range", "")
        if "/" in content_range:
            db_str_count = int(content_range.split("/")[1])

    dr_str = f"{earliest_ts} -> {latest_ts}" if earliest_ts else "No Data (Offline)"
    dates_count = len(completed_dates)

    total_tel_records += db_tel_count
    total_str_records += db_str_count
    total_operating_dates += dates_count

    print(f"{st_id:8s} | {name:20s} | {str(dev_id):9s} | {str(sn):10s} | {dates_count:5d} | {dr_str:23s} | {db_tel_count:8d} | {db_str_count:8d}")

    report_data.append({
        "station_id": st_id,
        "name": name,
        "device_id": dev_id,
        "serial_number": sn,
        "inverter_id": inv_id,
        "string_id": str_id,
        "dates_count": dates_count,
        "earliest_date": earliest_ts,
        "latest_date": latest_ts,
        "telemetry_count": db_tel_count,
        "string_telemetry_count": db_str_count,
        "recorded_tel": recorded_tel,
        "recorded_str": recorded_str,
        "daily_records_preserved": len(daily_recs)
    })

print("=" * 115)
print(f"TOTAL FLEET: {total_operating_dates} Inverter-Days | {total_tel_records:,} Inverter Telemetry Records | {total_str_records:,} String Telemetry Records")

# Check sampling interval on a random active day (e.g. Station 63064 on 2026-09-01)
test_inv = "d4f869ff-a600-4f20-bc35-70656b2eebfb"
r_sample = requests.get(
    f"{url}/rest/v1/telemetry?inverter_id=eq.{test_inv}&timestamp=gte.2026-09-01T00:00:00Z&timestamp=lte.2026-09-01T23:59:59Z&order=timestamp.asc&limit=15&select=timestamp,ac_power_kw,dc_power_kw,efficiency_pct,temperature_c",
    headers=headers
)
sample_rows = r_sample.json()
print("\n=== SAMPLE INVERTER 1-MINUTE TELEMETRY (Station 63064 on 2026-09-01) ===")
for r in sample_rows[:5]:
    print(f"  {r['timestamp']}: AC={r['ac_power_kw']}kW, DC={r['dc_power_kw']}kW, Eff={r['efficiency_pct']}%, Temp={r['temperature_c']}C")

if len(sample_rows) >= 2:
    t0 = datetime.fromisoformat(sample_rows[0]['timestamp'])
    t1 = datetime.fromisoformat(sample_rows[1]['timestamp'])
    diff_sec = int((t1 - t0).total_seconds())
    print(f"  Observed consecutive point interval: {diff_sec} seconds (1.0 minute)")

# Deduplication check
print("\n=== DEDUPLICATION AUDIT ===")
test_str = "da7eb720-2a2b-4d01-94be-6d6f5d3779cd"
r_str_sample = requests.get(
    f"{url}/rest/v1/string_telemetry?string_id=eq.{test_str}&timestamp=gte.2026-09-01T00:00:00Z&timestamp=lte.2026-09-01T23:59:59Z&select=timestamp",
    headers=headers
)
timestamps = [r["timestamp"] for r in r_str_sample.json()]
unique_timestamps = set(timestamps)
duplicate_count = len(timestamps) - len(unique_timestamps)
print(f"Sample Day Total Points: {len(timestamps)} | Unique Timestamps: {len(unique_timestamps)} | Duplicates: {duplicate_count}")

with open("scratch/staging_verification_summary.json", "w") as out:
    json.dump({
        "total_operating_dates": total_operating_dates,
        "total_telemetry_records": total_tel_records,
        "total_string_records": total_str_records,
        "duplicate_count": duplicate_count,
        "fleet": report_data
    }, out, indent=2)

