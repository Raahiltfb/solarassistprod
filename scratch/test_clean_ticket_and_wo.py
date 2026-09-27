import os
import requests
from dotenv import load_dotenv

load_dotenv("frontend/.env.local")

url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# 1. Fetch 1 alert
alert = requests.get(f"{url}/rest/v1/alerts?limit=1", headers=headers).json()[0]

# 2. Insert clean ticket
ticket_payload = {
    "org_id": alert.get("org_id"),
    "site_id": alert.get("site_id"),
    "alert_id": alert.get("id"),
    "title": f"[DISPATCH_IMMEDIATELY] {alert.get('title')}",
    "description": "Action Decision: DISPATCH_IMMEDIATELY (95% Confidence)\nReasoning: Critical plant outage fault.",
    "status": "open",
    "priority": "p1",
    "sla_due_at": "2026-09-17T20:00:00Z"
}

t_res = requests.post(f"{url}/rest/v1/tickets", headers=headers, json=ticket_payload)
print("Ticket Insert Status:", t_res.status_code)
if t_res.status_code in [200, 201]:
    ticket = t_res.json()[0]
    print("  ✅ Ticket created:", ticket["id"], ticket["title"])

    # Fetch nearest tech
    techs = requests.get(f"{url}/rest/v1/profiles?role=eq.technician", headers=headers).json()
    tech_id = techs[0]["id"] if techs else None
    tech_name = techs[0]["full_name"] if techs else "Unassigned"

    # Insert work order
    wo_payload = {
        "org_id": alert.get("org_id"),
        "site_id": alert.get("site_id"),
        "ticket_id": ticket["id"],
        "technician_id": tech_id,
        "title": f"[DISPATCH_IMMEDIATELY] {alert.get('title')}",
        "description": f"Automated Job Dispatch [DISPATCH_IMMEDIATELY]\nAssigned Tech: {tech_name}",
        "type": "alarm_investigation",
        "status": "scheduled",
        "scheduled_date": "2026-09-17",
        "estimated_duration_mins": 120
    }
    wo_res = requests.post(f"{url}/rest/v1/work_orders", headers=headers, json=wo_payload)
    print("Work Order Insert Status:", wo_res.status_code)
    if wo_res.status_code in [200, 201]:
        wo = wo_res.json()[0]
        print("  ✅ Work Order created:", wo["id"], "Assigned to:", tech_name)
    else:
        print("  ❌ Work Order Insert Error:", wo_res.text)

    # Clean up test ticket & WO
    requests.delete(f"{url}/rest/v1/work_orders?id=eq.{wo['id']}", headers=headers)
    requests.delete(f"{url}/rest/v1/tickets?id=eq.{ticket['id']}", headers=headers)
    print("Test cleanup complete.")
else:
    print("  ❌ Ticket Insert Error:", t_res.text)
