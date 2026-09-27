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

res = requests.get(f"{url}/rest/v1/profiles?select=id,email,full_name,role,org_id", headers=headers)
profiles = res.json()
print("PROFILES IN SUPABASE:")
for p in profiles:
    print(f"  - Role: {p.get('role'):<12} Email: {p.get('email'):<30} Name: {p.get('full_name')}")
