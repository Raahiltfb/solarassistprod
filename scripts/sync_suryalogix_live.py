#!/usr/bin/env python3
"""
Sync live Suryalogix telemetry and update inverter online status in Supabase.
"""

import time
import requests
import json
from datetime import datetime, timezone

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE"

SURYALOGIX_URL = "https://cloud.suryalog.ae/api/get_datalog_v7.php"
SECRET = "cd8ae85e44e2ca7d997904893f8fb7fe"

PLANTS = [
    ("dHVSQWF5TVZoUHF3UmlZS2trUTk5b2YzN2Y2VGcyN2dvQktTMGU0SU5xQT0=", "OMYA Inoj Warehouse"),
    ("RG9SK3RPbC8yV0o1ODR4U3kzZ2ZIaGF3ZDdPUTdhODF5d2xkL3ZJYW4rcz0=", "OMYA Inoj Stockpile"),
    ("VlpaWHZFU2ZtWE00YlFJMDZHQTlVdXUvdkMvWjM4c2oxNFlXVWJ3MnV4Yz0=", "OMYA Inoj Car Port")
]


def sync():
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }

    # 1. Fetch inverters from Supabase
    r = requests.get(f"{SUPABASE_URL}/rest/v1/inverters?oem=eq.suryalogix&select=id,site_id,serial_number,oem_device_id,capacity_kw", headers=headers)
    r.raise_for_status()
    db_inverters = {inv["oem_device_id"]: inv for inv in r.json()}
    print(f"Loaded {len(db_inverters)} Suryalogix inverters from database.")

    # Fetch strings map
    r_str = requests.get(f"{SUPABASE_URL}/rest/v1/strings?select=id,inverter_id,string_index", headers=headers)
    r_str.raise_for_status()
    strings_map = {(s["inverter_id"], s["string_index"]): s["id"] for s in r_str.json()}

    now = int(time.time())
    updated_invs = 0
    inserted_telemetry = 0

    for plant_id, plant_name in PLANTS:
        print(f"\n--- Fetching live data for {plant_name} ---")
        time.sleep(3.5) # Rate pacing for Suryalogix
        payload = {
            "secret": SECRET,
            "plant": plant_id,
            "format": "std",
            "for": "data",
            "stime": str(now - 7200),
            "etime": str(now)
        }

        resp = requests.post(SURYALOGIX_URL, json=payload, timeout=20)
        if resp.status_code != 200:
            print(f"Failed to fetch {plant_name}: HTTP {resp.status_code}")
            continue

        resp_json = resp.json()
        if resp_json.get("result") != 0:
            print(f"Warning for {plant_name}: {resp_json.get('cmsg')} (code {resp_json.get('result')})")
            continue

        data = resp_json.get("data")
        if not isinstance(data, dict) or not data:
            print(f"No telemetry frames returned for {plant_name}")
            continue

        timestamps = sorted(data.keys(), key=lambda x: int(x))
        latest_ts = timestamps[-1]
        entry = data[latest_ts]
        inverters_data = entry.get("inverter", {})
        iso_time = datetime.fromtimestamp(int(latest_ts), tz=timezone.utc).isoformat()
        diff_mins = (now - int(latest_ts)) / 60.0
        print(f"Latest timestamp: {latest_ts} ({iso_time}, {diff_mins:.1f} mins ago). Inverters: {len(inverters_data)}")

        for inv_id, inv in inverters_data.items():
            oem_dev_id = f"{plant_id}#{inv_id}"
            db_inv = db_inverters.get(oem_dev_id)
            if not db_inv:
                continue

            inv_pk = db_inv["id"]
            ac_cap = float(db_inv.get("capacity_kw") or inv.get("AC_CAP") or 50.0)
            ac_power_kw = round(float(inv.get("WT") or 0) / 1000.0, 3)
            dc_power_kw = round(float(inv.get("DC_W") or 0) / 1000.0, 3)
            
            daily_kwh_raw = float(inv.get("KWH_Day") or (float(inv.get("WHDay") or 0) / 1000.0))
            daily_kwh = daily_kwh_raw if (0 < daily_kwh_raw <= max(ac_cap * 12.0, 600.0)) else (float(inv.get("WHDay") or 0))
            if daily_kwh > max(ac_cap * 12.0, 600.0):
                daily_kwh = round(daily_kwh / 1000.0, 2)
            else:
                daily_kwh = round(daily_kwh, 2)

            total_kwh = float(inv.get("WHTot") or 0)
            temp_c = float(inv.get("TEMP_HS") or inv.get("TEMP_INT") or 35.0)
            inv_st = inv.get("inverter_status")
            
            is_generating = (ac_power_kw > 0.05) or (dc_power_kw > 0.05)
            is_online_code = (inv_st in (4, 8) or str(inv_st) in ("4", "8"))
            is_fault = (inv_st == 5 or str(inv_st) == "5")

            if is_fault:
                effective_status = "fault"
                is_online = False
            elif is_generating:
                effective_status = "online"
                is_online = True
            elif diff_mins > 120:
                effective_status = "offline"
                is_online = False
            elif is_online_code:
                effective_status = "online"
                is_online = True
            else:
                effective_status = "standby"
                is_online = True

            efficiency = round(min(100.0, max(0.0, (ac_power_kw / dc_power_kw) * 100.0)), 2) if dc_power_kw > 0 else (98.0 if is_online else 0.0)
            specific_yield = round(daily_kwh / ac_cap, 3) if ac_cap > 0 else 0.0

            # 1. Update inverter row
            upd_payload = {
                "status": effective_status,
                "last_seen_at": iso_time
            }
            r_upd = requests.patch(
                f"{SUPABASE_URL}/rest/v1/inverters?id=eq.{inv_pk}",
                headers=headers,
                json=upd_payload
            )
            if r_upd.status_code in (200, 204):
                updated_invs += 1
            else:
                print(f"Error updating inverter {inv_pk}: {r_upd.text}")

            # 2. Insert telemetry row
            addon = inv.get("ADDON_DATA") if isinstance(inv.get("ADDON_DATA"), dict) else {}
            tel_payload = {
                "inverter_id": inv_pk,
                "timestamp": iso_time,
                "ac_power_kw": ac_power_kw,
                "dc_power_kw": dc_power_kw,
                "energy_kwh": total_kwh,
                "efficiency_pct": efficiency,
                "temperature_c": temp_c,
                "daily_generation_kwh": daily_kwh,
                "total_generation_kwh": total_kwh,
                "specific_yield": specific_yield,
                "online_status": is_online,
                "last_update": datetime.now(timezone.utc).isoformat(),
                "frequency_hz": float(inv.get("FREQ") or 50.0),
                "power_factor": float(inv.get("PFT") or 1.0),
                "voltage_r_v": float(addon.get("V1") or inv.get("VT") or 0) or None,
                "voltage_s_v": float(addon.get("V2") or inv.get("VT") or 0) or None,
                "voltage_t_v": float(addon.get("V3") or inv.get("VT") or 0) or None,
                "current_r_a": float(addon.get("I1") or (float(inv.get("IT") or 0) / 3.0)) or None,
                "current_s_a": float(addon.get("I2") or (float(inv.get("IT") or 0) / 3.0)) or None,
                "current_t_a": float(addon.get("I3") or (float(inv.get("IT") or 0) / 3.0)) or None,
                "metrics": {
                    "raw_suryalog_status": inv.get("suryalog_status"),
                    "raw_inverter_status": inv_st,
                    "WT": inv.get("WT"),
                    "DC_W": inv.get("DC_W"),
                    "WHDay": inv.get("WHDay")
                }
            }
            r_tel = requests.post(
                f"{SUPABASE_URL}/rest/v1/telemetry?on_conflict=inverter_id,timestamp",
                headers={**headers, "Prefer": "resolution=ignore-duplicates"},
                json=[tel_payload]
            )
            if r_tel.status_code in (200, 201):
                inserted_telemetry += 1

            # 3. Insert string telemetry
            mpp_data = inv.get("MPP_DATA")
            if isinstance(mpp_data, str):
                try:
                    mpp_data = json.loads(mpp_data)
                except Exception:
                    mpp_data = {}
            elif not isinstance(mpp_data, dict):
                mpp_data = {}

            st_rows = []
            for s_idx in range(1, 19):
                v_str = float(inv.get(f"MPP_V{s_idx}") or mpp_data.get(f"v{s_idx}") or 0.0)
                i_str = float(inv.get(f"MPP_I{s_idx}") or mpp_data.get(f"i{s_idx}") or 0.0)
                if v_str > 10.0 or i_str > 0.05:
                    p_kw = round((v_str * i_str) / 1000.0, 3)
                    s_id = strings_map.get((inv_pk, s_idx))
                    if s_id:
                        st_rows.append({
                            "string_id": s_id,
                            "timestamp": iso_time,
                            "voltage_v": v_str,
                            "current_a": i_str,
                            "power_kw": p_kw,
                            "status": "ok" if p_kw > 0.05 else "low_current",
                            "metrics": {"string_index": s_idx}
                        })
            if st_rows:
                requests.post(
                    f"{SUPABASE_URL}/rest/v1/string_telemetry?on_conflict=string_id,timestamp",
                    headers={**headers, "Prefer": "resolution=ignore-duplicates"},
                    json=st_rows
                )

            print(f"  {inv_id} ({db_inv['serial_number']}): {effective_status.upper()} | {ac_power_kw} kW AC | {daily_kwh} kWh Day | inv_status={inv_st}")

    # Make sure Suryalogix sites are active
    requests.patch(
        f"{SUPABASE_URL}/rest/v1/sites?id=in.(b8ac348f-f497-4e93-a057-9c045cc72909,3cdaa12c-7569-46f7-8c51-91706d1fd243,e35b62a3-4f1c-4c1d-8945-40df7bb31b1d)",
        headers=headers,
        json={"status": "active"}
    )

    print(f"\n=== SYNC COMPLETE ===")
    print(f"Inverters updated: {updated_invs}/{len(db_inverters)}")
    print(f"Telemetry inserted: {inserted_telemetry}")


if __name__ == "__main__":
    sync()
