import requests
import json
import os

def run_batch2_verification():
    print("=== SOLARASSIST PHASE 2 RESET - BATCH 2 VERIFICATION ===")

    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", ".env.local")
    env_vars = {}
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                if "=" in line and not line.startswith("#"):
                    k, v = line.strip().split("=", 1)
                    env_vars[k] = v.strip('"').strip("'")

    url = env_vars.get("NEXT_PUBLIC_SUPABASE_URL", "https://ylnmjvgnjootrkywbcsj.supabase.co")
    service_key = env_vars.get("SUPABASE_SERVICE_ROLE_KEY", "")

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json"
    }

    # 1. Fetch sites & active technician teams
    sites = requests.get(f"{url}/rest/v1/sites?select=id,name", headers=headers).json()
    teams = requests.get(f"{url}/rest/v1/technician_teams?select=id,name&is_active=eq.true", headers=headers).json()
    
    print(f"  ✓ Active Org Sites count: {len(sites)}")
    print(f"  ✓ Active Technician Teams count: {len(teams)}")
    assert len(sites) > 0, "No sites found!"
    assert len(teams) > 0, "No active teams found!"

    # 2. Trigger Macro Scheduler via API endpoint or inspect existing plan & canonical visits
    print("\n--- Triggering/Checking Planner Generation ---")
    gen_res = requests.post("http://localhost:3000/api/cleaning/planner/generate", json={
        "year": 2026,
        "month": 9,
        "planning_capacity_mins": 480,
        "scheduling_tolerance_days": 2
    })
    
    if gen_res.status_code == 200:
        data = gen_res.json()
        print(f"  ✓ Planner API returned success: {data.get('assignmentsCount')} planned assignments, {data.get('proposedVisitsCount')} proposed visits, {data.get('unscheduledSitesCount')} unscheduled sites")
    else:
        print(f"  Note on API trigger response ({gen_res.status_code}): {gen_res.text}")

    # 3. Query canonical `cleaning_visits` table for 2026-09
    print("\n--- Verifying Canonical `cleaning_visits` Records ---")
    visits = requests.get(f"{url}/rest/v1/cleaning_visits?cycle_period=eq.2026-09&select=*", headers=headers).json()
    print(f"  ✓ Total canonical cleaning_visits stored in DB for cycle 2026-09: {len(visits)}")
    assert len(visits) > 0, "No canonical cleaning_visits found after planning generation!"

    planned_visits = [v for v in visits if v["status"] == "planned"]
    unscheduled_visits = [v for v in visits if v["status"] == "unscheduled"]

    print(f"  ✓ Planned visits count: {len(planned_visits)}")
    print(f"  ✓ Unscheduled visits count: {len(unscheduled_visits)}")

    # 4. Validate domain structure and constraints of generated visits
    valid_reasons = {"team_capacity", "allowed_weekday", "blackout_date", "scheduling_window_exceeded", "no_available_team", "other"}
    for v in visits:
        assert v["status"] in ["planned", "unscheduled", "required"], f"Invalid status: {v['status']}"
        assert v["cycle_period"] == "2026-09", f"Invalid cycle period: {v['cycle_period']}"
        assert v["visit_sequence_in_month"] >= 1, "visit_sequence_in_month must be >= 1"
        assert v["planner_rationale"] and len(v["planner_rationale"]) > 0, "planner_rationale must be populated"

        if v["status"] == "unscheduled":
            assert v["unscheduled_reason"] in valid_reasons, f"Invalid unscheduled reason: {v['unscheduled_reason']}"
            assert v["scheduled_date"] is None, "Unscheduled visit must have null scheduled_date"
            assert v["assigned_team_id"] is None, "Unscheduled visit must have null assigned_team_id"
            assert v["constraint_state"] == "blocking", "Unscheduled visit should have blocking constraint_state"
        elif v["status"] == "planned":
            assert v["scheduled_date"] is not None, "Planned visit must have scheduled_date"
            assert v["assigned_team_id"] is not None, "Planned visit must have assigned_team_id"

    print("\n=== ALL BATCH 2 VERIFICATION CHECKS PASSED PERFECTLY ===")

if __name__ == "__main__":
    run_batch2_verification()
