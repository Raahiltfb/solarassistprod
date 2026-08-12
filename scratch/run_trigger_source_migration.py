import os
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv(".env")
load_dotenv("backend/.env")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "https://ylnmjvgnjootrkywbcsj.supabase.co"
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

sql = """
ALTER TABLE public.sync_runs ADD COLUMN IF NOT EXISTS trigger_source text NOT NULL DEFAULT 'manual';
"""

print(f"Connecting to Supabase: {SUPABASE_URL}")
res = requests.post(f"{SUPABASE_URL}/rest/v1/rpc/exec_sql", headers=headers, json={"sql": sql})
print("Response Status Code:", res.status_code)
print("Response Text:", res.text)
if res.status_code in (200, 204):
    print("✓ trigger_source column added to sync_runs table successfully!")
else:
    print("Migration failed.")
