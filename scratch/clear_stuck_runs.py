import os
import requests
from dotenv import load_dotenv

# Load env variables
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
UPDATE public.sync_runs 
SET status = 'failed', 
    completed_at = now(), 
    error_message = 'Cancelled: Server restarted' 
WHERE status = 'running';
"""

print(f"Connecting to Supabase: {SUPABASE_URL}")
res = requests.post(f"{SUPABASE_URL}/rest/v1/rpc/exec_sql", headers=headers, json={"sql": sql})
print("Response Status Code:", res.status_code)
if res.status_code in (200, 204):
    print("✓ Successfully cleared stuck running sync_runs!")
else:
    print("Failed to clear stuck runs.")
