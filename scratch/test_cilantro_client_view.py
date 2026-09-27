import requests

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjk1ODcsImV4cCI6MjA5MzY0NTU4N30.d9VUDRLSsruy7QSXf6GigVaIijkmmSdhP8nObWatB_8"

# 1. Fetch Cilantro site ID
headers_anon = {"apikey": ANON_KEY}
res_sites = requests.get("http://localhost:3000/api/automation/sandbox/simulate", json={}).status_code

# Trigger simulation for Cilantro
res_cilantro = requests.get(f"{SUPABASE_URL}/rest/v1/sites?name=eq.Cilantro", headers=headers_anon).json()
if res_cilantro:
    cilantro_id = res_cilantro[0]['id']
    print(f"Triggering simulation for Cilantro (ID: {cilantro_id})...")
    sim_res = requests.post(
        "http://localhost:3000/api/automation/sandbox/simulate",
        json={"scenario": "critical_outage", "site_id": cilantro_id}
    ).json()
    print("Simulation Output:", sim_res)
