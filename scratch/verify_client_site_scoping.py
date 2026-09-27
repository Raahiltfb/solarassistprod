import requests

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE"

headers = {"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"}

def test_client(email):
    # Fetch profile
    prof = requests.get(f"{SUPABASE_URL}/rest/v1/profiles?email=eq.{email}", headers=headers).json()[0]
    org_id = prof['org_id']
    
    # Query sites matching org_id
    sites = requests.get(f"{SUPABASE_URL}/rest/v1/sites?client_org_id=eq.{org_id}", headers=headers).json()
    print(f"Client: {email} | Org ID: {org_id} | Accessible Sites Count: {len(sites)}")
    for s in sites:
        print(f"   -> Site: {s['name']} (ID: {s['id']})")

print("=== TESTING CLIENT SITE SCOPING ===")
test_client("client@cilantro.com")
print("")
test_client("client@sophistica.com")
print("")
test_client("client@alcove.com")
