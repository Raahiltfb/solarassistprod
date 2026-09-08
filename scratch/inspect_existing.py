import os
import sys
import requests
from dotenv import load_dotenv

sys.path.append(os.path.join(os.getcwd(), "backend"))
load_dotenv(".env")
load_dotenv("backend/.env")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

inv_uuid = "e5ba6438-2495-41c8-a048-9e2266038c75"
date_str = "2026-08-15"
day_start = f"{date_str}T00:00:00.000Z"
day_end = f"{date_str}T23:59:59.999Z"

url = f"{SUPABASE_URL}/rest/v1/telemetry"
headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}"
}
params = [
    ("select", "timestamp"),
    ("inverter_id", f"eq.{inv_uuid}"),
    ("timestamp", f"gte.{day_start}"),
    ("timestamp", f"lte.{day_end}"),
    ("limit", "10")
]

res = requests.get(url, headers=headers, params=params)
print("Status code:", res.status_code)
print("Records:", res.json())
