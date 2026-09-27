import os
import requests
from dotenv import load_dotenv

load_dotenv("frontend/.env.local")

url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}"
}

# 1. Check auth.users table
res = requests.get(f"{url}/rest/v1/auth/users?select=id,email", headers=headers)
print("AUTH USERS STATUS:", res.status_code)
if res.status_code == 200:
    print("Users in Auth:", res.json())
else:
    # Try querying auth via RPC or auth admin if available, or query profiles
    res2 = requests.get(f"{url}/rest/v1/profiles?select=id,email,role", headers=headers)
    print("Profiles:", res2.json()[:10])
