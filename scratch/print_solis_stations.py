import os
import sys
from dotenv import load_dotenv

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

from solis_service import call_solis

def print_stations():
    print("Fetching station list from Solis...")
    res = call_solis("/v1/api/userStationList", {"pageNo": 1, "pageSize": 100})
    if res.get("code") == "0":
        stations = res.get("data", {}).get("page", {}).get("records", [])
        print(f"Found {len(stations)} station(s):")
        for s in stations:
            print(f"  ID: {s.get('id')} | Name: {s.get('sName') or s.get('stationName')} | Capacity: {s.get('capacity')} | Timezone: {s.get('timeZoneStandardId') or s.get('timezone')}")
            # print all keys of the first station
            print("  Station details:")
            for k, v in s.items():
                print(f"    {k}: {v}")
    else:
        print(f"Error fetching stations: {res.get('msg')}")

if __name__ == "__main__":
    print_stations()
