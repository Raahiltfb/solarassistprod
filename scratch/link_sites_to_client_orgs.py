import requests

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE"

headers = {"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"}

sites = requests.get(f"{SUPABASE_URL}/rest/v1/sites?select=*", headers=headers).json()
orgs = requests.get(f"{SUPABASE_URL}/rest/v1/organizations?select=*", headers=headers).json()

org_map = {o['name'].lower(): o['id'] for o in orgs}

print("=== SITES & MATCHED ORGS ===")
for s in sites:
    s_name = s['name']
    client_org_id = s.get('client_org_id')
    client_id = s.get('client_id')
    org_id = s.get('org_id')
    print(f"Site: {s_name} | org_id: {org_id} | client_org_id: {client_org_id} | client_id: {client_id}")
