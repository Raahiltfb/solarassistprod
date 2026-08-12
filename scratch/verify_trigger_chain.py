import os
import sys
import time
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv(".env")
load_dotenv("backend/.env")
load_dotenv("frontend/.env.local")

# Add backend directory to Python path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.append(backend_dir)

from sync_service import supabase_get

def main():
    print("====================================================")
    print("SolarAssist: Verification of Cron to Backend Trigger Chain")
    print("====================================================")
    
    cron_secret = os.getenv("CRON_SECRET") or "secret"
    print(f"Using CRON_SECRET: {cron_secret}")
    
    # 1. Test unauthorized access
    print("\n1. Testing unauthorized GET /api/cron/poll-oem...")
    try:
        res = requests.get("http://localhost:3000/api/cron/poll-oem")
        print(f"Status Code (unauthorized): {res.status_code}")
        if res.status_code == 401:
            print("✓ Correctly rejected unauthorized request.")
        else:
            print("❌ ERROR: Request was not rejected with 401!")
    except Exception as e:
        print(f"⚠️ Could not connect to Next.js dev server: {e}")
        print("Please make sure 'npm run dev' is running on port 3000.")
        sys.exit(1)
        
    # 2. Test authorized access via Vercel Cron header
    print("\n2. Sending authorized GET /api/cron/poll-oem (simulating Vercel Cron)...")
    headers = {
        "Authorization": f"Bearer {cron_secret}"
    }
    
    try:
        start_trigger = time.time()
        res = requests.get("http://localhost:3000/api/cron/poll-oem", headers=headers)
        duration_trigger = time.time() - start_trigger
        print(f"Status Code (authorized): {res.status_code}")
        print(f"Response: {res.json()}")
        
        if res.status_code != 200 or not res.json().get("ok"):
            print("❌ ERROR: Authorized trigger failed!")
            sys.exit(1)
        print(f"✓ Next.js route responded successfully in {duration_trigger:.2f}s.")
    except Exception as e:
        print(f"❌ ERROR calling cron route: {e}")
        sys.exit(1)
        
    # 3. Wait and check sync_runs
    print("\n3. Querying Supabase for the newly triggered sync_run record...")
    time.sleep(3) # Give it a moment to write to DB
    
    latest_runs = supabase_get("sync_runs", params={"order": "started_at.desc", "limit": "1"})
    if not latest_runs:
        print("❌ ERROR: No sync runs found in the database!")
        sys.exit(1)
        
    latest = latest_runs[0]
    print(f"Latest Sync Run ID:   {latest.get('id')}")
    print(f"Status:               {latest.get('status')}")
    print(f"Trigger Source:       {latest.get('trigger_source')}")
    print(f"Started At:           {latest.get('started_at')}")
    
    if latest.get("trigger_source") != "vercel_cron":
        print("❌ ERROR: trigger_source should be 'vercel_cron' but got:", latest.get("trigger_source"))
        sys.exit(1)
        
    print("\n✅ End-to-End Trigger Chain Verification: SUCCESSFUL!")
    print("Next.js Cron GET -> FastAPI Post -> poll_and_sync_all(vercel_cron) -> Supabase sync_runs logged correctly!")
    print("====================================================")

if __name__ == "__main__":
    main()
