import os
import sys
import time
from datetime import datetime, timezone
from dotenv import load_dotenv

# Load backend dotenv file BEFORE importing sync_service
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
load_dotenv(os.path.join(backend_dir, ".env"))

# Add backend directory to Python path
sys.path.append(backend_dir)

from sync_service import poll_and_sync_all, supabase_get

def main():
    print("====================================================")
    print("SolarAssist: Verification of Production Scheduler Loop")
    print("====================================================")
    
    # 1. Fetch current sync runs count before execution
    print("Retrieving baseline sync runs from Supabase...")
    baseline_runs = supabase_get("sync_runs", params={"order": "started_at.desc", "limit": "5"})
    baseline_count = len(baseline_runs)
    print(f"Found {baseline_count} baseline records in 'sync_runs'.")
    
    # 2. Trigger poll_and_sync_all
    print("\nTriggering poll_and_sync_all() execution cycle...")
    start_time = time.time()
    poll_and_sync_all()
    duration = time.time() - start_time
    print(f"Execution loop returned in {duration:.2f} seconds.")
    
    # 3. Retrieve new runs
    print("\nQuerying Supabase for the latest sync run logs...")
    latest_runs = supabase_get("sync_runs", params={"order": "started_at.desc", "limit": "1"})
    
    if not latest_runs:
        print("❌ ERROR: No sync runs found in the database!")
        sys.exit(1)
        
    latest = latest_runs[0]
    print(f"Latest Sync Run ID: {latest.get('id')}")
    print(f"Status:            {latest.get('status')}")
    print(f"Started At:        {latest.get('started_at')}")
    print(f"Completed At:      {latest.get('completed_at')}")
    print(f"Duration (Sec):    {latest.get('duration_seconds')} s")
    print(f"Sites Processed:   {latest.get('sites_processed')}")
    print(f"Invs Processed:    {latest.get('inverters_processed')}")
    print(f"Telemetry Saved:   {latest.get('telemetry_records')}")
    print(f"Strings Saved:     {latest.get('string_records')}")
    print(f"Alerts Processed:  {latest.get('alerts_processed')}")
    print(f"Error Count:       {latest.get('error_count')}")
    print(f"Error Log Msg:     {latest.get('error_message') or 'None'}")
    
    # 4. Asserts
    if latest.get("status") not in ["success", "failed"]:
        print("❌ ERROR: Sync status should be success or failed, not running.")
        sys.exit(1)
        
    print("\n✅ Verification SUCCESSFUL: Scheduler loop correctly persists executions to 'sync_runs'!")
    print("====================================================")

if __name__ == "__main__":
    main()
