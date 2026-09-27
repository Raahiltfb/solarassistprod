import requests

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE"

headers = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}"
}

# Fetch Cilantro & Sophistica profiles
res_p = requests.get(f"{SUPABASE_URL}/rest/v1/profiles?email=eq.client@cilantro.com", headers=headers).json()
print("CLIENT PROFILE:", res_p)

# Fetch Cilantro site
res_s = requests.get(f"{SUPABASE_URL}/rest/v1/sites?name=ilike.*cilantro*", headers=headers).json()
print("CILANTRO SITE:", res_s)

# Fetch all sites
res_alls = requests.get(f"{SUPABASE_URL}/rest/v1/sites?select=id,name,org_id", headers=headers).json()
print(f"TOTAL SITES: {len(res_alls)}")
for s in res_alls:
    if "cilantro" in s['name'].lower() or "sophistica" in s['name'].lower():
        print("  SITE:", s)
