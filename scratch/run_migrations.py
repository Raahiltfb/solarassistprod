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
-- First-class Telemetry Columns
ALTER TABLE public.telemetry ADD COLUMN IF NOT EXISTS frequency_hz numeric;
ALTER TABLE public.telemetry ADD COLUMN IF NOT EXISTS reactive_power_kvar numeric;
ALTER TABLE public.telemetry ADD COLUMN IF NOT EXISTS power_factor numeric;
ALTER TABLE public.telemetry ADD COLUMN IF NOT EXISTS metrics jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.string_telemetry ADD COLUMN IF NOT EXISTS metrics jsonb DEFAULT '{}'::jsonb;

-- Extensible Alerts Schema
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS recommended_action text;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS oem text;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS alarm_code text;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS is_auto_resolvable boolean DEFAULT false;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS requires_technician boolean DEFAULT true;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL;

-- Tickets Workflow Columns
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS before_photo_url text;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS after_photo_url text;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS technician_remarks text;

-- Index-Optimized Latest Telemetry Function
CREATE OR REPLACE FUNCTION public.get_latest_telemetry(inverter_ids uuid[])
RETURNS SETOF public.telemetry
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT DISTINCT ON (inverter_id) *
  FROM public.telemetry
  WHERE inverter_id = ANY(inverter_ids)
  ORDER BY inverter_id, timestamp DESC;
$$;
"""

print(f"Connecting to: {SUPABASE_URL}")
res = requests.post(f"{SUPABASE_URL}/rest/v1/rpc/exec_sql", headers=headers, json={"sql": sql})
print("Response Status Code:", res.status_code)
print("Response Text:", res.text)
if res.status_code == 200 or res.status_code == 204:
    print("Migrations applied successfully!")
else:
    print("Migration failed.")
