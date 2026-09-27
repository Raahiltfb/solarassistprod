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

# 1. Fetch 1 alert
alert_res = requests.get(f"{url}/rest/v1/alerts?limit=1", headers=headers)
alerts = alert_res.json()
if not alerts:
    print("No alerts found")
    exit()

alert = alerts[0]
print("Alert:", alert["id"], alert["title"])

# Try inserting ticket with action_decision_class
ticket_payload = {
    "org_id": alert.get("org_id"),
    "site_id": alert.get("site_id"),
    "alert_id": alert.get("id"),
    "title": "[TEST TICKET] Test",
    "description": "Test description",
    "status": "open",
    "priority": "p1",
    "action_decision_class": "DISPATCH_IMMEDIATELY",
    "decision_confidence_pct": 95,
    "decision_reasoning": "Test reasoning"
}

t_res = requests.post(f"{url}/rest/v1/tickets", headers=headers, json=ticket_payload)
print("Ticket Insert Status:", t_res.status_code)
print("Ticket Response:", t_res.text)
