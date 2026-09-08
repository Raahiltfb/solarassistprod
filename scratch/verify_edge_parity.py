import os
import sys
import time
import requests
from dotenv import load_dotenv

# Load env variables
load_dotenv(".env")
load_dotenv("backend/.env")
load_dotenv("frontend/.env.local")

# Add backend directory to Python path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.append(backend_dir)

from sync_service import supabase_get

def main():
    print("====================================================")
    print("SolarAssist: Parity Verification (Python vs Deno Edge Function)")
    print("====================================================")

    # 1. Trigger Deno Edge Function
    print("\n1. Triggering Deno Edge Function locally on port 8000...")
    cron_secret = os.getenv("CRON_SECRET") or "secret"
    headers = {
        "Authorization": f"Bearer {cron_secret}"
    }
    
    start_deno = time.time()
    try:
        res = requests.get("http://localhost:8000/?trigger_source=deno_manual", headers=headers, timeout=120)
        deno_time = time.time() - start_deno
        print(f"Status Code: {res.status_code}")
        print("Response:", res.json())
        if res.status_code != 200:
            print("❌ ERROR: Deno Edge Function execution failed!")
            sys.exit(1)
        print(f"✓ Deno Edge Function sync completed in {deno_time:.2f} seconds.")
    except Exception as e:
        print(f"❌ ERROR: Failed to call local Deno server: {e}")
        print("Please verify the Deno server is running on port 8000.")
        sys.exit(1)

    # 2. Trigger Python Sync Pipeline Directly
    print("\n2. Triggering Python Ingestion Pipeline directly...")
    from sync_service import poll_and_sync_all
    
    start_py = time.time()
    poll_and_sync_all(trigger_source="python_manual")
    py_time = time.time() - start_py
    print(f"✓ Python sync completed in {py_time:.2f} seconds.")

    # 3. Fetch runs metrics from Supabase
    print("\n3. Comparing sync_runs records in Supabase...")
    runs = supabase_get("sync_runs", params={"order": "started_at.desc", "limit": "5"})
    
    deno_run = None
    py_run = None
    for r in runs:
        if r.get("trigger_source") == "deno_manual" and not deno_run:
            deno_run = r
        if r.get("trigger_source") == "python_manual" and not py_run:
            py_run = r

    if not deno_run or not py_run:
        print("❌ ERROR: Could not find matching runs in the DB!")
        print("Runs found:", [(r.get("trigger_source"), r.get("status")) for r in runs])
        sys.exit(1)

    print("\n--- Run Statistics Comparison ---")
    print(f"Metrics                    | Deno Edge Function | Python Pipeline")
    print(f"Status                     | {deno_run.get('status'):<18} | {py_run.get('status')}")
    print(f"Sites Processed            | {deno_run.get('sites_processed'):<18} | {py_run.get('sites_processed')}")
    print(f"Inverters Processed        | {deno_run.get('inverters_processed'):<18} | {py_run.get('inverters_processed')}")
    print(f"Telemetry Saved            | {deno_run.get('telemetry_records'):<18} | {py_run.get('telemetry_records')}")
    print(f"String Telemetry Saved     | {deno_run.get('string_records'):<18} | {py_run.get('string_records')}")
    print(f"Alerts Processed           | {deno_run.get('alerts_processed'):<18} | {py_run.get('alerts_processed')}")
    print(f"Error Count                | {deno_run.get('error_count'):<18} | {py_run.get('error_count')}")

    # Check for hard validation parity
    parity_failed = False
    for field in ["sites_processed", "inverters_processed"]:
        if deno_run.get(field) != py_run.get(field):
            print(f"❌ MISMATCH: Field '{field}' does not match! Deno: {deno_run.get(field)}, Py: {py_run.get(field)}")
            parity_failed = True
            
    if not parity_failed:
        print("\n✅ Verification SUCCESS: Discovery and core sync stats have PERFECT parity!")
        print("====================================================")
    else:
        print("\n❌ Verification FAILED: Core metrics mismatch.")
        print("====================================================")
        sys.exit(1)

if __name__ == "__main__":
    main()
