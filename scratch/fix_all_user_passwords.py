import os
import requests
import json

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjk1ODcsImV4cCI6MjA5MzY0NTU4N30.d9VUDRLSsruy7QSXf6GigVaIijkmmSdhP8nObWatB_8"

headers_admin = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json"
}

# 1. Fetch profiles table to see emails and roles
profiles_res = requests.get(f"{SUPABASE_URL}/rest/v1/profiles?select=id,full_name,email,role", headers=headers_admin)
profiles = profiles_res.json()
print("=== PROFILES TABLE ===")
for p in profiles:
    print(f"Name: {p.get('full_name')} | Email: {p.get('email')} | Role: {p.get('role')} | ID: {p.get('id')}")

# 2. Fetch auth.users list
auth_res = requests.get(f"{SUPABASE_URL}/auth/v1/admin/users", headers=headers_admin)
auth_users = auth_res.json().get('users', [])
print("\n=== AUTH USERS ===")
for u in auth_users:
    print(f"Email: {u.get('email')} | ID: {u.get('id')}")

# 3. Reset ALL users password to Solar@12345
NEW_PASSWORD = "Solar@12345"
print(f"\nResetting passwords for ALL {len(auth_users)} auth users to '{NEW_PASSWORD}'...")

for u in auth_users:
    uid = u['id']
    email = u['email']
    resp = requests.put(
        f"{SUPABASE_URL}/auth/v1/admin/users/{uid}",
        headers=headers_admin,
        json={"password": NEW_PASSWORD, "email_confirm": True}
    )
    if resp.status_code in [200, 201]:
        print(f"  [OK] Reset password for {email}")
    else:
        print(f"  [ERR] Failed to reset password for {email}: {resp.text}")

# 4. Verify authentication for key roles
test_emails = [
    "admin@solarassist.dev",
    "client@cilantro.com",
    "tech1@solarassist.dev"
]

print("\n=== TESTING LOGIN FOR KEY ROLES ===")
for email in test_emails:
    auth_resp = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
        json={"email": email, "password": NEW_PASSWORD}
    )
    if auth_resp.status_code == 200:
        res_json = auth_resp.json()
        user_data = res_json.get('user', {})
        role = user_data.get('user_metadata', {}).get('role') or "checked via profiles"
        print(f"  ✅ SUCCESS: Logged in as {email}")
    else:
        print(f"  ❌ FAILED: Login for {email} -> {auth_resp.status_code} {auth_resp.text}")
