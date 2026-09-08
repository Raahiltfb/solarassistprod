import os
import requests
from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv("backend/.env")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "https://ylnmjvgnjootrkywbcsj.supabase.co"
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

with open("frontend/supabase/migrations/0002_operations_system.sql", "r") as f:
    sql = f.read()

sql += "\nNOTIFY pgrst, 'reload schema';\n"

print(f"Connecting to: {SUPABASE_URL}")
res = requests.post(f"{SUPABASE_URL}/rest/v1/rpc/exec_sql", headers=headers, json={"sql": sql})
print("Response Status Code:", res.status_code)
print("Response Text:", res.text)
if res.status_code == 200 or res.status_code == 204:
    print("Migrations applied successfully!")
else:
    print("Migration failed.")
