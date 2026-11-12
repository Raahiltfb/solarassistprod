#!/usr/bin/env python3
"""
Solar Assist: Comprehensive Production Verification of Feston / SolarOS Backfill
Project: ylnmjvgnjootrkywbcsj
"""

import os
import requests
import json
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv("backend/.env.production.backup")
url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

assert "ylnmjvgnjootrkywbcsj" in url, "SAFETY ABORT: Must be production ylnmjvgnjootrkywbcsj"
headers = {"apikey": key, "Authorization": f"Bearer {key}"}

print(f"Target Production URL: {url}")

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
total_profiles = 0

print("\n" + "=" * 125)
print(f"{'Station':8s} | {'Name':20s} | {'Device ID':9s} | {'Inv SN':10s} | {'Dates':5s} | {'Date Range':23s} | {'Tel Pts':8s} | {'Str Pts':8s} | {'Prof':5s}")
print("=" * 125)

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
    profile_summary = meta.get("station_power_profile_summary", {})

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

    dr_str = f"{earliest_ts} -> {latest_ts}" if earliest_ts else "Offline (Wi-Fi)"
    dates_count = len(completed_dates)
    profs_count = len(profile_summary)

    total_tel_records += db_tel_count
    total_str_records += db_str_count
    total_operating_dates += dates_count
    total_profiles += profs_count

    print(f"{st_id:8s} | {name:20s} | {str(dev_id):9s} | {str(sn):10s} | {dates_count:5d} | {dr_str:23s} | {db_tel_count:8d} | {db_str_count:8d} | {profs_count:5d}")

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
        "profiles_count": profs_count,
        "daily_records_preserved": len(daily_recs)
    })

print("=" * 125)
print(f"PRODUCTION TOTAL: {total_operating_dates} Inverter-Days | {total_tel_records:,} Telemetry Records | {total_str_records:,} String Records | {total_profiles:,} Station Profiles")

# 4. Check live sync runs during the backfill
r_sync = requests.get(f"{url}/rest/v1/sync_runs?order=started_at.desc&limit=6", headers=headers)
print("\n=== LIVE CRON POLL STATUS DURING & AFTER BACKFILL ===")
for run in r_sync.json():
    st = run.get("started_at")
    status = run.get("status")
    print(f"  Sync run: {st} -> Status: {status}")

with open("scratch/production_verification_summary.json", "w") as out:
    json.dump({
        "total_operating_dates": total_operating_dates,
        "total_telemetry_records": total_tel_records,
        "total_string_records": total_str_records,
        "total_station_profiles": total_profiles,
        "fleet": report_data
    }, out, indent=2)

