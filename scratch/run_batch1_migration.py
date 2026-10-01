import os
import requests
import json

def apply_batch1_migration():
    print("=== APPLYING BATCH 1 MIGRATION: 0007_canonical_cleaning_visits.sql ===")
    
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

    sql_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "supabase", "migrations", "0007_canonical_cleaning_visits.sql")
    with open(sql_file, "r") as f:
        sql_content = f.read()

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json"
    }

    print(f"Applying migration SQL from {os.path.basename(sql_file)} to {url}...")
    res = requests.post(f"{url}/rest/v1/rpc/exec_sql", headers=headers, json={"sql": sql_content})
    print(f"Migration API status: {res.status_code}")
    print(f"Response text: {res.text}")

    # Verify cleaning_visits table structure
    verify_res = requests.get(f"{url}/rest/v1/cleaning_visits?select=count", headers=headers)
    print(f"\nTable verification query status: {verify_res.status_code}")
    if verify_res.status_code == 200:
        print("✅ SUCCESS: public.cleaning_visits table exists and is queryable!")
    else:
        print(f"❌ Verification failed: {verify_res.text}")

if __name__ == "__main__":
    apply_batch1_migration()
