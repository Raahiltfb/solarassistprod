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

# Fetch telemetry records
res = requests.get(f"{SUPABASE_URL}/rest/v1/telemetry?limit=5", headers=headers)
print("Telemetry records:")
print(res.status_code, res.text)

# Fetch string telemetry records
res_str = requests.get(f"{SUPABASE_URL}/rest/v1/string_telemetry?limit=5", headers=headers)
print("\nString Telemetry records:")
print(res_str.status_code, res_str.text)

# Fetch inverters records
res_inv = requests.get(f"{SUPABASE_URL}/rest/v1/inverters?limit=5", headers=headers)
print("\nInverters records:")
print(res_inv.status_code, res_inv.text)
