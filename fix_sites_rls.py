import os
import requests
from dotenv import load_dotenv

load_dotenv("frontend/.env.local")

url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json"
}

sql = """
drop policy if exists sites_tech_update on public.sites;
create policy sites_tech_update on public.sites for update using (
  org_id = public.current_org() and public.current_role() = 'technician'
);
NOTIFY pgrst, 'reload schema';
"""

res = requests.post(f"{url}/rest/v1/rpc/exec_sql", headers=headers, json={"sql": sql})
print(res.status_code, res.text)
