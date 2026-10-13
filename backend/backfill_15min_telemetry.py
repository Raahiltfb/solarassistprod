import os
import sys
import time
import argparse
import requests
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv

# Add backend directory to path
sys.path.append(os.path.join(os.getcwd(), "backend"))
load_dotenv(".env")
load_dotenv("backend/.env")
load_dotenv("frontend/.env.local")

from adapters.solis import SolisAdapter

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Missing Supabase credentials in environment.")
    sys.exit(1)

SOLIS_KEY_ID = os.getenv("SOLIS_KEY_ID")
SOLIS_KEY_SECRET = os.getenv("SOLIS_KEY_SECRET")
SOLIS_API_URL = os.getenv("SOLIS_API_URL")

adapter = SolisAdapter(
    key_id=SOLIS_KEY_ID,
    key_secret=SOLIS_KEY_SECRET,
    api_url=SOLIS_API_URL
)

def supabase_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }

def supabase_get(table: str, params=None):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = supabase_headers()
    for attempt in range(3):
        try:
            res = requests.get(url, headers=headers, params=params, timeout=30)
            if res.status_code == 200:
                return res.json()
            else:
                time.sleep(1)
        except Exception as e:
            time.sleep(1)
    return []

def supabase_post(table: str, rows: list, ignore_duplicates: bool = True):
    if not rows:
        return []
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = supabase_headers()
    if ignore_duplicates:
        headers["Prefer"] = "resolution=ignore-duplicates,return=minimal"
    else:
        headers["Prefer"] = "return=minimal"

    for attempt in range(3):
        try:
            res = requests.post(url, headers=headers, json=rows, timeout=35)
            if res.status_code in (200, 201):
                return True
            else:
                time.sleep(1)
        except Exception as e:
            time.sleep(1)
    return False

def get_or_create_strings_map(inverter_id: str, capacity_kw: float, string_count: int) -> dict:
    existing = supabase_get("strings", {"inverter_id": f"eq.{inverter_id}", "select": "id,string_index"})
    s_map = {int(s["string_index"]): s["id"] for s in existing}
    
    # Ensure strings exist up to string_count
    cap_per_str = round((capacity_kw / string_count), 2) if string_count > 0 else 0.0
    for idx in range(1, string_count + 1):
        if idx not in s_map:
            new_row = {
                "inverter_id": inverter_id,
                "string_index": idx,
                "modules_count": 20,
                "capacity_kw": cap_per_str,
                "status": "ok"
            }
            res = requests.post(
                f"{SUPABASE_URL}/rest/v1/strings",
                headers={**supabase_headers(), "Prefer": "return=representation"},
                json=[new_row]
            )
            if res.status_code in (200, 201) and res.json():
                s_map[idx] = res.json()[0]["id"]
    return s_map

def get_existing_detailed_dates(inverter_id: str) -> set:
    """Fetch all dates that already have 15-min interval points in database."""
    # We query timestamps for this inverter
    records = supabase_get("telemetry", {
        "select": "timestamp",
        "inverter_id": f"eq.{inverter_id}",
        "order": "timestamp.desc",
        "limit": 10000
    })
    counts = {}
    for r in records:
        ts = r.get("timestamp")
        if ts:
            d = ts[:10]
            counts[d] = counts.get(d, 0) + 1
    # If date has >= 16 points (at least 4 hours of 15-min data), consider it already populated
    return {d for d, c in counts.items() if c >= 16}

def process_inverter_day(inv_uuid: str, oem_device_id: str, sn: str, capacity_kw: float, string_count: int, date_str: str, strings_map: dict):
    """Fetch 1 day of telemetry, downsample to 15-min intervals, and insert into Supabase."""
    time.sleep(0.15) # Polite delay
    res = adapter._call_solis("/v1/api/inverterDay", {
        "id": oem_device_id,
        "sn": sn,
        "money": "INR",
        "time": date_str,
        "timeZone": 5.5
    })
    
    if res.get("code") != "0":
        return 0, 0
        
    data_points = res.get("data", [])
    if not isinstance(data_points, list) or len(data_points) == 0:
        return 0, 0
        
    telemetry_rows = []
    string_telemetry_rows = []
    
    for d in data_points:
        ts_raw = d.get("dataTimestamp") or d.get("time") or d.get("updateTime")
        if not ts_raw:
            continue
            
        try:
            dt = datetime.fromtimestamp(int(ts_raw) / 1000.0, tz=timezone.utc)
        except Exception:
            continue
            
        # Downsample to 15-minute intervals (:00, :15, :30, :45)
        if dt.minute % 15 != 0:
            continue
            
        ts_iso = dt.isoformat()
        
        # pac is in Watts in inverterDay -> convert to kW
        raw_pac = float(d.get("pac") or 0.0)
        ac_power_kw = round(raw_pac / 1000.0, 3)
        dc_power_kw = round(float(d.get("dcPac") or raw_pac) / 1000.0, 3)
        energy_kwh = float(d.get("eToday") or 0.0)
        efficiency_pct = float(d.get("efficiency") or 95.0)
        temperature_c = float(d.get("inverterTemperature") or 35.0)
        
        state_val = d.get("state")
        online_status = True if (state_val in (1, "1") or ac_power_kw > 0.05) else False
        
        total_gen_kwh = float(d.get("eTotal") or 0.0)
        specific_yield = round(energy_kwh / capacity_kw, 2) if capacity_kw > 0 else 0.0
        
        frequency_hz = float(d.get("fac") or 0.0)
        voltage_r_v = float(d.get("uAc1") or 0.0)
        voltage_s_v = float(d.get("uAc2") or 0.0)
        voltage_t_v = float(d.get("uAc3") or 0.0)
        current_r_a = float(d.get("iAc1") or 0.0)
        current_s_a = float(d.get("iAc2") or 0.0)
        current_t_a = float(d.get("iAc3") or 0.0)
        power_factor = float(d.get("powerFactor") or 1.0)
        
        telemetry_rows.append({
            "inverter_id": inv_uuid,
            "timestamp": ts_iso,
            "ac_power_kw": ac_power_kw,
            "dc_power_kw": dc_power_kw,
            "energy_kwh": energy_kwh,
            "efficiency_pct": efficiency_pct,
            "temperature_c": temperature_c,
            "daily_generation_kwh": energy_kwh,
            "total_generation_kwh": total_gen_kwh,
            "specific_yield": specific_yield,
            "online_status": online_status,
            "frequency_hz": frequency_hz,
            "voltage_r_v": voltage_r_v,
            "voltage_s_v": voltage_s_v,
            "voltage_t_v": voltage_t_v,
            "current_r_a": current_r_a,
            "current_s_a": current_s_a,
            "current_t_a": current_t_a,
            "power_factor": power_factor,
            "metrics": {
                "interval_min": 15,
                "source": "solis_15min_backfill"
            }
        })
        
        # String channels (up to string_count)
        for s_idx in range(1, string_count + 1):
            v_val = d.get(f"uPv{s_idx}")
            i_val = d.get(f"iPv{s_idx}")
            v = round(float(v_val), 1) if v_val is not None else 0.0
            curr = round(float(i_val), 2) if i_val is not None else 0.0
            
            # Skip if zero/empty
            if v <= 5.0 and curr <= 0.01:
                continue
                
            str_id = strings_map.get(s_idx)
            if str_id:
                p_kw = round((v * curr) / 1000.0, 3)
                string_telemetry_rows.append({
                    "string_id": str_id,
                    "timestamp": ts_iso,
                    "voltage_v": v,
                    "current_a": curr,
                    "power_kw": p_kw,
                    "status": "ok" if v > 50 else "offline"
                })
                
    # Insert batches
    if telemetry_rows:
        supabase_post("telemetry", telemetry_rows, ignore_duplicates=True)
    if string_telemetry_rows:
        supabase_post("string_telemetry", string_telemetry_rows, ignore_duplicates=True)
        
    return len(telemetry_rows), len(string_telemetry_rows)

def backfill_inverter_history(inv: dict, max_days: int = None):
    inv_uuid = inv["id"]
    oem_device_id = inv["oem_device_id"]
    sn = inv["serial_number"]
    capacity_kw = float(inv.get("capacity_kw") or 1.0)
    string_count = int(inv.get("string_count") or 8)
    inst_date_str = inv.get("installed_on") or "2026-01-01"
    site_name = inv.get("sites", {}).get("name") if inv.get("sites") else "Unknown"

    try:
        start_date = datetime.strptime(inst_date_str[:10], "%Y-%m-%d").date()
    except Exception:
        start_date = datetime.strptime("2026-01-01", "%Y-%m-%d").date()

    today = datetime.now(timezone.utc).date()
    total_days_span = (today - start_date).days
    if max_days and total_days_span > max_days:
        start_date = today - timedelta(days=max_days)
        total_days_span = max_days

    # Build dates list (from yesterday backwards to start_date, and today)
    dates_list = []
    curr = today
    while curr >= start_date:
        dates_list.append(curr.strftime("%Y-%m-%d"))
        curr -= timedelta(days=1)

    print(f"\n=======================================================")
    print(f"[{inv['serial_number']}] {site_name}")
    print(f"Tracking Start: {start_date} | Days to scan: {len(dates_list)} | Strings: {string_count}")
    print(f"=======================================================")

    strings_map = get_or_create_strings_map(inv_uuid, capacity_kw, string_count)
    existing_dates = get_existing_detailed_dates(inv_uuid)
    print(f"Dates already having detailed 15-min points in DB: {len(existing_dates)}")

    pending_dates = [d for d in dates_list if d not in existing_dates]
    print(f"Pending dates to fetch from Solis API: {len(pending_dates)}")

    if not pending_dates:
        print(f"All dates already up-to-date for Inverter {sn}!")
        return 0, 0

    total_tel = 0
    total_str = 0

    # Process pending dates concurrently with 6 workers
    max_workers = 6
    completed_days = 0
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(process_inverter_day, inv_uuid, oem_device_id, sn, capacity_kw, string_count, date_str, strings_map): date_str
            for date_str in pending_dates
        }
        for future in as_completed(futures):
            completed_days += 1
            date_str = futures[future]
            try:
                t_cnt, s_cnt = future.result()
                total_tel += t_cnt
                total_str += s_cnt
                if t_cnt > 0:
                    print(f"  [{completed_days}/{len(pending_dates)}] {date_str}: +{t_cnt} tel, +{s_cnt} str", flush=True)
                elif completed_days % 15 == 0 or completed_days == len(pending_dates):
                    print(f"  [{completed_days}/{len(pending_dates)}] scanned up to {date_str}", flush=True)
            except Exception as e:
                print(f"  Error on {date_str}: {e}", flush=True)

    print(f"Done Inverter {sn}: Total inserted: {total_tel} telemetry, {total_str} string telemetry.")
    return total_tel, total_str

def main():
    parser = argparse.ArgumentParser(description="Full 15-minute historical backfill for Solis Inverters")
    parser.add_argument("--inverter-sn", type=str, help="Process only a specific inverter serial number")
    parser.add_argument("--max-days", type=int, help="Optional maximum lookback days (default: all days since COD)")
    args = parser.parse_args()

    print("Fetching inverters list from Supabase...")
    params = {"select": "id,oem_device_id,serial_number,capacity_kw,string_count,installed_on,sites(name)"}
    if args.inverter_sn:
        params["serial_number"] = f"eq.{args.inverter_sn}"

    inverters = supabase_get("inverters", params)
    print(f"Found {len(inverters)} inverter(s) to process.")

    grand_tel = 0
    grand_str = 0
    start_time = time.time()

    for idx, inv in enumerate(inverters, 1):
        print(f"\n>>>>> Inverter [{idx}/{len(inverters)}] <<<<<")
        t_cnt, s_cnt = backfill_inverter_history(inv, max_days=args.max_days)
        grand_tel += t_cnt
        grand_str += s_cnt

    elapsed = round(time.time() - start_time, 1)
    print(f"\n=======================================================")
    print(f"ALL INVERTERS 15-MINUTE HISTORICAL BACKFILL COMPLETE!")
    print(f"Total Telemetry records inserted: {grand_tel}")
    print(f"Total String Telemetry records inserted: {grand_str}")
    print(f"Duration: {elapsed} seconds")
    print(f"=======================================================")

if __name__ == "__main__":
    main()
