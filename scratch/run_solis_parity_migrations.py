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
-- First-class AC Phase Currents and Voltages
ALTER TABLE public.telemetry ADD COLUMN IF NOT EXISTS current_r_a numeric;
ALTER TABLE public.telemetry ADD COLUMN IF NOT EXISTS current_s_a numeric;
ALTER TABLE public.telemetry ADD COLUMN IF NOT EXISTS current_t_a numeric;
ALTER TABLE public.telemetry ADD COLUMN IF NOT EXISTS voltage_r_v numeric;
ALTER TABLE public.telemetry ADD COLUMN IF NOT EXISTS voltage_s_v numeric;
ALTER TABLE public.telemetry ADD COLUMN IF NOT EXISTS voltage_t_v numeric;
ALTER TABLE public.telemetry ADD COLUMN IF NOT EXISTS apparent_power_kva numeric;

-- First-class Battery Storage Metrics
ALTER TABLE public.telemetry ADD COLUMN IF NOT EXISTS battery_soc_pct numeric;
ALTER TABLE public.telemetry ADD COLUMN IF NOT EXISTS battery_soh_pct numeric;
ALTER TABLE public.telemetry ADD COLUMN IF NOT EXISTS battery_power_kw numeric;
ALTER TABLE public.telemetry ADD COLUMN IF NOT EXISTS battery_voltage_v numeric;
ALTER TABLE public.telemetry ADD COLUMN IF NOT EXISTS battery_current_a numeric;

-- First-class Consumption Load Metrics
ALTER TABLE public.telemetry ADD COLUMN IF NOT EXISTS load_power_kw numeric;
ALTER TABLE public.telemetry ADD COLUMN IF NOT EXISTS grid_purchased_today_kwh numeric;
ALTER TABLE public.telemetry ADD COLUMN IF NOT EXISTS grid_sell_today_kwh numeric;
ALTER TABLE public.telemetry ADD COLUMN IF NOT EXISTS load_today_kwh numeric;
"""

print(f"Connecting to: {SUPABASE_URL}")
res = requests.post(f"{SUPABASE_URL}/rest/v1/rpc/exec_sql", headers=headers, json={"sql": sql})
print("Response Status Code:", res.status_code)
print("Response Text:", res.text)
if res.status_code in (200, 204):
    print("Solis parity migrations applied successfully!")
else:
    print("Migration failed.")
