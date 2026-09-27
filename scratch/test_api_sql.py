import requests

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE"

headers = {"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"}

wo_id = "f0aef3b7-31a3-4c2f-ba90-93de1f7f6e57"
wo = requests.get(f"{SUPABASE_URL}/rest/v1/work_orders?select=*,sites(*),tickets(id, title, priority, status, description, alert_id, alerts(id, code, alarm_code, oem, title, description, severity))&id=eq.{wo_id}", headers=headers)
print(wo.status_code)
if wo.status_code == 200:
    print(wo.json())
else:
    print(wo.text)
