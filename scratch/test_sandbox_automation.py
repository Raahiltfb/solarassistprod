import requests
import json

BASE_URL = "http://localhost:3000"

def test_sandbox():
    print("==================================================")
    print("TESTING O&M AUTOMATION SANDBOX ENDPOINTS")
    print("==================================================")

    scenarios = [
        "critical_outage",
        "string_underperformance",
        "human_review",
        "grid_failure",
        "recurring_escalate"
    ]

    for scenario in scenarios:
        print(f"\n[TESTING SCENARIO]: {scenario}")
        res = requests.post(f"{BASE_URL}/api/automation/sandbox/simulate", json={"scenario": scenario})
        print(f"Status Code: {res.status_code}")
        print(f"Raw Response: {repr(res.text[:300])}")
        try:
            data = res.json()
            print(f"  ✅ Simulation Success!")
            print(f"     Target Site: {data.get('site_name')}")
            print(f"     Alert: {data.get('alert', {}).get('title')}")
            print(f"     Decision: {data.get('automation_result', {}).get('decision_class')} ({data.get('automation_result', {}).get('confidence_pct')}% Confidence)")
            print(f"     Ticket ID: {data.get('ticket', {}).get('id') if data.get('ticket') else 'None'}")
            print(f"     Work Order ID: {data.get('work_order', {}).get('id') if data.get('work_order') else 'None'}")
            print(f"     Assigned Tech: {data.get('assigned_technician', {}).get('full_name') if data.get('assigned_technician') else 'None'}")
        except Exception as e:
            print(f"  ❌ JSON Parse Error: {e}")

    print("\n--------------------------------------------------")
    print("TESTING 1-CLICK PURGE / CLEAR ENDPOINT")
    print("--------------------------------------------------")
    clear_res = requests.delete(f"{BASE_URL}/api/automation/sandbox/clear")
    if clear_res.status_code == 200:
        cdata = clear_res.json()
        print(f"  ✅ Purge Success!")
        print(f"     Details: {cdata.get('message')}")
        print(f"     Cleared Counts: {cdata.get('cleared')}")
    else:
        print(f"  ❌ Purge Error ({clear_res.status_code}): {clear_res.text}")

    print("\n==================================================")
    print("SANDBOX TESTING COMPLETE")
    print("==================================================")

if __name__ == "__main__":
    test_sandbox()
