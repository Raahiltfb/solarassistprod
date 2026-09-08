import os
import sys
import time
import argparse
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv

sys.path.append(os.path.join(os.getcwd(), "backend"))

load_dotenv(".env")
load_dotenv("backend/.env")

from adapters.solis import SolisAdapter

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.")
    sys.exit(1)

SOLIS_KEY_ID = os.getenv("SOLIS_KEY_ID")
SOLIS_KEY_SECRET = os.getenv("SOLIS_KEY_SECRET")
SOLIS_API_URL = os.getenv("SOLIS_API_URL")

if not SOLIS_KEY_ID or not SOLIS_KEY_SECRET:
    print("Error: Missing SOLIS_KEY_ID or SOLIS_KEY_SECRET in environment.")
    sys.exit(1)

adapter = SolisAdapter(key_id=SOLIS_KEY_ID, key_secret=SOLIS_KEY_SECRET, api_url=SOLIS_API_URL)


def supabase_select(table: str, params: dict = None):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}"
    }
    for attempt in range(3):
        try:
            res = requests.get(url, headers=headers, params=params, timeout=30)
            if res.status_code == 200:
                return res.json()
            else:
                print(f"Supabase Select Error ({res.status_code}): {res.text}")
                return []
        except Exception as e:
            print(f"  Supabase select connection attempt {attempt+1} failed: {e}")
            time.sleep(2)
    return []


def supabase_insert(table: str, rows: list):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    for attempt in range(3):
        try:
            res = requests.post(url, headers=headers, json=rows, timeout=30)
            if res.status_code in (200, 201):
                return res.json()
            else:
                print(f"Supabase Insert Error ({res.status_code}): {res.text}")
                return []
        except Exception as e:
            print(f"  Supabase insert connection attempt {attempt+1} failed: {e}")
            time.sleep(2)
    return []


def get_existing_dates_for_inverter(inverter_id: str) -> set:
    """Fetch all unique calendar dates (YYYY-MM-DD) already present in telemetry for an inverter."""
    records = supabase_select("telemetry", {
        "select": "timestamp",
        "inverter_id": f"eq.{inverter_id}"
    })
    existing_dates = set()
    for r in records:
        ts = r.get("timestamp")
        if ts:
            existing_dates.add(ts[:10])
    return existing_dates


def generate_months_list(max_months: int):
    """Generate list of YYYY-MM strings going back max_months from current month."""
    now = datetime.now(timezone.utc)
    year = now.year
    month = now.month
    months = []
    for _ in range(max_months):
        months.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    return months


def parse_energy_kwh(record: dict) -> float:
    """Extract and normalize daily energy in kWh from Solis inverterMonth record."""
    val = float(record.get("energy", 0.0) or 0.0)
    unit = str(record.get("energyStr", "kWh") or "kWh").strip().lower()
    if unit == "mwh":
        val = val * 1000.0
    elif unit == "gwh":
        val = val * 1000000.0
    return round(val, 3)


def backfill_inverter(inverter: dict, months_list: list, dry_run: bool = False, force: bool = False):
    inv_id = inverter["id"]
    oem_device_id = inverter["oem_device_id"]
    sn = inverter["serial_number"]
    capacity_kw = float(inverter.get("capacity_kw") or 1.0)
    if capacity_kw <= 0:
        capacity_kw = 1.0

    print(f"\n====================================================")
    print(f"Processing Inverter ID: {inv_id}")
    print(f"OEM Device ID: {oem_device_id} | Serial Number: {sn} | Capacity: {capacity_kw} kW")

    existing_dates = set() if force else get_existing_dates_for_inverter(inv_id)
    print(f"Existing database telemetry dates count: {len(existing_dates)}")

    records_to_insert = []
    skipped_count = 0
    zero_count = 0

    consecutive_empty_months = 0
    for month_str in months_list:
        print(f"  Fetching month {month_str} from Solis API...", end=" ", flush=True)
        time.sleep(0.5)  # Rate limiting delay

        res = adapter._call_solis(
            "/v1/api/inverterMonth",
            {
                "id": oem_device_id,
                "sn": sn,
                "money": "INR",
                "month": month_str,
                "timeZone": 5.5,
            },
        )

        daily_records = res.get("data", []) if res.get("code") == "0" else []
        if not isinstance(daily_records, list) or len(daily_records) == 0:
            print(f"NO DATA (Code: {res.get('code')}, Msg: {res.get('msg')})")
            consecutive_empty_months += 1
            if consecutive_empty_months >= 3:
                print(f"  Reached {consecutive_empty_months} consecutive empty months. Stopping scan for Inverter {sn}.")
                break
            continue

        consecutive_empty_months = 0
        print(f"OK ({len(daily_records)} days returned)")

        for d in daily_records:
            date_str = d.get("dateStr")
            if not date_str or len(date_str) < 10:
                continue

            date_str = date_str[:10]

            # Duplicate protection: skip if date already exists in database
            if date_str in existing_dates:
                skipped_count += 1
                continue

            energy_kwh = parse_energy_kwh(d)
            if energy_kwh <= 0.0:
                zero_count += 1
                continue

            specific_yield = round(energy_kwh / capacity_kw, 3)
            timestamp_iso = f"{date_str}T12:00:00.000Z"

            telemetry_row = {
                "inverter_id": inv_id,
                "timestamp": timestamp_iso,
                "ac_power_kw": 0.0,
                "dc_power_kw": 0.0,
                "energy_kwh": energy_kwh,
                "daily_generation_kwh": energy_kwh,
                "specific_yield": specific_yield,
                "online_status": True,
                "metrics": {
                    "backfilled": True,
                    "full_hour": d.get("fullHour", 0.0),
                    "source": "solis_inverterMonth_backfill",
                },
            }
            records_to_insert.append(telemetry_row)
            # Add to set so same run doesn't add duplicate
            existing_dates.add(date_str)

    print(f"  Summary for Inverter {sn}:")
    print(f"    - New records to insert: {len(records_to_insert)}")
    print(f"    - Skipped (already in DB): {skipped_count}")
    print(f"    - Skipped (zero generation): {zero_count}")

    if dry_run:
        print("  [DRY RUN] Skipping database insert.")
        if records_to_insert:
            print(f"  [DRY RUN] Sample record payload: {records_to_insert[0]}")
        return len(records_to_insert)

    if not records_to_insert:
        print("  No new historical records to insert.")
        return 0

    # Batch insert in chunks of 100
    batch_size = 100
    inserted_total = 0
    for i in range(0, len(records_to_insert), batch_size):
        chunk = records_to_insert[i : i + batch_size]
        res = supabase_insert("telemetry", chunk)
        if res:
            inserted_total += len(res)
        else:
            print(f"  Warning: Chunk insert returned empty or error response.")

    print(f"  Successfully inserted {inserted_total} historical telemetry records into Supabase.")
    return inserted_total


def main():
    parser = argparse.ArgumentParser(description="Historical Solis Data Backfill Service")
    parser.add_argument("--dry-run", action="store_true", help="Perform API queries and gap analysis without inserting into Supabase.")
    parser.add_argument("--inverter-id", type=str, help="Specify a single inverter UUID to process.")
    parser.add_argument("--months", type=int, default=24, help="Maximum number of historical months to backfill (default: 24).")
    parser.add_argument("--force", action="store_true", help="Ignore existing database dates check.")

    args = parser.parse_args()

    print("====================================================")
    print("      SOLARASSIST HISTORICAL DATA BACKFILL")
    print("====================================================")
    print(f"Mode: {'DRY RUN' if args.dry_run else 'LIVE EXECUTION'}")
    print(f"Lookback Window: {args.months} months")
    if args.inverter_id:
        print(f"Target Inverter ID: {args.inverter_id}")
    else:
        print("Target: ALL inverters in organization")
    print("====================================================\n")

    # Fetch targeted inverters from database
    params = {"select": "id,oem_device_id,serial_number,capacity_kw"}
    if args.inverter_id:
        params["id"] = f"eq.{args.inverter_id}"

    inverters = supabase_select("inverters", params)

    if not inverters:
        print("No matching inverters found in Supabase database.")
        sys.exit(1)

    print(f"Found {len(inverters)} inverter(s) to process.")
    months_list = generate_months_list(args.months)
    print(f"Target Month Range: {months_list[-1]} to {months_list[0]}")

    total_inserted = 0
    start_time = time.time()

    for idx, inv in enumerate(inverters, start=1):
        print(f"\n--- Processing Inverter {idx}/{len(inverters)} ---")
        count = backfill_inverter(inv, months_list, dry_run=args.dry_run, force=args.force)
        total_inserted += count

    elapsed = round(time.time() - start_time, 2)
    print(f"\n====================================================")
    print(f"BACKFILL COMPLETE in {elapsed}s")
    print(f"Total historical records {'identified' if args.dry_run else 'inserted'}: {total_inserted}")
    print("====================================================")


if __name__ == "__main__":
    main()
