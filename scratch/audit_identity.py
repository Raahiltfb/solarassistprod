import urllib.request
import json
import ssl

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE"

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
    with urllib.request.urlopen(req, context=ctx) as resp:
        return json.loads(resp.read().decode('utf-8'))

print("=== ORGANIZATIONS IN DATABASE ===")
orgs = query_table("organizations")
for o in orgs:
    print(f"ID: {o['id']} | Name: {o['name']} | Slug: {o.get('slug')} | Created At: {o.get('created_at')}")

print("\n=== PROFILES IN DATABASE ===")
profiles = query_table("profiles")
for p in profiles:
    print(f"ID: {p['id']} | Org ID: {p.get('org_id')} | Full Name: {p.get('full_name')} | Email: {p.get('email')} | Role: {p.get('role')}")

print("\n=== SITES ORG MAPPING SUMMARY ===")
sites = query_table("sites?select=id,name,org_id,client_id")
org_site_counts = {}
for s in sites:
    o_id = s.get('org_id')
    org_site_counts[o_id] = org_site_counts.get(o_id, 0) + 1
for o_id, count in org_site_counts.items():
    print(f"Org ID {o_id}: {count} sites")

print("\n=== OEM INTEGRATIONS ORG MAPPING SUMMARY ===")
integs = query_table("oem_integrations")
for i in integs:
    print(f"ID: {i['id']} | Org ID: {i.get('org_id')} | Provider: {i.get('provider')} | Active: {i.get('is_active')}")
