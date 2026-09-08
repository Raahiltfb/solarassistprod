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

profiles = query_table("profiles?email=eq.client@solarassist.dev")
client_profile_id = profiles[0]["id"] if profiles else None
print(f"client@solarassist.dev Profile ID: {client_profile_id}")

sites_with_client = query_table(f"sites?client_id=eq.{client_profile_id}") if client_profile_id else []
print(f"Sites referencing client@solarassist.dev as client_id: {len(sites_with_client)}")
for s in sites_with_client:
    print(f"  - Site: {s['name']} (ID: {s['id']})")
