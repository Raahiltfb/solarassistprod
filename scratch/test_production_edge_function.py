import os
import sys
import json
import requests

load_dotenv = None
try:
    from dotenv import load_dotenv
    load_dotenv(".env")
    load_dotenv("backend/.env")
    load_dotenv("frontend/.env.local")
except Exception:
    pass

url = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "https://glqapffevllptnlyzwtq.supabase.co"
cron_secret = os.getenv("CRON_SECRET") or "secret"

edge_function_url = f"{url}/functions/v1/poll-oem?secret={cron_secret}&trigger_source=prod_verification_test"

print(f"Calling Production Supabase Edge Function at: {edge_function_url}")

headers = {
    "Authorization": f"Bearer {cron_secret}",
    "Content-Type": "application/json"
}

try:
    res = requests.post(edge_function_url, headers=headers, json={"trigger_source": "prod_verification_test"}, timeout=120)
    print(f"Status Code: {res.status_code}")
    print("Response JSON:", json.dumps(res.json(), indent=2))
except Exception as e:
    print(f"Error calling production Edge Function: {e}")

