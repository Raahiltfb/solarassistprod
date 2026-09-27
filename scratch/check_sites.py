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

res = requests.get(f"{url}/rest/v1/sites?select=id,name,location", headers=headers)
sites = res.json()
print("SITES IN DB:")
for s in sites:
    print(f"  ID: {s['id']} | Name: {s['name']} | Location: {s['location']}")
