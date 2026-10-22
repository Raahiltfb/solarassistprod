import os
import requests
import json

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE"

admin_headers = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json"
}

ORG_ID = "ac763745-aed5-469d-9956-459fb00a337e"
PASSWORD = "Solar@12345"

def run():
    print("--- STEP 1: Remove tech@solarassist.dev ---")
    # Find user in auth
    auth_users_res = requests.get(f"{SUPABASE_URL}/auth/v1/admin/users", headers=admin_headers)
    users = auth_users_res.json().get("users", [])
    legacy_tech = next((u for u in users if u.get("email") == "tech@solarassist.dev"), None)
    
    if legacy_tech:
        uid = legacy_tech["id"]
        print(f"Found legacy auth tech@solarassist.dev: {uid}")
        # Delete team members
        requests.delete(f"{SUPABASE_URL}/rest/v1/technician_team_members?technician_id=eq.{uid}", headers=admin_headers)
        # Delete profile
        requests.delete(f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{uid}", headers=admin_headers)
        # Delete auth user
        del_res = requests.delete(f"{SUPABASE_URL}/auth/v1/admin/users/{uid}", headers=admin_headers)
        print(f"Deleted legacy auth user: {del_res.status_code}")
    else:
        # Check profiles table directly
        p_res = requests.get(f"{SUPABASE_URL}/rest/v1/profiles?email=eq.tech@solarassist.dev", headers=admin_headers).json()
        if p_res:
            uid = p_res[0]["id"]
            requests.delete(f"{SUPABASE_URL}/rest/v1/technician_team_members?technician_id=eq.{uid}", headers=admin_headers)
            requests.delete(f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{uid}", headers=admin_headers)
            print(f"Deleted legacy profile: {uid}")

    print("\n--- STEP 2: Ensure Tech 9 & Tech 10 exist ---")
    tech_configs = [
        {
            "email": "tech9@solarassist.dev",
            "full_name": "Tech Nine (Test)",
            "base_address": "Shivajinagar, Pune",
            "base_latitude": 18.5314,
            "base_longitude": 73.8446
        },
        {
            "email": "tech10@solarassist.dev",
            "full_name": "Tech Ten (Test)",
            "base_address": "Kothrud, Pune",
            "base_latitude": 18.5074,
            "base_longitude": 73.8077
        }
    ]

    tech_id_map = {}
    # Fetch all current tech profiles
    current_techs = requests.get(f"{SUPABASE_URL}/rest/v1/profiles?role=eq.technician", headers=admin_headers).json()
    for t in current_techs:
        tech_id_map[t["email"]] = t["id"]

    for tc in tech_configs:
        email = tc["email"]
        existing_u = next((u for u in users if u.get("email") == email), None)
        u_id = None
        if not existing_u:
            # Create in auth
            create_res = requests.post(
                f"{SUPABASE_URL}/auth/v1/admin/users",
                headers=admin_headers,
                json={
                    "email": email,
                    "password": PASSWORD,
                    "email_confirm": True,
                    "user_metadata": {"full_name": tc["full_name"], "role": "technician"}
                }
            )
            c_data = create_res.json()
            if create_res.status_code in [200, 201]:
                u_id = c_data["id"]
                print(f"Created auth user for {email}: {u_id}")
            else:
                print(f"Error creating user {email}: {c_data}")
        else:
            u_id = existing_u["id"]
            print(f"Auth user {email} already exists: {u_id}")

        if u_id:
            tech_id_map[email] = u_id
            # Upsert into profiles
            profile_payload = {
                "id": u_id,
                "org_id": ORG_ID,
                "email": email,
                "full_name": tc["full_name"],
                "role": "technician",
                "base_address": tc["base_address"],
                "base_latitude": tc["base_latitude"],
                "base_longitude": tc["base_longitude"]
            }
            prof_res = requests.post(
                f"{SUPABASE_URL}/rest/v1/profiles",
                headers={**admin_headers, "Prefer": "resolution=merge-duplicates"},
                json=profile_payload
            )
            print(f"Upserted profile for {email}: {prof_res.status_code}")

    print("\n--- STEP 3: Setup 5 Teams ---")
    # Current teams in DB
    existing_teams = requests.get(f"{SUPABASE_URL}/rest/v1/technician_teams?org_id=eq.{ORG_ID}&order=created_at.asc", headers=admin_headers).json()
    print(f"Found {len(existing_teams)} existing teams.")

    # Target 5 teams definition
    # 4 teams for Mumbai / MMR + Navi Mumbai (no location label in name)
    # 1 team for Pune ("Team E (Pune)")
    target_teams_config = [
        {"name": "Team A", "base_address": "Navi Mumbai Hub", "lat": 19.2183, "lng": 72.9781, "color": "#3b82f6"},
        {"name": "Team B", "base_address": "Malad West Hub", "lat": 19.1860, "lng": 72.8485, "color": "#10b981"},
        {"name": "Team C", "base_address": "Dadar Central Hub", "lat": 19.0770, "lng": 72.9980, "color": "#f59e0b"},
        {"name": "Team D", "base_address": "Panvel Hub", "lat": 19.2403, "lng": 73.1305, "color": "#8b5cf6"},
        {"name": "Team E (Pune)", "base_address": "Pune Hub", "lat": 18.5204, "lng": 73.8567, "color": "#ec4899"},
    ]

    team_id_map = {}
    for i, cfg in enumerate(target_teams_config):
        if i < len(existing_teams):
            # Update existing team
            t_id = existing_teams[i]["id"]
            up_payload = {
                "name": cfg["name"],
                "base_address": cfg["base_address"],
                "base_latitude": cfg["lat"],
                "base_longitude": cfg["lng"],
                "color_code": cfg["color"],
                "is_active": True
            }
            u_res = requests.patch(
                f"{SUPABASE_URL}/rest/v1/technician_teams?id=eq.{t_id}",
                headers=admin_headers,
                json=up_payload
            )
            print(f"Updated team {i+1} to {cfg['name']} ({t_id}): {u_res.status_code}")
            team_id_map[cfg["name"]] = t_id
        else:
            # Check if team already exists by name
            check_res = requests.get(f"{SUPABASE_URL}/rest/v1/technician_teams?name=eq.{cfg['name']}&org_id=eq.{ORG_ID}", headers=admin_headers).json()
            if check_res:
                t_id = check_res[0]["id"]
                team_id_map[cfg["name"]] = t_id
                print(f"Team {cfg['name']} already exists ({t_id})")
            else:
                ins_payload = {
                    "org_id": ORG_ID,
                    "name": cfg["name"],
                    "base_address": cfg["base_address"],
                    "base_latitude": cfg["lat"],
                    "base_longitude": cfg["lng"],
                    "color_code": cfg["color"],
                    "is_active": True
                }
                ins_res = requests.post(
                    f"{SUPABASE_URL}/rest/v1/technician_teams",
                    headers={**admin_headers, "Prefer": "return=representation"},
                    json=ins_payload
                )
                new_t = ins_res.json()[0]
                t_id = new_t["id"]
                team_id_map[cfg["name"]] = t_id
                print(f"Inserted new team {cfg['name']} ({t_id})")

    print("\n--- STEP 4: Split Team Members ---")
    # Fetch refreshed tech profiles
    refreshed_techs = requests.get(f"{SUPABASE_URL}/rest/v1/profiles?role=eq.technician", headers=admin_headers).json()
    email_to_id = {t["email"]: t["id"] for t in refreshed_techs}

    team_assignments = [
        ("Team A", ["tech1@solarassist.dev", "tech2@solarassist.dev"]),
        ("Team B", ["tech3@solarassist.dev", "tech4@solarassist.dev"]),
        ("Team C", ["tech5@solarassist.dev", "tech6@solarassist.dev"]),
        ("Team D", ["tech7@solarassist.dev", "tech8@solarassist.dev"]),
        ("Team E (Pune)", ["tech9@solarassist.dev", "tech10@solarassist.dev"]),
    ]

    # Delete all existing memberships for these 5 teams
    all_team_ids = list(team_id_map.values())
    for tid in all_team_ids:
        requests.delete(f"{SUPABASE_URL}/rest/v1/technician_team_members?team_id=eq.{tid}", headers=admin_headers)
    print("Cleared existing memberships.")

    # Insert new memberships
    for team_name, tech_emails in team_assignments:
        tid = team_id_map[team_name]
        for temail in tech_emails:
            tech_id = email_to_id.get(temail)
            if not tech_id:
                print(f"WARNING: technician {temail} not found!")
                continue
            m_res = requests.post(
                f"{SUPABASE_URL}/rest/v1/technician_team_members",
                headers=admin_headers,
                json={"team_id": tid, "technician_id": tech_id}
            )
            print(f"Assigned {temail} to {team_name}: {m_res.status_code}")

    print("\n--- VERIFICATION ---")
    # Verify profiles count
    v_techs = requests.get(f"{SUPABASE_URL}/rest/v1/profiles?role=eq.technician&order=email.asc", headers=admin_headers).json()
    print(f"Total technicians in DB: {len(v_techs)}")
    for t in v_techs:
        print(f"  {t['email']} - {t['full_name']} - {t['base_address']}")

    # Verify teams
    v_teams = requests.get(f"{SUPABASE_URL}/rest/v1/technician_teams?org_id=eq.{ORG_ID}&select=id,name,color_code,technician_team_members(technician_id,profiles(full_name,email))&order=name.asc", headers=admin_headers).json()
    print(f"\nTotal teams in DB: {len(v_teams)}")
    for tm in v_teams:
        m_names = [m["profiles"]["full_name"] + " (" + m["profiles"]["email"] + ")" for m in tm.get("technician_team_members", []) if m.get("profiles")]
        print(f"  {tm['name']}: {', '.join(m_names)}")

if __name__ == "__main__":
    run()
