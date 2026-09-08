import urllib.request
import json

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE"

import ssl
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def query_table(endpoint):
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    req = urllib.request.Request(url, headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json"
    })
    try:
        with urllib.request.urlopen(req, context=ctx) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code, e.read().decode('utf-8'))
        raise e

# 1. Sites audit
sites = query_table("sites?select=id,name,latitude,longitude,status")
active_sites = [s for s in sites if s.get('status') == 'active']
sites_with_coords = [s for s in active_sites if s.get('latitude') is not None and s.get('longitude') is not None and s.get('latitude') != 0 and s.get('longitude') != 0]
sites_without_coords = [s for s in active_sites if s not in sites_with_coords]

# 2. Profiles (technicians) audit
try:
    profiles = query_table("profiles?select=id,full_name,email,role,base_latitude,base_longitude")
except Exception:
    profiles = query_table("profiles?select=id,full_name,email,role")

techs = [p for p in profiles if p.get('role') in ['technician', 'epc_admin', 'super_admin']]
techs_with_base = [t for t in techs if t.get('base_latitude') is not None and t.get('base_longitude') is not None and t.get('base_latitude') != 0 and t.get('base_longitude') != 0]
techs_without_base = [t for t in techs if t not in techs_with_base]

print("=== LOCATION DATA AUDIT REPORT ===")
print(f"Total Active Sites: {len(active_sites)}")
print(f"Active Sites with Valid Lat+Lng: {len(sites_with_coords)}")
print(f"Active Sites Without Valid Lat+Lng: {len(sites_without_coords)}")
if sites_without_coords:
    print("Sites missing coords:", [s['name'] for s in sites_without_coords])

print("\nTotal Technician/Staff Profiles: ", len(techs))
print(f"Technicians with Valid Base Coordinates: {len(techs_with_base)}")
print(f"Technicians Without Base Coordinates: {len(techs_without_base)}")
if techs_without_base:
    print("Technicians missing base coords:", [t['full_name'] or t['email'] for t in techs_without_base])
