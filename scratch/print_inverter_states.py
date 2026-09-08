import os
import sys
import json
sys.path.append(os.path.join(os.getcwd(), "backend"))

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv("backend/.env")

from adapters.solis import SolisAdapter

key_id = os.getenv("SOLIS_KEY_ID")
key_secret = os.getenv("SOLIS_KEY_SECRET")
api_url = os.getenv("SOLIS_API_URL")

adapter = SolisAdapter(key_id=key_id, key_secret=key_secret, api_url=api_url)

stations = adapter.list_stations()
print(f"Found {len(stations)} stations.")

state_counts = {}
inverters_info = []

for s in stations:
    plant_id = s.plant_id
    devs = adapter.list_devices(plant_id)
    for d in devs:
        inverters_info.append({
            "station_name": s.name,
            "sn": d.serial_number,
            "status": d.status,
            "last_seen": d.last_seen_at
        })
        state_counts[d.status] = state_counts.get(d.status, 0) + 1

print("\n--- INVERTER STATUS COUNTS FROM ADAPTER ---")
print(state_counts)

print("\n--- INVERTERS DETAILED INFO ---")
for inv in inverters_info:
    print(f"Station: {inv['station_name']} | SN: {inv['sn']} | Status: {inv['status']} | Last Seen: {inv['last_seen']}")
