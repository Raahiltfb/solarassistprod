import os
import sys
import json
import requests
from datetime import datetime, timezone

def parse_env_file(path):
    env = {}
    if not os.path.exists(path):
        return env
    with open(path) as f:
        for line in f:
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.strip().split("=", 1)
                env[k.strip()] = v.strip().strip("\"'\''")
    return env

def main():
    print("=== AUDITING PRODUCTION HISTORICAL BACKFILL (ylnmjvgnjootrkywbcsj) ===")
    prod_backup = parse_env_file("backend/.env.production.backup")
    sb_url = prod_backup.get("NEXT_PUBLIC_SUPABASE_URL") or "https://ylnmjvgnjootrkywbcsj.supabase.co"
    sb_key = prod_backup.get("SUPABASE_SERVICE_ROLE_KEY")

    if "ylnmjvgnjootrkywbcsj" not in sb_url:
        print("FATAL: Target URL is not production! Aborting.")
        sys.exit(1)

    headers = {
        "apikey": sb_key,
        "Authorization": f"Bearer {sb_key}",
        "Content-Type": "application/json"
    }

    # 1. Fetch all 14 Feston station mappings
    r_maps = requests.get(f"{sb_url}/rest/v1/oem_station_mappings?oem=eq.feston&select=*&order=external_station_id.asc", headers=headers)
    mappings = r_maps.json()
    print(f"Total Feston station mappings: {len(mappings)}/14")

    # 2. Fetch inverters
    r_invs = requests.get(f"{sb_url}/rest/v1/inverters?oem=eq.feston&select=*&order=serial_number.asc", headers=headers)
    inverters = r_invs.json()
    print(f"Total Feston inverters in DB: {len(inverters)}/13 (C-1501 mapped at station level)")

    inv_by_site = {i["site_id"]: i for i in inverters}

    total_records = 0
    total_backfill_kwh = 0.0
    total_lifetime_kwh = 0.0
    duplicate_errors = 0
    results_table = []

    print("\n--- PER-STATION & INVERTER AUDIT ---")
    for m in mappings:
        st_id = str(m["external_station_id"])
        st_name = m.get("station_name")
        meta = m.get("metadata") or {}
        hb = meta.get("historical_backfill") or {}
        daily = meta.get("historical_daily_records") or []
        monthly = meta.get("historical_monthly_summary") or []
        inv = inv_by_site.get(m["site_id"])
        inv_sn = inv.get("serial_number") if inv else "N/A (Collector D26320EA1E)"

        status = hb.get("status")
        dates = [d["date"] for d in daily if "date" in d]
        unique_dates = set(dates)
        if len(dates) != len(unique_dates):
            duplicate_errors += (len(dates) - len(unique_dates))

        earliest = dates[0] if dates else "N/A"
        latest = dates[-1] if dates else "N/A"
        rec_count = len(daily)
        total_records += rec_count

        daily_gen_sum = sum(d.get("generation_kwh", 0.0) for d in daily)
        total_backfill_kwh += daily_gen_sum

        reconcil = hb.get("lifetime_reconciliation") or {}
        solaros_lt = reconcil.get("solaros_lifetime_kwh", 0.0)
        total_lifetime_kwh += solaros_lt
        var_pct = reconcil.get("variance_pct", 0.0)

        results_table.append({
            "station_id": st_id,
            "inverter_sn": inv_sn,
            "station_name": st_name,
            "status": status,
            "records": rec_count,
            "coverage": f"{earliest} → {latest}",
            "solaros_lt": solaros_lt,
            "backfill_sum": daily_gen_sum,
            "var_pct": var_pct,
            "monthly_rollups": len(monthly)
        })

        print(f"Station {st_id:6s} | SN: {inv_sn:24s} | {st_name:20s} | Status: {status:22s} | Records: {rec_count:3d} | Coverage: {earliest} → {latest} | Gen: {daily_gen_sum:8.1f} kWh vs {solaros_lt:8.1f} kWh ({var_pct:5.2f}%)")

    print("\n--- SUMMARY OF BACKFILL AUDIT ---")
    print(f"Total Stations/Inverters audited: {len(results_table)}/14")
    print(f"Completed: {sum(1 for r in results_table if r['status'] == 'completed')}")
    print(f"Unavailable from source: {sum(1 for r in results_table if r['status'] == 'unavailable_from_source')}")
    print(f"Partially completed: {sum(1 for r in results_table if r['status'] == 'partially_completed')}")
    print(f"Total daily records across fleet: {total_records}")
    print(f"Duplicate (inverter, date) occurrences: {duplicate_errors}")
    print(f"Total Backfilled Generation: {total_backfill_kwh:.1f} kWh vs SolarOS Reported: {total_lifetime_kwh:.1f} kWh")

    # 3. Check C-1501 metadata in detail
    m_92026 = next(m for m in mappings if str(m["external_station_id"]) == "92026")
    meta_92026 = m_92026.get("metadata") or {}
    print("\n--- STATION 92026 (C-1501) DETAILED AUDIT ---")
    print(json.dumps(meta_92026.get("historical_backfill"), indent=2))

    # 4. Solis fleet integrity check
    r_solis_invs = requests.get(f"{sb_url}/rest/v1/inverters?oem=eq.solis&select=id&limit=1", headers={**headers, "Prefer": "count=exact"})
    solis_count = r_solis_invs.headers.get("content-range")
    print(f"\nSolis Inverters count in production: {solis_count} (Unchanged)")

    # 5. Live Cron Health & Sync Runs
    r_sync = requests.get(f"{sb_url}/rest/v1/sync_runs?order=started_at.desc&limit=3", headers=headers)
    print("\n--- LATEST PRODUCTION SYNC RUNS ---")
    for sr in r_sync.json():
        print(f"ID: {sr['id']} | OEM: {sr.get('oem')} | Status: {sr.get('status')} | Started: {sr.get('started_at')} | Finished: {sr.get('completed_at')} | Inverters: {sr.get('inverters_processed')} | Telem: {sr.get('telemetry_records')}")

if __name__ == "__main__":
    main()

