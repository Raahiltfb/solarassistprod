import requests

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjk1ODcsImV4cCI6MjA5MzY0NTU4N30.d9VUDRLSsruy7QSXf6GigVaIijkmmSdhP8nObWatB_8"

# 1. Login as client@cilantro.com
auth_resp = requests.post(
    f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
    headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
    json={"email": "client@cilantro.com", "password": "Solar@12345"}
).json()

access_token = auth_resp.get("access_token")
print("Access Token acquired:", bool(access_token))

headers_client = {
    "apikey": ANON_KEY,
    "Authorization": f"Bearer {access_token}"
}

# 2. Query sites
sites_res = requests.get(f"{SUPABASE_URL}/rest/v1/sites?select=*", headers=headers_client)
print("SITES STATUS:", sites_res.status_code)
print("SITES COUNT:", len(sites_res.json()) if sites_res.status_code == 200 else sites_res.text)

# 3. Query inverters
inv_res = requests.get(f"{SUPABASE_URL}/rest/v1/inverters?select=*", headers=headers_client)
print("INVERTERS STATUS:", inv_res.status_code)
print("INVERTERS COUNT:", len(inv_res.json()) if inv_res.status_code == 200 else inv_res.text)

# 4. Query alerts
alt_res = requests.get(f"{SUPABASE_URL}/rest/v1/alerts?select=*", headers=headers_client)
print("ALERTS STATUS:", alt_res.status_code)
print("ALERTS COUNT:", len(alt_res.json()) if alt_res.status_code == 200 else alt_res.text)

# 5. Query work_orders
wo_res = requests.get(f"{SUPABASE_URL}/rest/v1/work_orders?select=*", headers=headers_client)
print("WORK ORDERS STATUS:", wo_res.status_code)
print("WORK ORDERS COUNT:", len(wo_res.json()) if wo_res.status_code == 200 else wo_res.text)
