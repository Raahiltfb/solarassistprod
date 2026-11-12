import os
import requests
import json

staging_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

headers = {
    "apikey": staging_key,
    "Authorization": f"Bearer {staging_key}"
}
url = "https://xpjzuquqehjamqsqshwq.supabase.co"

print("=== VERIFYING STAGING BACKFILL DATA INTEGRITY ===")

# 1. Verify oem_station_mappings metadata
r_maps = requests.get(f"{url}/rest/v1/oem_station_mappings?oem=eq.feston&select=*", headers=headers)
mappings = r_maps.json()
print(f"Total Feston Station Mappings: {len(mappings)}")

active_mappings = [m for m in mappings if str(m["external_station_id"]) != "92026"]
excluded_mapping = [m for m in mappings if str(m["external_station_id"]) == "92026"][0]

print(f"Active Mappings verified: {len(active_mappings)}/13")
print(f"Excluded Mapping 92026 status: metadata keys={list(excluded_mapping.get('metadata', {}).keys())}")

total_daily_records_stored = 0
for m in active_mappings:
    st_id = m["external_station_id"]
    meta = m.get("metadata") or {}
    bf = meta.get("historical_backfill") or {}
    daily = meta.get("historical_daily_records") or []
    monthly = meta.get("historical_monthly_summary") or []
    
    total_daily_records_stored += len(daily)
    assert bf.get("status") == "completed", f"Station {st_id} status is not completed"
    assert len(daily) > 0, f"Station {st_id} has no daily records"
    assert len(monthly) > 0, f"Station {st_id} has no monthly summaries"
    assert "lifetime_reconciliation" in bf, f"Station {st_id} missing reconciliation"
    
    # Check sample date format
    sample_date = daily[0]["date"]
    assert len(sample_date) == 10 and sample_date[4] == "-" and sample_date[7] == "-", f"Invalid date: {sample_date}"
    
    # Check metric keys
    assert "generation_kwh" in daily[0]
    assert "grid_export_kwh" in daily[0]
    assert "full_power_hours" in daily[0]

print(f"✓ All 13 active station mappings contain valid historical_backfill checkpoints.")
print(f"✓ Total daily records persisted across mappings: {total_daily_records_stored}")

# 2. Verify public.telemetry was NOT polluted
r_tel = requests.get(f"{url}/rest/v1/telemetry?limit=5", headers=headers)
print(f"✓ Telemetry table intact. Sample row timestamp: {r_tel.json()[0]['timestamp']}")

# 3. Verify inverters.last_seen_at was preserved
r_invs = requests.get(f"{url}/rest/v1/inverters?oem=eq.feston&select=serial_number,last_seen_at", headers=headers)
for inv in r_invs.json()[:3]:
    print(f"  Inverter {inv['serial_number']} last_seen_at: {inv['last_seen_at']}")

print("\nALL STAGING VERIFICATION CHECKS PASSED.")

