import os
import sys
from dotenv import load_dotenv

# Ensure we import from the backend directory
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))

# Load environment variables from backend/.env
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

from sync_service import poll_and_sync_all, supabase_get

def print_db_state():
    print("\n--- Current Database State ---")
    
    # Print sites
    try:
        sites = supabase_get("sites")
        print(f"Sites ({len(sites)}):")
        for s in sites:
            print(f"  - '{s.get('name')}' (ID: {s.get('id')}, Capacity: {s.get('capacity_kwp')} kWp)")
    except Exception as e:
        print(f"  Error fetching sites: {e}")
        
    # Print inverters
    try:
        inverters = supabase_get("inverters")
        print(f"Inverters ({len(inverters)}):")
        for i in inverters:
            print(f"  - SN: {i.get('serial_number')} | Model: {i.get('model')} | Site ID: {i.get('site_id')}")
    except Exception as e:
        print(f"  Error fetching inverters: {e}")
        
    # Print row counts of telemetry
    try:
        telemetries = supabase_get("telemetry")
        print(f"Total Telemetry Rows: {len(telemetries)}")
    except Exception as e:
        print(f"  Error fetching telemetry: {e}")
        
    print("-----------------------------\n")

if __name__ == "__main__":
    print("🚀 Starting real Solis portfolio sync test...")
    
    print("\n[Step 1] Initial database state:")
    print_db_state()
    
    print("\n[Step 2] Executing Solis sync cycle...")
    poll_and_sync_all()
    
    print("\n[Step 3] Database state after sync:")
    print_db_state()
    
    print("\n[Step 4] Checking integration config on Supabase...")
    try:
        integrations = supabase_get("oem_integrations", params={"is_active": "eq.true"})
        if integrations:
            config = integrations[0].get("config", {})
            plants = config.get("plants", [])
            print(f"Mapped Plants in oem_integrations ({len(plants)}):")
            for p in plants:
                print(f"  Solis Plant ID: {p.get('plant_id')} -> Site ID: {p.get('site_id')}")
        else:
            print("No active integrations found.")
    except Exception as e:
        print(f"Error fetching integration: {e}")
        
    print("\n[Step 5] Executing second sync to confirm duplicate prevention...")
    poll_and_sync_all()
    
    print("\n[Step 6] Database state after second sync:")
    print_db_state()
    
    print("\n✅ Portfolio sync test finished.")
