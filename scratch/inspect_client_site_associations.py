import requests

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE"

headers = {"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"}

profiles = requests.get(f"{SUPABASE_URL}/rest/v1/profiles?role=eq.client", headers=headers).json()
sites = requests.get(f"{SUPABASE_URL}/rest/v1/sites?select=id,name,org_id,client_org_id,client_id", headers=headers).json()
orgs = requests.get(f"{SUPABASE_URL}/rest/v1/organizations?select=*", headers=headers).json()

print("=== CLIENT PROFILES ===")
for p in profiles:
    print(f"User: {p.get('email')} | Name: {p.get('full_name')} | Profile org_id: {p.get('org_id')}")

print("\n=== SITES (sample) ===")
for s in sites[:10]:
    print(f"Site: {s.get('name')} | org_id: {s.get('org_id')} | client_org_id: {s.get('client_org_id')} | client_id: {s.get('client_id')}")

print("\n=== ORGANIZATIONS ===")
for o in orgs:
    print(f"Org: {o.get('name')} | ID: {o.get('id')} | Type: {o.get('type')}")
