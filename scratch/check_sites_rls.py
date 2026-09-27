import requests

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjk1ODcsImV4cCI6MjA5MzY0NTU4N30.d9VUDRLSsruy7QSXf6GigVaIijkmmSdhP8nObWatB_8"

def test_user_login(email, password="Solar@12345"):
    resp = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
        json={"email": email, "password": password}
    ).json()
    return resp.get("access_token")

token = test_user_login("client@cilantro.com")
headers = {"apikey": ANON_KEY, "Authorization": f"Bearer {token}"}

wos = requests.get(f"{SUPABASE_URL}/rest/v1/work_orders?select=id,title", headers=headers).json()
print(f"Client can see {len(wos)} work orders")
if len(wos) > 0:
    print(wos)
