import os
import requests
from dotenv import load_dotenv

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
CREATE TABLE IF NOT EXISTS public.sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  oem text NOT NULL DEFAULT 'solis',
  sites_processed int NOT NULL DEFAULT 0,
  inverters_processed int NOT NULL DEFAULT 0,
  telemetry_records int NOT NULL DEFAULT 0,
  string_records int NOT NULL DEFAULT 0,
  alerts_processed int NOT NULL DEFAULT 0,
  error_count int NOT NULL DEFAULT 0,
  error_message text,
  duration_seconds numeric
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON public.sync_runs(started_at desc);
"""

print(f"Connecting to: {SUPABASE_URL}")
res = requests.post(f"{SUPABASE_URL}/rest/v1/rpc/exec_sql", headers=headers, json={"sql": sql})
print("Response Status Code:", res.status_code)
print("Response Text:", res.text)
if res.status_code in (200, 204):
    print("✓ sync_runs table created successfully!")
else:
    print("Migration failed.")
