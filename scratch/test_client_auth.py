import os
import requests
from dotenv import load_dotenv

load_dotenv("frontend/.env.local")

url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

headers = {
    "apikey": key,
    "Content-Type": "application/json"
}

res = requests.post(f"{url}/auth/v1/token?grant_type=password", headers=headers, json={
    "email": "client@sophistica.com",
    "password": "Solar@12345"
})

print("Status:", res.status_code)
if res.status_code == 200:
    print("✅ AUTH SUCCESS for client@sophistica.com!")
else:
    print("❌ FAILED:", res.text)
