import requests
import json
import os
import time

def test_performance():
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

    headers = {
        "apikey": key,
        "Content-Type": "application/json"
    }

    # Authenticate as admin
    auth_res = requests.post(f"{url}/auth/v1/token?grant_type=password", headers=headers, json={"email": "admin@solarassist.dev", "password": "password123"})
    if auth_res.status_code != 200:
        auth_res = requests.post(f"{url}/auth/v1/token?grant_type=password", headers=headers, json={"email": "tech1@solarassist.dev", "password": "password123"})

    token = auth_res.json()["access_token"]
    auth_headers = {**headers, "Authorization": f"Bearer {token}"}

    # Fetch all inverters
    inv_res = requests.get(f"{url}/rest/v1/inverters?select=id,capacity_kw", headers=auth_headers)
    inverters = inv_res.json()
    inverter_ids = [inv["id"] for inv in inverters]
    total_capacity = sum(float(inv.get("capacity_kw") or 0) for inv in inverters) or 1.0

    print(f"=== BENCHMARKING PERFORMANCE OVERHAUL (Phase 0.1) ===")
    print(f"Total Inverters: {len(inverter_ids)} | Fleet Capacity: {total_capacity:.2f} kWp\n")

    ranges = ["today", "week", "month", "year", "lifetime"]
    start_dates = {
        "today": "2026-09-01T00:00:00Z",
        "week": "2026-08-25T00:00:00Z",
        "month": "2026-09-01T00:00:00Z",
        "year": "2026-01-01T00:00:00Z",
        "lifetime": "2020-01-01T00:00:00Z",
    }
    end_dates = {
        "today": "2026-09-01T23:59:59Z",
        "week": "2026-09-01T23:59:59Z",
        "month": "2026-09-30T23:59:59Z",
        "year": "2026-12-31T23:59:59Z",
        "lifetime": "2026-12-31T23:59:59Z",
    }

    for r in ranges:
        st = start_dates[r]
        et = end_dates[r]

        # 1. OLD METHOD: Fetch raw telemetry and aggregate in Python
        t0 = time.time()
        raw_res = requests.get(
            f"{url}/rest/v1/telemetry?select=timestamp,ac_power_kw,daily_generation_kwh,total_generation_kwh,specific_yield,inverter_id&inverter_id=in.({','.join(inverter_ids)})&timestamp=gte.{st}&timestamp=lte.{et}&order=timestamp.asc",
            headers=auth_headers
        )
        old_time = (time.time() - t0) * 1000
        raw_data = raw_res.json() if isinstance(raw_res.json(), list) else []
        old_payload_bytes = len(raw_res.content)

        # 2. NEW METHOD: Call Postgres RPC get_telemetry_analytics
        t1 = time.time()
        rpc_payload = {
            "p_inverter_ids": inverter_ids,
            "p_range": r,
            "p_start_date": st,
            "p_end_date": et,
            "p_total_capacity": total_capacity
        }
        rpc_res = requests.post(f"{url}/rest/v1/rpc/get_telemetry_analytics", headers=auth_headers, json=rpc_payload)
        new_time = (time.time() - t1) * 1000
        rpc_data = rpc_res.json() if isinstance(rpc_res.json(), list) else []
        new_payload_bytes = len(rpc_res.content)

        payload_reduction = ((old_payload_bytes - new_payload_bytes) / old_payload_bytes * 100) if old_payload_bytes > 0 else 0
        speedup = (old_time / new_time) if new_time > 0 else 1.0

        print(f"Range: '{r.upper()}'")
        print(f"  Old Method: {len(raw_data)} raw rows | {old_payload_bytes/1024:.2f} KB | {old_time:.2f} ms")
        print(f"  New RPC:    {len(rpc_data)} summary rows | {new_payload_bytes/1024:.2f} KB | {new_time:.2f} ms")
        print(f"  --> Payload Reduction: {payload_reduction:.1f}% | Latency Speedup: {speedup:.2f}x\n")

if __name__ == "__main__":
    test_performance()
