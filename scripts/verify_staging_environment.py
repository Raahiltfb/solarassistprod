"""
Verification Script: Read-Only Staging Environment Check
Validates connectivity strictly against the isolated staging Supabase instance:
https://xpjzuquqehjamqsqshwq.supabase.co
Ensures production (ylnmjvgnjootrkywbcsj) is completely untouched.
Authenticates as superadmin persona to query RLS-protected tables.
"""
import os
import sys
import json
import requests
from dotenv import load_dotenv

load_dotenv("frontend/.env.local")
load_dotenv("backend/.env")

PRODUCTION_PROJECT_REF = "ylnmjvgnjootrkywbcsj"
STAGING_PROJECT_REF = "xpjzuquqehjamqsqshwq"

supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
anon_key = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

print(f"Target Staging Supabase URL: {supabase_url}")

if PRODUCTION_PROJECT_REF in supabase_url:
    print(f"CRITICAL SAFETY ERROR: Target URL matches production ({PRODUCTION_PROJECT_REF})!")
    sys.exit(1)

if STAGING_PROJECT_REF not in supabase_url:
    print(f"WARNING: Target URL does not explicitly contain staging ref ({STAGING_PROJECT_REF}).")

auth_url = f"{supabase_url}/auth/v1/token?grant_type=password"
auth_payload = {
    "email": "super@solarassist.dev",
    "password": "Solar@12345"
}
auth_headers = {
    "apikey": anon_key,
    "Content-Type": "application/json"
}

print("Authenticating as super@solarassist.dev...")
auth_resp = requests.post(auth_url, json=auth_payload, headers=auth_headers, timeout=15)
if auth_resp.status_code != 200:
    print(f"Superadmin auth failed ({auth_resp.status_code}): {auth_resp.text}")
    print("Trying admin@solarassist.dev...")
    auth_payload["email"] = "admin@solarassist.dev"
    auth_resp = requests.post(auth_url, json=auth_payload, headers=auth_headers, timeout=15)

if auth_resp.status_code != 200:
    print(f"Authentication failed: {auth_resp.status_code} - {auth_resp.text}")
    sys.exit(1)

token_data = auth_resp.json()
access_token = token_data.get("access_token")
user_info = token_data.get("user", {})
print(f"Authentication SUCCESSFUL. User: {user_info.get('email')} (ID: {user_info.get('id')})")

query_headers = {
    "apikey": anon_key,
    "Authorization": f"Bearer {access_token}",
    "Range-Unit": "items"
}

tables = [
    "organizations",
    "profiles",
    "sites",
    "inverters",
    "strings",
    "alerts",
    "tickets",
    "work_orders",
    "site_cleaning_rules",
    "cleaning_plans",
    "technician_teams"
]

results = {
    "target_url": supabase_url,
    "is_production": False,
    "is_staging": STAGING_PROJECT_REF in supabase_url,
    "authenticated_user": user_info.get("email"),
    "table_counts": {},
    "status": "PASS"
}

for table in tables:
    resp = requests.get(
        f"{supabase_url}/rest/v1/{table}?select=id&limit=1",
        headers={**query_headers, "Prefer": "count=exact"},
        timeout=15
    )
    if resp.status_code in [200, 206]:
        crange = resp.headers.get("content-range", "")
        count = crange.split("/")[-1] if "/" in crange else "unknown"
        results["table_counts"][table] = count
        print(f"  [OK] Table '{table}': {count} records")
    else:
        results["table_counts"][table] = f"Error: {resp.status_code}"
        print(f"  [FAIL] Table '{table}': HTTP {resp.status_code} - {resp.text[:100]}")
        results["status"] = "FAIL"

print("\nEnvironment Verification Summary:")
print(json.dumps(results, indent=2))

os.makedirs("test_reports", exist_ok=True)
with open("test_reports/staging_env_verification.json", "w") as f:
    json.dump(results, f, indent=2)
