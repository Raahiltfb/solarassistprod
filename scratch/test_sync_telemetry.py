import os
import sys
import json
sys.path.append(os.path.join(os.getcwd(), "backend"))

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv("backend/.env")

from adapters.solis import SolisAdapter
from sync_service import supabase_post, supabase_get

key_id = os.getenv("SOLIS_KEY_ID") or "1300386381678106385"
key_secret = os.getenv("SOLIS_KEY_SECRET") or "a21fcc244b2f4fe48097ceca92a1c160"
api_url = os.getenv("SOLIS_API_URL") or "https://www.soliscloud.com:13333"

adapter = SolisAdapter(key_id=key_id, key_secret=key_secret, api_url=api_url)

# Inverter details
inv_id = "e5ba6438-2495-41c8-a048-9e2266038c75" # Solis-60K-4G in DB
oem_device_id = "1308675217950723534"          # Solis OEM ID

print("Fetching telemetry from Solis Cloud...")
telemetry, string_telemetries = adapter.fetch_telemetry(oem_device_id)

if telemetry:
    print("Succeeded! Storing in DB...")
    # Delete if exists to prevent duplicate skip
    import requests
    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    requests.delete(f"{url}/rest/v1/telemetry?inverter_id=eq.{inv_id}&timestamp=eq.{telemetry.timestamp}", headers=headers)
    
    # Post it
    payload = {
        "inverter_id": inv_id,
        "timestamp": telemetry.timestamp,
        "ac_power_kw": telemetry.ac_power_kw,
        "dc_power_kw": telemetry.dc_power_kw,
        "energy_kwh": telemetry.energy_kwh,
        "efficiency_pct": telemetry.efficiency_pct,
        "temperature_c": telemetry.temperature_c,
        "daily_generation_kwh": telemetry.daily_generation_kwh,
        "total_generation_kwh": telemetry.total_generation_kwh,
        "specific_yield": telemetry.specific_yield,
        "online_status": telemetry.online_status,
        "last_update": telemetry.last_update,
        "frequency_hz": telemetry.frequency_hz,
        "reactive_power_kvar": telemetry.reactive_power_kvar,
        "power_factor": telemetry.power_factor,
        "current_r_a": telemetry.current_r_a,
        "current_s_a": telemetry.current_s_a,
        "current_t_a": telemetry.current_t_a,
        "voltage_r_v": telemetry.voltage_r_v,
        "voltage_s_v": telemetry.voltage_s_v,
        "voltage_t_v": telemetry.voltage_t_v,
        "apparent_power_kva": telemetry.apparent_power_kva,
        "metrics": telemetry.metrics
    }
    
    res = supabase_post("telemetry", [payload], headers_override={"Prefer": "return=representation"})
    print("\n--- DB Telemetry Inserted Row ---")
    print(json.dumps(res[0], indent=2))
else:
    print("Failed to fetch telemetry.")
