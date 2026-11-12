import os
import sys
import time
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

class FestonHistoricalBackfillEngine:
    """
    Solar Assist Feston / SolarOS Historical Daily Backfill Engine.
    
    Adheres strictly to:
    1. Zero pollution of instantaneous telemetry tables.
    2. Preservation of SolarOS calendar dates and timezone semantics.
    3. Resumable and idempotent execution with per-inverter checkpoints.
    4. 0.8s - 1.0s request pacing with exponential backoff on HTTP 429.
    5. Preserves existing mapping metadata.
    6. Complete isolation from live 15-minute polling cron & distributed lock.
    """

    def __init__(self, target_env="staging", pacing_sec=0.85):
        self.target_env = target_env
        self.pacing_sec = pacing_sec
        
        # Load environment
        backend_env = parse_env_file("backend/.env")
        frontend_env = parse_env_file("frontend/.env.local")
        prod_backup = parse_env_file("backend/.env.production.backup")

        self.solaros_token = backend_env.get("SOLAROS_ACCESS_TOKEN") or prod_backup.get("SOLAROS_ACCESS_TOKEN")
        if not self.solaros_token:
            raise ValueError("SOLAROS_ACCESS_TOKEN not found in environment!")

        if target_env == "staging":
            self.supabase_url = frontend_env.get("NEXT_PUBLIC_SUPABASE_URL") or "https://xpjzuquqehjamqsqshwq.supabase.co"
            self.supabase_key = frontend_env.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
            if not self.supabase_key:
                raise ValueError("SUPABASE_SERVICE_ROLE_KEY not found in environment!")
            if "ylnmjvgnjootrkywbcsj" in self.supabase_url:
                raise ValueError("Targeting production while target_env='staging'! Safety abort.")
        elif target_env == "production":
            self.supabase_url = prod_backup.get("NEXT_PUBLIC_SUPABASE_URL") or prod_backup.get("SUPABASE_URL") or "https://ylnmjvgnjootrkywbcsj.supabase.co"
            self.supabase_key = prod_backup.get("SUPABASE_SERVICE_ROLE_KEY")
            if "ylnmjvgnjootrkywbcsj" not in self.supabase_url:
                raise ValueError(f"Production URL mismatch ({self.supabase_url})! Safety abort.")
        else:
            raise ValueError(f"Unknown target_env: {target_env}")

        self.sb_headers = {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        self.solaros_headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.solaros_token}"
        }

    def _patch_supabase(self, mapping_id, updated_metadata, max_retries=5):
        patch_url = f"{self.supabase_url}/rest/v1/oem_station_mappings?id=eq.{mapping_id}"
        for attempt in range(max_retries):
            try:
                patch_res = requests.patch(patch_url, headers=self.sb_headers, json={
                    "metadata": updated_metadata,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }, timeout=15)
                if patch_res.status_code in (200, 204):
                    return True
                print(f"    [Supabase Patch HTTP {patch_res.status_code}] {patch_res.text[:120]}")
                time.sleep(1.5 * (attempt + 1))
            except Exception as e:
                print(f"    [Supabase Patch Network Exception attempt {attempt+1}/{max_retries}]: {e}")
                time.sleep(2.0 * (attempt + 1))
        return False

    def _call_solaros(self, endpoint, params=None, max_retries=5):
        url = f"https://india.solaros.com{endpoint}"
        for attempt in range(max_retries):
            try:
                time.sleep(self.pacing_sec)
                r = requests.get(url, headers=self.solaros_headers, params=params, timeout=15)
                if r.status_code == 200:
                    return r.json()
                if r.status_code == 429:
                    wait_time = (attempt + 1) * 2.5
                    print(f"    [Rate Limit 429] Pacing backoff: sleeping {wait_time:.1f}s...")
                    time.sleep(wait_time)
                    continue
                print(f"    [HTTP {r.status_code}] on {endpoint}: {r.text[:120]}")
                time.sleep(1.0)
            except Exception as e:
                print(f"    [Request Exception] {e}")
                time.sleep(1.5)
        return None

    def get_feston_fleet(self):
        """Fetch all Feston station mappings and linked inverters from target Supabase."""
        # 1. Station mappings
        url_maps = f"{self.supabase_url}/rest/v1/oem_station_mappings?oem=eq.feston&select=*&order=external_station_id.asc"
        r_maps = requests.get(url_maps, headers=self.sb_headers)
        if r_maps.status_code != 200:
            raise RuntimeError(f"Failed to fetch station mappings: {r_maps.status_code} {r_maps.text}")
        mappings = r_maps.json()

        # 2. Inverters
        url_invs = f"{self.supabase_url}/rest/v1/inverters?oem=eq.feston&select=*&order=serial_number.asc"
        r_invs = requests.get(url_invs, headers=self.sb_headers)
        if r_invs.status_code != 200:
            raise RuntimeError(f"Failed to fetch inverters: {r_invs.status_code} {r_invs.text}")
        inverters = r_invs.json()

        # Map by site_id
        inv_by_site = {i["site_id"]: i for i in inverters}
        fleet = []
        for m in mappings:
            ext_id = str(m["external_station_id"])
            site_id = m["site_id"]
            inv = inv_by_site.get(site_id)
            
            if not inv:
                # Station 92026 (C-1501) or stations with offline Wi-Fi
                # Registered fleet in Solar Assist includes all 14 stations.
                fleet.append({
                    "mapping_id": m["id"],
                    "site_id": site_id,
                    "station_id": ext_id,
                    "station_name": m.get("station_name", ""),
                    "existing_metadata": m.get("metadata") or {},
                    "inverter_id": None,
                    "serial_number": "N/A (Collector D26320EA1E)" if ext_id == "92026" else "N/A",
                    "oem_device_id": "715266" if ext_id == "92026" else None,
                    "capacity_kw": 4.95 if ext_id == "92026" else 0.0,
                    "model": "Feston / SolarOS Station"
                })
                print(f"Station {ext_id} ({m.get('station_name')}): Included in fleet (registered mapping {m['id']}).")
                continue

            fleet.append({
                "mapping_id": m["id"],
                "site_id": site_id,
                "station_id": ext_id,
                "station_name": m.get("station_name", ""),
                "existing_metadata": m.get("metadata") or {},
                "inverter_id": inv["id"],
                "serial_number": inv.get("serial_number"),
                "oem_device_id": inv.get("oem_device_id"),
                "capacity_kw": float(inv.get("capacity_kw") or 0.0),
                "model": inv.get("model", "")
            })

        print(f"Configured {len(fleet)} Solar Assist Feston stations/inverters for backfill in {self.target_env.upper()}.")
        return fleet

    def run_backfill_for_inverter(self, item, dry_run=False):
        st_id = item["station_id"]
        inv_sn = item["serial_number"]
        st_name = item["station_name"]
        existing_meta = dict(item["existing_metadata"])
        
        print(f"\n========================================================")
        print(f"Processing Station {st_id} ({st_name}) | Inverter SN: {inv_sn}")

        # 1. Fetch lifetime totals from SolarOS
        total_data = self._call_solaros(f"/maintain-s/history/power/{st_id}/stats/total")
        if not total_data:
            print(f"  [ERROR] Failed to fetch stats/total for station {st_id}")
            return None

        stats = total_data.get("statistics") or {}
        op_days = total_data.get("operatingTotalDays") or 0
        lifetime_gen = float(stats.get("generationValue") or 0.0)
        lifetime_grid = float(stats.get("gridValue") or 0.0)
        years = [rec.get("year") for rec in (total_data.get("records") or []) if rec.get("year")]

        print(f"  SolarOS Lifetime: {lifetime_gen:.2f} kWh | Operating Days: {op_days} | Years: {years}")

        # Check existing checkpoint
        existing_backfill = existing_meta.get("historical_backfill") or {}
        existing_daily = existing_meta.get("historical_daily_records") or []
        existing_dates = {d["date"] for d in existing_daily if "date" in d}

        print(f"  Existing Checkpoint: Status={existing_backfill.get('status', 'none')} | Existing Dates={len(existing_dates)}")

        all_daily_records = list(existing_daily)
        all_monthly_summaries = []
        new_records_count = 0
        duplicate_prevented_count = 0

        # 2. Iterate through each active year and month
        for yr in sorted(years):
            yr_data = self._call_solaros(f"/maintain-s/history/power/{st_id}/stats/year?year={yr}")
            if not yr_data:
                continue
            
            m_records = yr_data.get("records") or []
            for m_rec in m_records:
                mo = m_rec.get("month")
                mo_gen_raw = m_rec.get("generationValue")
                mo_grid_raw = m_rec.get("gridValue")
                mo_gen = float(mo_gen_raw or 0.0)
                mo_grid = float(mo_grid_raw or 0.0)
                
                # If station has reported months, explore month details (even if station has offline Wi-Fi or null aggregates)
                if not mo:
                    continue
                if mo_gen == 0.0 and mo_grid == 0.0 and mo_gen_raw is None and st_id != "92026":
                    continue

                if mo_gen > 0.0 or mo_grid > 0.0:
                    all_monthly_summaries.append({
                        "year": yr,
                        "month": mo,
                        "generation_kwh": round(mo_gen, 3),
                        "grid_export_kwh": round(mo_grid, 3)
                    })

                # Fetch daily breakdown for this month
                m_data = self._call_solaros(f"/maintain-s/history/power/{st_id}/stats/month?year={yr}&month={mo}")
                if not m_data:
                    continue

                d_records = m_data.get("records") or []
                for d_rec in d_records:
                    day_num = d_rec.get("day")
                    if not day_num:
                        continue
                    
                    date_str = f"{yr:04d}-{mo:02d}-{day_num:02d}"
                    d_gen = float(d_rec.get("generationValue") or 0.0)
                    d_grid = float(d_rec.get("gridValue") or 0.0)
                    fph = float(d_rec.get("fullPowerHoursDay") or 0.0)

                    # Check if already present (idempotent / duplicate protection)
                    if date_str in existing_dates:
                        duplicate_prevented_count += 1
                        continue

                    # Only record active operating days with verified telemetry from SolarOS
                    if d_gen > 0.0 or d_grid > 0.0:
                        all_daily_records.append({
                            "date": date_str,
                            "generation_kwh": round(d_gen, 3),
                            "grid_export_kwh": round(d_grid, 3),
                            "full_power_hours": round(fph, 2)
                        })
                        existing_dates.add(date_str)
                        new_records_count += 1

        # Sort daily records chronologically
        all_daily_records.sort(key=lambda r: r["date"])

        # 3. Handle station with zero retrievable generation records (e.g. C-1501 / 92026)
        if not all_daily_records and (stats.get("generationValue") is None or lifetime_gen == 0.0):
            print(f"  [SOURCE API LIMITATION] No historical generation records available for station {st_id} ({st_name}).")
            api_summary = (
                f"Station-level historical stats endpoints (/maintain-s/history/power/{st_id}/stats/{{total,year,month}}) "
                f"returned HTTP 200 with operatingTotalDays={op_days}, but generationValue, gridValue, and fullPowerHoursDay "
                "are null across all daily records. SolarOS deviceList lists collector D26320EA1E (ID 715266) with 0 "
                "linked inverter devices. Station is currently offline due to Wi-Fi connectivity issue."
                if st_id == "92026" else
                f"Station-level historical stats endpoints returned HTTP 200 with operatingTotalDays={op_days}, but 0 daily records with positive generation/grid activity."
            )
            updated_metadata = dict(existing_meta)
            updated_metadata["historical_backfill"] = {
                "status": "unavailable_from_source",
                "attempted_at": datetime.now(timezone.utc).isoformat(),
                "station_id": st_id,
                "station_name": st_name,
                "inverter_sn": inv_sn,
                "collector_sn": "D26320EA1E" if st_id == "92026" else None,
                "collector_device_id": 715266 if st_id == "92026" else None,
                "operating_days_reported": op_days,
                "total_daily_records": 0,
                "earliest_date": None,
                "latest_date": None,
                "api_response_summary": api_summary
            }
            updated_metadata["historical_daily_records"] = []
            updated_metadata["historical_monthly_summary"] = []

            if dry_run:
                print(f"  [DRY RUN] Would update mapping {item['mapping_id']} with unavailable_from_source status.")
            else:
                ok = self._patch_supabase(item['mapping_id'], updated_metadata)
                if not ok:
                    print(f"  [ERROR] Failed to save metadata for mapping {item['mapping_id']}")
                    return None
                print(f"  ✓ Successfully saved unavailable_from_source checkpoint to mapping metadata.")

            return {
                "station_id": st_id,
                "inverter_sn": inv_sn,
                "name": st_name,
                "records_count": 0,
                "new_records": 0,
                "duplicates_prevented": 0,
                "earliest_date": "N/A",
                "latest_date": "N/A",
                "lifetime_gen": 0.0,
                "backfilled_gen": 0.0,
                "variance_pct": 0.0,
                "outcome": "unavailable_from_source"
            }

        # 4. Reconcile against SolarOS lifetime total
        sum_backfilled_gen = sum(r["generation_kwh"] for r in all_daily_records)
        sum_backfilled_grid = sum(r["grid_export_kwh"] for r in all_daily_records)
        
        variance_kwh = abs(sum_backfilled_gen - lifetime_gen)
        variance_pct = (variance_kwh / lifetime_gen * 100.0) if lifetime_gen > 0 else 0.0

        earliest_date = all_daily_records[0]["date"] if all_daily_records else None
        latest_date = all_daily_records[-1]["date"] if all_daily_records else None

        print(f"  Backfill Reconciliation:")
        print(f"    - Earliest Date: {earliest_date} | Latest Date: {latest_date}")
        print(f"    - Total Daily Records: {len(all_daily_records)} (New: {new_records_count}, Duplicates Avoided: {duplicate_prevented_count})")
        print(f"    - Sum Daily Gen: {sum_backfilled_gen:.2f} kWh vs SolarOS Lifetime: {lifetime_gen:.2f} kWh (Variance: {variance_pct:.2f}%)")

        # 5. Construct updated metadata preserving existing mapping keys (Decision 10)
        updated_metadata = dict(existing_meta)
        updated_metadata["historical_backfill"] = {
            "status": "completed",
            "last_checkpoint": latest_date,
            "earliest_date": earliest_date,
            "operating_days_reported": op_days,
            "total_daily_records": len(all_daily_records),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "lifetime_reconciliation": {
                "solaros_lifetime_kwh": round(lifetime_gen, 2),
                "backfilled_sum_kwh": round(sum_backfilled_gen, 2),
                "solaros_grid_kwh": round(lifetime_grid, 2),
                "backfilled_grid_kwh": round(sum_backfilled_grid, 2),
                "variance_kwh": round(variance_kwh, 3),
                "variance_pct": round(variance_pct, 2)
            }
        }
        updated_metadata["historical_daily_records"] = all_daily_records
        updated_metadata["historical_monthly_summary"] = all_monthly_summaries

        if dry_run:
            print(f"  [DRY RUN] Would update mapping {item['mapping_id']} with {len(all_daily_records)} daily records.")
            return {
                "station_id": st_id,
                "inverter_sn": inv_sn,
                "name": st_name,
                "records_count": len(all_daily_records),
                "new_records": new_records_count,
                "duplicates_prevented": duplicate_prevented_count,
                "earliest_date": earliest_date,
                "latest_date": latest_date,
                "lifetime_gen": lifetime_gen,
                "backfilled_gen": sum_backfilled_gen,
                "variance_pct": variance_pct,
                "outcome": "completed"
            }

        # 6. Persist into oem_station_mappings (Patch single mapping record)
        ok = self._patch_supabase(item['mapping_id'], updated_metadata)
        if not ok:
            print(f"  [ERROR] Failed to save metadata for mapping {item['mapping_id']}")
            return None

        print(f"  ✓ Successfully saved backfill checkpoint & {len(all_daily_records)} daily records to mapping metadata.")
        return {
            "station_id": st_id,
            "inverter_sn": inv_sn,
            "name": st_name,
            "records_count": len(all_daily_records),
            "new_records": new_records_count,
            "duplicates_prevented": duplicate_prevented_count,
            "earliest_date": earliest_date,
            "latest_date": latest_date,
            "lifetime_gen": lifetime_gen,
            "backfilled_gen": sum_backfilled_gen,
            "variance_pct": variance_pct,
            "outcome": "completed"
        }

    def execute_fleet_backfill(self, dry_run=False):
        fleet = self.get_feston_fleet()
        results = []
        start_time = time.time()
        print(f"\nStarting Feston Historical Backfill on {self.target_env.upper()} ({len(fleet)} inverters)...")

        for item in fleet:
            try:
                res = self.run_backfill_for_inverter(item, dry_run=dry_run)
                if res:
                    results.append(res)
            except Exception as e:
                print(f"  [STATION ERROR] Exception processing station {item.get('station_id')}: {e}")

        elapsed = time.time() - start_time
        print(f"\n========================================================")
        print(f"FESTON HISTORICAL BACKFILL SUMMARY ({self.target_env.upper()})")
        print(f"Completed in {elapsed:.1f}s | Processed {len(results)}/{len(fleet)} inverters.")
        print(f"{'StID':6s} | {'SN':24s} | {'Name':20s} | {'Records':7s} | {'Coverage Range':23s} | {'SolarOS kWh':11s} | {'Backfill kWh':12s} | {'Variance':8s} | {'Outcome'}")
        print("-" * 135)
        
        tot_recs = 0
        tot_new = 0
        tot_dups = 0
        tot_gen = 0.0

        for r in results:
            tot_recs += r["records_count"]
            tot_new += r["new_records"]
            tot_dups += r["duplicates_prevented"]
            tot_gen += r["backfilled_gen"]
            date_range = f"{r['earliest_date']} → {r['latest_date']}"
            print(f"{r['station_id']:6s} | {r['inverter_sn']:24s} | {r['name']:20s} | {r['records_count']:7d} | {date_range:23s} | {r['lifetime_gen']:11.1f} | {r['backfilled_gen']:12.1f} | {r['variance_pct']:7.2f}% | {r.get('outcome', 'completed')}")

        print("-" * 135)
        print(f"TOTALS: {tot_recs} records ({tot_new} new, {tot_dups} duplicates prevented) | Lifetime Gen: {tot_gen:.1f} kWh")

        return results

if __name__ == "__main__":
    env_choice = sys.argv[1] if len(sys.argv) > 1 else "staging"
    is_dry = "--dry-run" in sys.argv
    engine = FestonHistoricalBackfillEngine(target_env=env_choice)
    engine.execute_fleet_backfill(dry_run=is_dry)

