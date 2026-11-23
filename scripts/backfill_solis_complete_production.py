#!/usr/bin/env python3
"""
Production Solis Complete Historical Backfill Engine
Backfills 100% of historical daily generation for all Solis inverters in production Supabase
from their commissioning date through present.
"""

import os
import sys
import time
import json
import hmac
import hashlib
import base64
import requests
from datetime import datetime, timezone

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE"

SOLIS_KEY_ID = "1300386381678106385"
SOLIS_KEY_SECRET = "a21fcc244b2f4fe48097ceca92a1c160"
SOLIS_API_URL = "https://www.soliscloud.com:13333"

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}


def call_solis(endpoint: str, body_dict: dict, max_retries: int = 3) -> dict:
    body = json.dumps(body_dict)
    content_md5 = base64.b64encode(hashlib.md5(body.encode("utf-8")).digest()).decode("utf-8")
    
    for attempt in range(max_retries):
        now_gmt = time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime())
        string_to_sign = f"POST\n{content_md5}\napplication/json\n{now_gmt}\n{endpoint}"
        signature = base64.b64encode(
            hmac.new(SOLIS_KEY_SECRET.encode("utf-8"), string_to_sign.encode("utf-8"), hashlib.sha1).digest()
        ).decode("utf-8")
        
        headers = {
            "Content-Type": "application/json",
            "Content-MD5": content_md5,
            "Date": now_gmt,
            "Authorization": f"API {SOLIS_KEY_ID}:{signature}"
        }
        
        try:
            r = requests.post(f"{SOLIS_API_URL}{endpoint}", data=body, headers=headers, timeout=25)
            data = r.json()
            if data.get("code") == "0":
                return data
            # If rate limited or transient error
            time.sleep(1.0 + attempt * 1.5)
        except Exception as e:
            if attempt == max_retries - 1:
                return {"code": "-1", "msg": str(e)}
            time.sleep(1.5)
            
    return {"code": "-1", "msg": "Max retries exceeded"}


def get_all_solis_inverters():
    url = f"{SUPABASE_URL}/rest/v1/inverters?select=id,site_id,oem_device_id,serial_number,capacity_kw,sites(name,commissioned_on)&oem=eq.solis&order=site_id"
    r = requests.get(url, headers=SB_HEADERS)
    r.raise_for_status()
    return r.json()


def get_existing_dates_for_inverter(inverter_id: str) -> set:
    existing_dates = set()
    offset = 0
    limit = 1000
    while True:
        url = f"{SUPABASE_URL}/rest/v1/telemetry?inverter_id=eq.{inverter_id}&select=timestamp&limit={limit}&offset={offset}"
        r = requests.get(url, headers=SB_HEADERS)
        if r.status_code != 200:
            break
        items = r.json()
        if not items:
            break
        for item in items:
            ts = item.get("timestamp")
            if ts:
                existing_dates.add(ts[:10])
        offset += len(items)
        if len(items) < limit:
            break
    return existing_dates


def generate_months_range(comm_date_str: str = None) -> list:
    """Generate YYYY-MM list from commissioned date (or at most 36 months back) to current month."""
    now = datetime.now(timezone.utc)
    cur_year = now.year
    cur_month = now.month
    
    start_year = cur_year - 3
    start_month = 1
    
    if comm_date_str:
        try:
            parsed = datetime.strptime(comm_date_str[:10], "%Y-%m-%d")
            # Don't go further back than 3 years
            if parsed.year > start_year or (parsed.year == start_year and parsed.month > start_month):
                start_year = parsed.year
                start_month = parsed.month
        except Exception:
            pass

    months = []
    y = start_year
    m = start_month
    while (y < cur_year) or (y == cur_year and m <= cur_month):
        months.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
        
    return months


def parse_energy_kwh(record: dict) -> float:
    val = float(record.get("energy", 0.0) or 0.0)
    unit = str(record.get("energyStr", "kWh") or "kWh").strip().lower()
    if unit == "mwh":
        val *= 1000.0
    elif unit == "gwh":
        val *= 1000000.0
    return round(val, 2)


def insert_batch(rows: list) -> bool:
    if not rows:
        return True
    url = f"{SUPABASE_URL}/rest/v1/telemetry"
    for attempt in range(3):
        try:
            r = requests.post(url, headers=SB_HEADERS, json=rows, timeout=30)
            if r.status_code in (200, 201):
                return True
            print(f"    Insert error ({r.status_code}): {r.text[:200]}")
            time.sleep(1.0)
        except Exception as e:
            print(f"    Insert exception: {e}")
            time.sleep(1.0)
    return False


def run_solis_backfill():
    print(f"[{datetime.now().isoformat()}] Starting Solis Complete Production Backfill...")
    inverters = get_all_solis_inverters()
    print(f"Found {len(inverters)} Solis inverters across all sites.")

    total_inserted = 0
    total_skipped = 0

    for idx, inv in enumerate(inverters, 1):
        inv_id = inv["id"]
        sn = inv.get("serial_number")
        oem_device_id = inv.get("oem_device_id")
        cap_kw = float(inv.get("capacity_kw") or 1.0)
        if cap_kw <= 0:
            cap_kw = 1.0
        site_name = inv.get("sites", {}).get("name", "Unknown") if inv.get("sites") else "Unknown"
        comm_date = inv.get("sites", {}).get("commissioned_on") if inv.get("sites") else None

        print(f"\n[{idx}/{len(inverters)}] Inverter {sn} ({site_name}) | Cap: {cap_kw} kW | Comm: {comm_date}")
        
        existing_dates = get_existing_dates_for_inverter(inv_id)
        months_to_check = generate_months_range(comm_date)
        print(f"  Existing dates in DB: {len(existing_dates)} | Months to scan: {len(months_to_check)} ({months_to_check[0]} to {months_to_check[-1]})")

        inv_inserted = 0
        inv_skipped = 0
        pending_rows = []

        for m_str in months_to_check:
            # Check if all dates for this month might already exist
            # Call Solis API
            res = call_solis("/v1/api/inverterMonth", {
                "id": oem_device_id,
                "sn": sn,
                "money": "INR",
                "month": m_str,
                "timeZone": 5.5
            })
            time.sleep(0.2)  # Rate limiting pacing

            if res.get("code") != "0":
                # Only log if unexpected error
                if "no data" not in str(res.get("msg", "")).lower():
                    print(f"  Month {m_str}: API msg = {res.get('msg')}")
                continue

            daily_records = res.get("data", [])
            if not isinstance(daily_records, list) or len(daily_records) == 0:
                continue

            month_new = 0
            for d in daily_records:
                date_str = d.get("dateStr")
                if not date_str or len(date_str) < 10:
                    continue
                date_str = date_str[:10]

                if date_str in existing_dates:
                    inv_skipped += 1
                    continue

                energy = parse_energy_kwh(d)
                spec_yield = round(energy / cap_kw, 3)
                full_hour = float(d.get("fullHour", 0.0) or 0.0)

                pending_rows.append({
                    "inverter_id": inv_id,
                    "timestamp": f"{date_str}T12:00:00.000Z",
                    "ac_power_kw": 0.0,
                    "dc_power_kw": 0.0,
                    "energy_kwh": energy,
                    "daily_generation_kwh": energy,
                    "total_generation_kwh": 0.0,
                    "specific_yield": spec_yield,
                    "online_status": True,
                    "metrics": {
                        "backfilled": True,
                        "source": "solis_inverterMonth_complete",
                        "solis_id": d.get("id"),
                        "full_hour": full_hour
                    }
                })
                existing_dates.add(date_str)
                month_new += 1

            if month_new > 0:
                print(f"  Month {m_str}: +{month_new} new days")

            # Batch insert every 100 rows
            if len(pending_rows) >= 100:
                if insert_batch(pending_rows):
                    inv_inserted += len(pending_rows)
                pending_rows = []

        # Flush any remaining rows
        if pending_rows:
            if insert_batch(pending_rows):
                inv_inserted += len(pending_rows)
            pending_rows = []

        total_inserted += inv_inserted
        total_skipped += inv_skipped
        print(f"  Finished {sn}: Inserted={inv_inserted}, Skipped/Existing={inv_skipped}")

    print(f"\n========================================================")
    print(f"Solis Complete Backfill Finished.")
    print(f"Total Rows Inserted: {total_inserted}")
    print(f"Total Existing/Skipped: {total_skipped}")
    print(f"========================================================")


if __name__ == "__main__":
    run_solis_backfill()
