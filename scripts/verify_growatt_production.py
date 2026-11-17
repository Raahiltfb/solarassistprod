#!/usr/bin/env python3
"""
Production Verification Suite for Growatt Integration:
Verifies sites, inverters, strings, online/offline statuses, multi-year telemetry,
intraday telemetry, string telemetry, analytics RPCs, and standardized alerts.
"""

import os
import sys
import requests

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


def get_count(table: str, query: str) -> int:
    h = {**HEADERS, "Prefer": "count=exact", "Range": "0-0"}
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{table}?{query}&select=id", headers=h, timeout=20)
    cr = r.headers.get("content-range", "0-0/0")
    return int(cr.split("/")[-1]) if "/" in cr else 0


def main():
    print("=== Growatt Production Verification Suite ===")

    maps = requests.get(f"{SUPABASE_URL}/rest/v1/oem_station_mappings?oem=eq.growatt&select=*", headers=HEADERS).json()
    print(f"1. OEM Station Mappings (growatt): {len(maps)} (expected: 16)")

    invs = requests.get(f"{SUPABASE_URL}/rest/v1/inverters?oem=eq.growatt&select=*&order=serial_number", headers=HEADERS).json()
    print(f"2. Growatt Inverters: {len(invs)} (expected: 15)")

    online_invs = [i for i in invs if i["status"] in ("online", "standby")]
    offline_invs = [i for i in invs if i["status"] == "offline"]
    print(f"   - Online/Standby Inverters: {len(online_invs)} -> {[i['serial_number'] for i in online_invs]}")
    print(f"   - Offline Inverters:        {len(offline_invs)} -> {[i['serial_number'] for i in offline_invs]}")

    total_tel = 0
    total_str_tel = 0
    total_strings = 0

    print("\n3. Per-Inverter Telemetry & String Breakdown:")
    for inv in invs:
        iid = inv["id"]
        sn = inv["serial_number"]
        strs = requests.get(f"{SUPABASE_URL}/rest/v1/strings?inverter_id=eq.{iid}&select=id,string_index", headers=HEADERS).json()
        total_strings += len(strs)
        t_cnt = get_count("telemetry", f"inverter_id=eq.{iid}")
        total_tel += t_cnt

        s_cnt = 0
        for s in strs:
            s_cnt += get_count("string_telemetry", f"string_id=eq.{s['id']}")
        total_str_tel += s_cnt

        earliest = requests.get(
            f"{SUPABASE_URL}/rest/v1/telemetry?inverter_id=eq.{iid}&select=timestamp&order=timestamp.asc&limit=1",
            headers=HEADERS,
        ).json()
        latest = requests.get(
            f"{SUPABASE_URL}/rest/v1/telemetry?inverter_id=eq.{iid}&select=timestamp,ac_power_kw,daily_generation_kwh,total_generation_kwh&order=timestamp.desc&limit=1",
            headers=HEADERS,
        ).json()
        min_ts = earliest[0]["timestamp"][:10] if earliest else "none"
        max_ts = latest[0]["timestamp"][:19] if latest else "none"
        tot_kwh = latest[0]["total_generation_kwh"] if latest else 0
        day_kwh = latest[0]["daily_generation_kwh"] if latest else 0

        print(
            f"   - {sn} ({inv['model']}, {inv['capacity_kw']}kW, status={inv['status']}): "
            f"strings={len(strs)}, tel_rows={t_cnt}, str_rows={s_cnt}, span={min_ts}..{max_ts}, "
            f"today={day_kwh}kWh, lifetime={tot_kwh}kWh"
        )

    alerts = requests.get(f"{SUPABASE_URL}/rest/v1/alerts?oem=eq.growatt&select=code,alarm_code,title,severity,status,triggered_at", headers=HEADERS).json()
    print(f"\n4. Growatt Standardized Alerts: {len(alerts)}")
    for a in alerts[:15]:
        print(f"   - [{a['status'].upper()}] {a['code']} ({a['severity']}): {a['title']} @ {a['triggered_at'][:19]}")

    print("\n=== SUMMARY ===")
    print(f"Total Growatt Sites:             {len(maps)}")
    print(f"Total Growatt Inverters:         {len(invs)} ({len(online_invs)} online, {len(offline_invs)} offline)")
    print(f"Total Growatt Strings:           {total_strings}")
    print(f"Total Telemetry Records:         {total_tel}")
    print(f"Total String Telemetry Records:  {total_str_tel}")
    print(f"Total Standardized Alerts:       {len(alerts)}")


if __name__ == "__main__":
    main()

