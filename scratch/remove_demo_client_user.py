import urllib.request
import json
import ssl

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def exec_sql(sql_str):
    url = f"{SUPABASE_URL}/rest/v1/rpc/exec_sql"
    req = urllib.request.Request(url, data=json.dumps({"sql": sql_str}).encode('utf-8'), headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json"
    }, method="POST")
    try:
        with urllib.request.urlopen(req, context=ctx) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code, e.read().decode('utf-8'))
        raise e

prune_sql = """
DELETE FROM public.profiles WHERE email IN ('client@solarassist.dev', 'client@heliogrid.dev');
DELETE FROM auth.users WHERE email IN ('client@solarassist.dev', 'client@heliogrid.dev');
NOTIFY pgrst, 'reload schema';
"""

status = exec_sql(prune_sql)
print(f"Prune execution completed with status code: {status}")
