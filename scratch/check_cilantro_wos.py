import requests

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE"

headers = {"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"}

cilantro_site_id = "563535e9-8b9a-4919-bf16-7e126380f655"
wos = requests.get(f"{SUPABASE_URL}/rest/v1/work_orders?site_id=eq.{cilantro_site_id}", headers=headers).json()
print("Cilantro WOs:", len(wos))
tickets = requests.get(f"{SUPABASE_URL}/rest/v1/tickets?site_id=eq.{cilantro_site_id}", headers=headers).json()
print("Cilantro Tickets:", len(tickets))
