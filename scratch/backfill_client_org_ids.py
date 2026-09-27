import requests
import json

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE"

headers = {"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}", "Content-Type": "application/json"}

sites = requests.get(f"{SUPABASE_URL}/rest/v1/sites?select=id,name,client_org_id", headers=headers).json()
orgs = requests.get(f"{SUPABASE_URL}/rest/v1/organizations?select=id,name", headers=headers).json()

# Build mapping of keyword to org_id
# Org names: Alcove Society, MK Thakur Housing Complex, Dosti Jade CHS, Madhukosh CHS, Garcinia Residency,
# Manavsthal Tower, Anoopam Mission, Belmac Panvel, BWSSB Bangalore, Casa Florea, Cilantro CHS, Crestia Solar,
# Ivy By Courtyard, Maitri Anand CHS, Maxima CHS, Patwardhan Hospital, Regalia CHS, STP Plant Services, Sophistica Solar,
# Suvarna Pushpa CHS, Suyash Heights, Venecia CHS, Vijay Vatika CHS

org_by_name = {o['name']: o['id'] for o in orgs}

def find_matching_org(site_name):
    sn = site_name.lower()
    if "alcove" in sn:
        return org_by_name.get("Alcove Society")
    if "mk thakur" in sn:
        return org_by_name.get("MK Thakur Housing Complex")
    if "dosti jade" in sn:
        return org_by_name.get("Dosti Jade CHS")
    if "madhukosh" in sn:
        return org_by_name.get("Madhukosh CHS")
    if "garcinia" in sn:
        return org_by_name.get("Garcinia Residency")
    if "manavsthal" in sn:
        return org_by_name.get("Manavsthal Tower")
    if "anoopam" in sn:
        return org_by_name.get("Anoopam Mission")
    if "belmac" in sn:
        return org_by_name.get("Belmac Panvel")
    if "bwssb" in sn:
        return org_by_name.get("BWSSB Bangalore")
    if "casa florea" in sn:
        return org_by_name.get("Casa Florea")
    if "cilantro" in sn:
        return org_by_name.get("Cilantro CHS")
    if "crestia" in sn:
        return org_by_name.get("Crestia Solar")
    if "ivy" in sn:
        return org_by_name.get("Ivy By Courtyard")
    if "maitri anand" in sn:
        return org_by_name.get("Maitri Anand CHS")
    if "maxima" in sn:
        return org_by_name.get("Maxima CHS")
    if "patwardhan" in sn:
        return org_by_name.get("Patwardhan Hospital")
    if "regalia" in sn:
        return org_by_name.get("Regalia CHS")
    if "stp" in sn:
        return org_by_name.get("STP Plant Services")
    if "sophistica" in sn:
        return org_by_name.get("Sophistica Solar")
    if "suvarna pushpa" in sn:
        return org_by_name.get("Suvarna Pushpa CHS")
    if "suyash" in sn:
        return org_by_name.get("Suyash Heights")
    if "venecia" in sn:
        return org_by_name.get("Venecia CHS")
    if "vijay vatika" in sn:
        return org_by_name.get("Vijay Vatika CHS")
    return None

updated_count = 0
for site in sites:
    matched_org_id = find_matching_org(site['name'])
    if matched_org_id:
        res = requests.patch(
            f"{SUPABASE_URL}/rest/v1/sites?id=eq.{site['id']}",
            headers=headers,
            json={"client_org_id": matched_org_id}
        )
        if res.status_code in [200, 204]:
            print(f"✅ Set site '{site['name']}' -> client_org_id: {matched_org_id}")
            updated_count += 1
        else:
            print(f"❌ Failed for '{site['name']}': {res.text}")
    else:
        print(f"⚠️ No match for site '{site['name']}'")

print(f"\nBackfilled client_org_id for {updated_count} / {len(sites)} sites.")
