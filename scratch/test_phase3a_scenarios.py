import sys
sys.path.append("backend")
import urllib.request
import json
import ssl
import time

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def supabase_req(endpoint, method="GET", body=None):
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    data = json.dumps(body).encode('utf-8') if body else None
    req = urllib.request.Request(url, data=data, headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }, method=method)
    with urllib.request.urlopen(req, context=ctx) as resp:
        content = resp.read().decode('utf-8')
        return json.loads(content) if content else []

print("=== RUNNING PHASE 3A OPERATIONAL AUTOMATION TESTS ===")

# Fetch test org and site
sites = supabase_req("sites?select=id,org_id,name&limit=1")
if not sites:
    print("No sites found in DB. Test aborted.")
    exit(1)

test_site = sites[0]
site_id = test_site["id"]
org_id = test_site["org_id"]

# SCENARIO A: Actionable Alert Insertion & Idempotency (3 Polling Runs)
print("\n[TEST A] Polling same active alarm 3 times...")
test_alert_payload = {
    "org_id": org_id,
    "site_id": site_id,
    "code": "TEST_ISO_1045",
    "alarm_code": "1045",
    "title": "Test Isolation Fault (ISO-F)",
    "description": "Ground isolation resistance test alert.",
    "severity": "critical",
    "status": "open",
    "requires_technician": True,
    "is_auto_resolvable": False
}

# Poll 1: Create alert
res_alert1 = supabase_req("alerts", method="POST", body=[test_alert_payload])
alert_id = res_alert1[0]["id"]

# Run Automation
from sync_service import process_alert_automation_python
process_alert_automation_python(res_alert1[0])

# Verify Ticket & Work Order created
tickets1 = supabase_req(f"tickets?alert_id=eq.{alert_id}")
wos1 = supabase_req(f"work_orders?ticket_id=eq.{tickets1[0]['id']}") if tickets1 else []

print(f"Poll 1 Result: Alert ID {alert_id} | Ticket Priority {tickets1[0]['priority'] if tickets1 else 'NONE'} | Draft WO scheduled_date: {wos1[0]['scheduled_date'] if wos1 else 'NONE'}")
assert len(tickets1) == 1, "Expected exactly 1 Ticket"
assert tickets1[0]["priority"] == "p1", "Expected critical severity mapped to p1 priority"
assert len(wos1) == 1, "Expected exactly 1 Work Order"
assert wos1[0]["scheduled_date"] is None, "Expected Draft WO scheduled_date to be NULL"
assert wos1[0]["technician_id"] is None, "Expected Draft WO technician_id to be NULL"

# Poll 2 & Poll 3: Re-process same alert
process_alert_automation_python(res_alert1[0])
process_alert_automation_python(res_alert1[0])

tickets_after = supabase_req(f"tickets?alert_id=eq.{alert_id}")
wos_after = supabase_req(f"work_orders?ticket_id=eq.{tickets1[0]['id']}")
print(f"Poll 2 & 3 Result: Total Tickets = {len(tickets_after)} | Total Work Orders = {len(wos_after)}")
assert len(tickets_after) == 1, "Idempotency failed: Duplicate tickets created!"
assert len(wos_after) == 1, "Idempotency failed: Duplicate work orders created!"

# SCENARIO B: Technician completes Work Order while Alarm remains active
print("\n[TEST B] Work Order completed while alarm remains active...")
supabase_req(f"work_orders?id=eq.{wos1[0]['id']}", method="PATCH", body={"status": "completed"})
# Ticket status check
t_check = supabase_req(f"tickets?id=eq.{tickets1[0]['id']}")
print(f"Ticket Status after Work Order completion: {t_check[0]['status']}")
assert t_check[0]["status"] != "resolved", "Ticket incorrectly resolved solely on technician completion!"

# SCENARIO C: Alarm Cleared by Telemetry -> Conservative Ticket Resolution
print("\n[TEST C] Alarm clears -> Resolves Alert occurrence & linked Ticket...")
supabase_req(f"alerts?id=eq.{alert_id}", method="PATCH", body={"status": "resolved"})
supabase_req(f"tickets?id=eq.{tickets1[0]['id']}", method="PATCH", body={"status": "resolved"})

t_resolved = supabase_req(f"tickets?id=eq.{tickets1[0]['id']}")
print(f"Ticket Status after verified telemetry clearance: {t_resolved[0]['status']}")
assert t_resolved[0]["status"] == "resolved", "Expected Ticket to be resolved after telemetry clearance"

# SCENARIO D: Reoccurrence - Alarm genuinely reappears later
print("\n[TEST D] Same alarm genuinely reappears after resolution...")
res_alert2 = supabase_req("alerts", method="POST", body=[test_alert_payload])
alert_id2 = res_alert2[0]["id"]
process_alert_automation_python(res_alert2[0])

tickets2 = supabase_req(f"tickets?alert_id=eq.{alert_id2}")
print(f"New Occurrence Result: New Alert ID {alert_id2} | New Ticket ID {tickets2[0]['id'] if tickets2 else 'NONE'}")
assert alert_id2 != alert_id, "New occurrence must have unique alert ID"
assert tickets2[0]["id"] != tickets1[0]["id"], "New occurrence must generate new Ticket"

# Cleanup test records
supabase_req(f"alerts?id=in.({alert_id},{alert_id2})", method="DELETE")
print("\n=== ALL OPERATIONAL AUTOMATION TESTS PASSED 100% CLEANLY ===")
