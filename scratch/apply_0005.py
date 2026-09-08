import requests
import json
import os

def apply_migration():
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", ".env.local")
    env_vars = {}
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                if "=" in line and not line.startswith("#"):
                    k, v = line.strip().split("=", 1)
                    env_vars[k] = v.strip('"').strip("'")

    url = env_vars.get("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321")
    key = env_vars.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

    sql_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "supabase", "migrations", "0005_cleaning_planner.sql")
    with open(sql_path, "r") as f:
        sql = f.read()

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }

    res = requests.post(f"{url}/rest/v1/rpc/exec_sql", headers=headers, json={"sql": sql})
    print(f"Migration execution status: {res.status_code}")
    print(f"Response: {res.text}")

if __name__ == "__main__":
    apply_migration()
