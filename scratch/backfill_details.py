import os
import sys
import time
import argparse
import requests
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

sys.path.append(os.path.join(os.getcwd(), "backend"))

load_dotenv(".env")
load_dotenv("backend/.env")

from adapters.solis import SolisAdapter

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Missing Supabase credentials.")
    sys.exit(1)

adapter = SolisAdapter(
    key_id=os.getenv("SOLIS_KEY_ID"),
    key_secret=os.getenv("SOLIS_KEY_SECRET"),
    api_url=os.getenv("SOLIS_API_URL")
)


def supabase_select(table: str, params=None):
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
            print(f"  Connection attempt {attempt+1} failed: {e}")
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
            print(f"  Connection attempt {attempt+1} failed: {e}")
            time.sleep(2)
    return []


def get_or_create_strings(inverter_id: str, capacity_kw: float, string_count_limit: int) -> dict:
    """Fetch existing strings or dynamically insert missing strings to return a mapping index -> string_id."""
    existing = supabase_select("strings", {
        "select": "id,string_index",
        "inverter_id": f"eq.{inverter_id}"
    })
    string_map = {int(s["string_index"]): s["id"] for s in existing}
    
    # Pre-create all strings if count is less than target
    capacity_per_str = round((capacity_kw / string_count_limit), 2) if string_count_limit > 0 else 0.0
    for idx in range(1, string_count_limit + 1):
        if idx not in string_map:
            # Create
            new_str_row = {
                "inverter_id": inverter_id,
                "string_index": idx,
                "modules_count": 20,
                "capacity_kw": capacity_per_str,
                "status": "ok"
            }
            inserted = supabase_insert("strings", [new_str_row])
            if inserted:
                string_map[idx] = inserted[0]["id"]
                
    return string_map


def backfill_detailed_telemetry(days_count: int, target_inverter_id: str = None, dry_run: bool = False):
    print("Fetching inverters list from Supabase...")
    params = {"select": "id,oem_device_id,serial_number,capacity_kw,string_count"}
    if target_inverter_id:
        params["id"] = f"eq.{target_inverter_id}"
        
    inverters = supabase_select("inverters", params)
    if not inverters:
        print("No inverters found.")
        return
        
    print(f"Processing {len(inverters)} inverter(s).")
    
    # Generate list of days to process (excluding today, going back days_count)
    today = datetime.now(timezone.utc).date()
    dates_list = [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(1, days_count + 1)]
    print(f"Lookback window: {dates_list[-1]} to {dates_list[0]} ({days_count} days)")
    
    total_telemetry_inserted = 0
    total_strings_inserted = 0
    
    for idx, inv in enumerate(inverters, start=1):
        inv_uuid = inv["id"]
        oem_device_id = inv["oem_device_id"]
        sn = inv["serial_number"]
        capacity_kw = float(inv.get("capacity_kw") or 1.0)
        string_count_limit = int(inv.get("string_count") or 8)
        
        print(f"\n[{idx}/{len(inverters)}] Inverter SN: {sn} | OEM ID: {oem_device_id} | Capacity: {capacity_kw} kW")
        
        # Resolve strings database mapping
        if not dry_run:
            strings_map = get_or_create_strings(inv_uuid, capacity_kw, string_count_limit)
        else:
            strings_map = {i: f"dummy-str-id-{i}" for i in range(1, 33)}
            
        consecutive_empty_days = 0
        
        for date_str in dates_list:
            day_start = f"{date_str}T00:00:00.000Z"
            day_end = f"{date_str}T23:59:59.999Z"
            
            # Check if detailed 5-minute records already exist for this date
            # Excluding the single midday summary backfill row (exact 12:00:00Z)
            existing = supabase_select("telemetry", [
                ("select", "timestamp"),
                ("inverter_id", f"eq.{inv_uuid}"),
                ("timestamp", f"gte.{day_start}"),
                ("timestamp", f"lte.{day_end}"),
                ("limit", "5")
            ])
            
            # If we already have more than 1 record (e.g. 15-minute polling rows), skip
            # If we only have 1 row which is the midday row, we can overwrite it or proceed
            detailed_exists = any(not r["timestamp"].split("T")[1].startswith("12:00:00") for r in existing)
            if len(existing) > 1 or detailed_exists:
                print(f"  Date {date_str} already has detailed telemetry. Skipping.")
                consecutive_empty_days = 0
                continue
                
            print(f"  Fetching date {date_str} from Solis inverterDay...", end=" ", flush=True)
            time.sleep(0.5)
            
            res = adapter._call_solis("/v1/api/inverterDay", {
                "id": oem_device_id,
                "sn": sn,
                "money": "INR",
                "time": date_str,
                "timeZone": 5.5
            })
            
            if res.get("code") != "0":
                print(f"FAILED (Code: {res.get('code')}, Msg: {res.get('msg')})")
                consecutive_empty_days += 1
                if consecutive_empty_days >= 5:
                    print("    Reached 5 consecutive empty days. Stopping scan.")
                    break
                continue
                
            data_points = res.get("data", [])
            if not isinstance(data_points, list) or len(data_points) == 0:
                print("NO DATA")
                consecutive_empty_days += 1
                if consecutive_empty_days >= 5:
                    print("    Reached 5 consecutive empty days. Stopping scan.")
                    break
                continue
                
            consecutive_empty_days = 0
            print(f"OK ({len(data_points)} points returned)")
            
            telemetry_batch = []
            string_telemetry_batch = []
            
            # Map each 5-minute data point
            for d in data_points:
                ts = d.get("dataTimestamp") or d.get("updateTime")
                if not ts:
                    continue
                    
                timestamp_iso = datetime.fromtimestamp(int(ts)/1000, tz=timezone.utc).isoformat()
                
                ac_power_kw = float(d.get("pac") or 0.0)
                dc_power_kw = float(d.get("dcPac") or ac_power_kw)
                energy_kwh = float(d.get("eToday") or 0.0)
                efficiency_pct = float(d.get("efficiency") or 95.0)
                temperature_c = float(d.get("inverterTemperature") or 35.0)
                
                state_val = d.get("state")
                online_status = True if (state_val == 1 or state_val == "1") else False
                
                frequency_hz = float(d.get("fac") or 0.0)
                reactive_power_kvar = float(d.get("reactivePower") or 0.0)
                power_factor = float(d.get("powerFactor") or 1.0)
                
                current_r_a = float(d.get("iAc1") or 0.0)
                current_s_a = float(d.get("iAc2") or 0.0)
                current_t_a = float(d.get("iAc3") or 0.0)
                voltage_r_v = float(d.get("uAc1") or 0.0)
                voltage_s_v = float(d.get("uAc2") or 0.0)
                voltage_t_v = float(d.get("uAc3") or 0.0)
                apparent_power_kva = float(d.get("apparentPower") or 0.0)
                
                battery_soc_pct = float(d.get("batteryCapacitySoc") or 0.0) if "batteryCapacitySoc" in d else None
                battery_soh_pct = float(d.get("batteryHealthSoh") or 0.0) if "batteryHealthSoh" in d else None
                battery_power_kw = float(d.get("batteryPower") or 0.0) if "batteryPower" in d else None
                battery_voltage_v = float(d.get("batteryVoltage") or 0.0) if "batteryVoltage" in d else None
                battery_current_a = float(d.get("bstteryCurrent") or 0.0) if "bstteryCurrent" in d else None
                
                load_power_kw = float(d.get("familyLoadPower") or 0.0) if "familyLoadPower" in d else None
                grid_purchased_today_kwh = float(d.get("gridPurchasedTodayEnergy") or 0.0) if "gridPurchasedTodayEnergy" in d else None
                grid_sell_today_kwh = float(d.get("gridSellTodayEnergy") or 0.0) if "gridSellTodayEnergy" in d else None
                load_today_kwh = float(d.get("homeLoadTodayEnergy") or 0.0) if "homeLoadTodayEnergy" in d else None
                
                vendor_metrics = {
                    "dcBus": d.get("dcBus"),
                    "dcBusHalf": d.get("dcBusHalf"),
                    "simFlowState": d.get("simFlowState"),
                    "fullHour": d.get("fullHour"),
                    "totalFullHour": d.get("totalFullHour"),
                    "backfilled": True
                }
                
                # Extract MPPT parameters
                for mppt_idx in range(1, 21):
                    upv = d.get(f"mpptUpv{mppt_idx}")
                    ipv = d.get(f"mpptIpv{mppt_idx}")
                    pow_val = d.get(f"mpptPow{mppt_idx}")
                    if upv is not None:
                        vendor_metrics[f"mpptUpv{mppt_idx}"] = float(upv)
                    if ipv is not None:
                        vendor_metrics[f"mpptIpv{mppt_idx}"] = float(ipv)
                    if pow_val is not None:
                        vendor_metrics[f"mpptPow{mppt_idx}"] = float(pow_val)
                        
                telemetry_row = {
                    "inverter_id": inv_uuid,
                    "timestamp": timestamp_iso,
                    "ac_power_kw": ac_power_kw,
                    "dc_power_kw": dc_power_kw,
                    "energy_kwh": energy_kwh,
                    "efficiency_pct": efficiency_pct,
                    "temperature_c": temperature_c,
                    "daily_generation_kwh": energy_kwh,
                    "total_generation_kwh": float(d.get("eTotal") or 0.0),
                    "specific_yield": round(energy_kwh / capacity_kw, 2),
                    "online_status": online_status,
                    "frequency_hz": frequency_hz,
                    "reactive_power_kvar": reactive_power_kvar,
                    "power_factor": power_factor,
                    "current_r_a": current_r_a,
                    "current_s_a": current_s_a,
                    "current_t_a": current_t_a,
                    "voltage_r_v": voltage_r_v,
                    "voltage_s_v": voltage_s_v,
                    "voltage_t_v": voltage_t_v,
                    "apparent_power_kva": apparent_power_kva,
                    "battery_soc_pct": battery_soc_pct,
                    "battery_soh_pct": battery_soh_pct,
                    "battery_power_kw": battery_power_kw,
                    "battery_voltage_v": battery_voltage_v,
                    "battery_current_a": battery_current_a,
                    "load_power_kw": load_power_kw,
                    "grid_purchased_today_kwh": grid_purchased_today_kwh,
                    "grid_sell_today_kwh": grid_sell_today_kwh,
                    "load_today_kwh": load_today_kwh,
                    "metrics": {k: v for k, v in vendor_metrics.items() if v is not None}
                }
                
                telemetry_batch.append(telemetry_row)
                
                # Strings Telemetry
                for str_idx in range(1, string_count_limit + 1):
                    v = d.get(f"uPv{str_idx}")
                    curr = d.get(f"iPv{str_idx}")
                    voltage_v = round(float(v), 2) if v else 0.0
                    current_a = round(float(curr), 2) if curr else 0.0
                    
                    # Ignore completely unconnected/zero values
                    if voltage_v <= 10.0 and current_a <= 0.0:
                        continue
                        
                    string_id = strings_map.get(str_idx)
                    if string_id:
                        string_telemetry_batch.append({
                            "string_id": string_id,
                            "timestamp": timestamp_iso,
                            "voltage_v": voltage_v,
                            "current_a": current_a,
                            "power_kw": round((voltage_v * current_a) / 1000.0, 3),
                            "status": "ok" if voltage_v > 50 else "offline"
                        })
                        
            # Clean up the single backfill summary record (timestamp 12:00:00Z) if we are importing detailed curves
            # This keeps the charts 100% consistent and avoids duplicate peaks
            summary_row = [r for r in existing if r["timestamp"].endswith("T12:00:00.000Z")]
            if summary_row and not dry_run:
                requests.delete(
                    f"{SUPABASE_URL}/rest/v1/telemetry",
                    headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
                    params={"inverter_id": f"eq.{inv_uuid}", "timestamp": f"eq.{summary_row[0]['timestamp']}"}
                )
                
            if dry_run:
                print(f"    [DRY RUN] Would insert {len(telemetry_batch)} telemetry and {len(string_telemetry_batch)} string telemetry records.")
            else:
                # Insert telemetry batch
                if telemetry_batch:
                    batch_size = 100
                    for i in range(0, len(telemetry_batch), batch_size):
                        inserted_tel = supabase_insert("telemetry", telemetry_batch[i:i+batch_size])
                        total_telemetry_inserted += len(inserted_tel)
                        
                # Insert string telemetry batch
                if string_telemetry_batch:
                    batch_size = 200
                    for i in range(0, len(string_telemetry_batch), batch_size):
                        inserted_str = supabase_insert("string_telemetry", string_telemetry_batch[i:i+batch_size])
                        total_strings_inserted += len(inserted_str)
                        
    print("\nDetailed backfill complete.")
    print(f"Total telemetry records inserted: {total_telemetry_inserted}")
    print(f"Total string telemetry records inserted: {total_strings_inserted}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Historical Solis Detailed & String Backfill Service")
    parser.add_argument("--dry-run", action="store_true", help="Perform API queries without database writes.")
    parser.add_argument("--inverter-id", type=str, help="Specify a single inverter UUID to process.")
    parser.add_argument("--days", type=int, default=30, help="Number of historical days to process (default: 30).")
    
    args = parser.parse_args()
    
    backfill_detailed_telemetry(days_count=args.days, target_inverter_id=args.inverter_id, dry_run=args.dry_run)
