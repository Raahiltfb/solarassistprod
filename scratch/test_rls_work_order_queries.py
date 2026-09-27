import requests

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjk1ODcsImV4cCI6MjA5MzY0NTU4N30.d9VUDRLSsruy7QSXf6GigVaIijkmmSdhP8nObWatB_8"

headers_service = {"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"}

# Fetch sample work order and ticket IDs from database using service role
all_wos = requests.get(f"{SUPABASE_URL}/rest/v1/work_orders?select=id,title,technician_id,site_id", headers=headers_service).json()
all_tickets = requests.get(f"{SUPABASE_URL}/rest/v1/tickets?select=id,title,site_id", headers=headers_service).json()

print(f"Total Work Orders in DB: {len(all_wos)}")
print(f"Total Tickets in DB: {len(all_tickets)}")

def test_user_login(email, password="Solar@12345"):
    resp = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
        json={"email": email, "password": password}
    ).json()
    token = resp.get("access_token")
    if not token:
        print(f"Failed to login as {email}: {resp}")
        return None
    return token

roles_to_test = [
    ("admin@solarassist.dev", "Admin"),
    ("tech1@solarassist.dev", "Tech 1"),
    ("tech5@solarassist.dev", "Tech 5"),
    ("client@cilantro.com", "Client Cilantro")
]

for email, role_name in roles_to_test:
    token = test_user_login(email)
    if not token:
        continue
    headers_user = {"apikey": ANON_KEY, "Authorization": f"Bearer {token}"}
    
    # Test querying work orders
    res_wos = requests.get(f"{SUPABASE_URL}/rest/v1/work_orders?select=id,title", headers=headers_user).json()
    wo_count = len(res_wos) if isinstance(res_wos, list) else f"Error: {res_wos}"
    
    # Test querying tickets
    res_tkts = requests.get(f"{SUPABASE_URL}/rest/v1/tickets?select=id,title", headers=headers_user).json()
    tkt_count = len(res_tkts) if isinstance(res_tkts, list) else f"Error: {res_tkts}"
    
    print(f"User: {email} ({role_name}) -> Work Orders readable: {wo_count} | Tickets readable: {tkt_count}")
