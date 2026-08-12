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

statements = [
    # 1. Deduplicate telemetry rows
    "DELETE FROM public.telemetry a USING public.telemetry b WHERE a.id < b.id AND a.inverter_id = b.inverter_id AND a.timestamp = b.timestamp",
    # 2. Deduplicate string_telemetry rows
    "DELETE FROM public.string_telemetry a USING public.string_telemetry b WHERE a.id < b.id AND a.string_id = b.string_id AND a.timestamp = b.timestamp",
    # 3. Add UNIQUE constraint/index on telemetry (inverter_id, timestamp)
    "ALTER TABLE public.telemetry DROP CONSTRAINT IF EXISTS unique_inverter_timestamp",
    "ALTER TABLE public.telemetry ADD CONSTRAINT unique_inverter_timestamp UNIQUE (inverter_id, timestamp)",
    # 4. Add UNIQUE constraint/index on string_telemetry (string_id, timestamp)
    "ALTER TABLE public.string_telemetry DROP CONSTRAINT IF EXISTS unique_string_timestamp",
    "ALTER TABLE public.string_telemetry ADD CONSTRAINT unique_string_timestamp UNIQUE (string_id, timestamp)",
    # 5. Add optimized composite indexes
    "CREATE INDEX IF NOT EXISTS idx_string_telemetry_str_time ON public.string_telemetry(string_id, timestamp desc)",
    "CREATE INDEX IF NOT EXISTS idx_alerts_inv ON public.alerts(inverter_id)",
    "CREATE INDEX IF NOT EXISTS idx_alerts_site_status_time ON public.alerts(site_id, status, triggered_at desc)",
    "ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS inverter_id uuid REFERENCES public.inverters(id) ON DELETE SET NULL",
    "CREATE INDEX IF NOT EXISTS idx_tickets_inv ON public.tickets(inverter_id)",
    "CREATE INDEX IF NOT EXISTS idx_tickets_site_status_time ON public.tickets(site_id, status, created_at desc)"
]

print(f"Connecting to: {SUPABASE_URL}")
for stmt in statements:
    print(f"Running: {stmt[:60]}...")
    res = requests.post(f"{SUPABASE_URL}/rest/v1/rpc/exec_sql", headers=headers, json={"sql": stmt})
    if res.status_code not in (200, 204):
        print(f"  ❌ Failed (Status {res.status_code}): {res.text}")
    else:
        print("  ✓ Success")
