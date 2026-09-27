import requests

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE"

headers = {"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"}

def run_sql(sql):
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
        headers=headers,
        json={"sql": sql}
    )
    return resp.text

# Fallback: get policies via REST if we can't run arbitrary SQL
# Wait, we might not have an exec_sql endpoint. We can just query pg_policies using PostgREST?
pg_policies = requests.get(f"{SUPABASE_URL}/rest/v1/pg_policies?select=*", headers=headers)
print(pg_policies.status_code)
if pg_policies.status_code == 200:
    print(pg_policies.json())
else:
    print("Cannot fetch policies via rest/v1/pg_policies")
