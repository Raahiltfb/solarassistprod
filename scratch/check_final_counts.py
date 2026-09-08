import os
import requests
from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv("backend/.env")

url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}"
}

sites = requests.get(f"{url}/rest/v1/sites", headers=headers).json()
inverters = requests.get(f"{url}/rest/v1/inverters", headers=headers).json()

site_invs = {s["id"]: [] for s in sites}
for inv in inverters:
    site_invs[inv["site_id"]].append(inv["status"])

online_count = 0
offline_count = 0
offline_site_names = []

for s in sites:
    statuses = site_invs[s["id"]]
    if len(statuses) == 0:
        if s["status"] == "active":
            online_count += 1
        else:
            offline_count += 1
    else:
        has_online = any(status == "online" for status in statuses)
        if has_online:
            online_count += 1
        else:
            offline_count += 1
            offline_site_names.append(s["name"])

print("--- SOLARASSIST SITE CONNECTIVITY STATS ---")
print(f"Total Sites:   {len(sites)}")
print(f"Online Sites:  {online_count}")
print(f"Offline Sites: {offline_count}")
print(f"Offline Site Names: {offline_site_names}")
