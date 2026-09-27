import os
import requests
from dotenv import load_dotenv

load_dotenv("frontend/.env.local")

url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json"
}

# 1. Fetch all client profiles
res = requests.get(f"{url}/rest/v1/profiles?role=eq.client", headers=headers)
client_profiles = res.json()
print(f"Found {len(client_profiles)} client profiles in DB.")

# 2. Reset/Create Auth Users using Supabase Auth Admin REST API
# Endpoint: POST {url}/auth/v1/admin/users
for p in client_profiles:
    user_id = p["id"]
    email = p["email"]
    
    # Try updating password via Admin API
    update_url = f"{url}/auth/v1/admin/users/{user_id}"
    up_res = requests.put(update_url, headers=headers, json={
        "password": "Solar@12345",
        "email_confirm": True
    })
    
    if up_res.status_code == 200:
        print(f"  ✅ Updated password for {email}")
    else:
        # Create user if missing in auth
        create_url = f"{url}/auth/v1/admin/users"
        c_res = requests.post(create_url, headers=headers, json={
            "id": user_id,
            "email": email,
            "password": "Solar@12345",
            "email_confirm": True
        })
        if c_res.status_code in [200, 201]:
            print(f"  ✅ Created auth user for {email}")
        else:
            print(f"  ❌ Failed for {email}: {c_res.status_code} - {c_res.text}")

print("Client password sync complete!")
