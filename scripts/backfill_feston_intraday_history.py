#!/usr/bin/env python3
"""
Solar Assist: Feston / SolarOS Intraday 1-Minute Historical Backfill Engine
Ingests full 1-minute resolution string and inverter telemetry into Supabase.

Key features:
- Pacing (0.85s - 1.0s) & exponential backoff on 429/500.
- Date-level pre-clearing for absolute idempotency and partial-batch recovery.
- Resumable checkpointing in oem_station_mappings.metadata -> 'intraday_backfill'.
- Full preservation of existing daily historical records and live telemetry state.
"""

import os
import sys
import time
import json
import logging
import argparse
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional
import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("feston_intraday_backfill")


def load_env(env_path: str) -> Dict[str, str]:
    env = {}
    if not os.path.exists(env_path):
        raise FileNotFoundError(f"Environment file not found: {env_path}")
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip("\"'\''")
    return env


class SolarOSClient:
    def __init__(self, token: str, base_url: str = "https://india.solaros.com"):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.headers = {
            "Authorization": f"Bearer {token}",
            "platform": "Web",
            "system": "SolarOS",
            "language": "en",
            "Content-Type": "application/json"
        }

    def get_device_stats_day(self, device_id: int, date_str: str, max_retries: int = 5) -> Optional[List[Dict[str, Any]]]:
        """
        Retrieves 1-minute intraday statistics for a device on date_str (YYYY/MM/DD).
        """
        day_param = date_str.replace("-", "/")
        url = f"{self.base_url}/device-s/device/{device_id}/stats/day"
        params = {"day": day_param, "lan": "en"}

        for attempt in range(max_retries):
            try:
                time.sleep(0.85)  # Safe API pacing
                r = requests.get(url, headers=self.headers, params=params, timeout=15)
                if r.status_code == 200:
                    return r.json()
                elif r.status_code == 429:
                    backoff = 2 ** (attempt + 1)
                    logger.warning(f"HTTP 429 Rate limited on device {device_id} date {date_str}. Backing off {backoff}s...")
                    time.sleep(backoff)
                elif r.status_code in (500, 502, 503, 504):
                    backoff = 2 ** (attempt + 1)
                    logger.warning(f"HTTP {r.status_code} server error on device {device_id} date {date_str}. Backing off {backoff}s...")
                    time.sleep(backoff)
                else:
                    logger.error(f"HTTP {r.status_code} for device {device_id} on {date_str}: {r.text[:200]}")
                    return None
            except Exception as e:
                backoff = 2 ** (attempt + 1)
                logger.warning(f"Request exception on device {device_id} date {date_str}: {e}. Retrying in {backoff}s...")
                time.sleep(backoff)
        logger.error(f"Failed to fetch stats for device {device_id} on {date_str} after {max_retries} retries.")
        return None


class SupabaseBackfillManager:
    def __init__(self, url: str, service_role_key: str):
        self.url = url.rstrip("/")
        self.key = service_role_key
        self.headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json"
        }

    def get_feston_fleet(self) -> List[Dict[str, Any]]:
        """
        Retrieves all Feston station mappings, inverters, and strings from Supabase.
        """
        # 1. Fetch mappings
        r_map = requests.get(
            f"{self.url}/rest/v1/oem_station_mappings?oem=eq.feston&select=id,site_id,external_station_id,station_name,metadata",
            headers=self.headers
        )
        r_map.raise_for_status()
        mappings = r_map.json()

        # 2. Fetch inverters
        r_inv = requests.get(
            f"{self.url}/rest/v1/inverters?oem=eq.feston&select=id,site_id,serial_number,oem_device_id,capacity_kw,string_count",
            headers=self.headers
        )
        r_inv.raise_for_status()
        inv_by_site = {i["site_id"]: i for i in r_inv.json()}
        inv_ids = [i["id"] for i in r_inv.json()]

        # 3. Fetch strings for Feston inverters
        strs_by_inv: Dict[str, Dict[int, str]] = {}
        if inv_ids:
            r_str = requests.get(
                f"{self.url}/rest/v1/strings?inverter_id=in.({','.join(inv_ids)})&select=id,inverter_id,string_index,capacity_kw",
                headers=self.headers
            )
            r_str.raise_for_status()
            for s in r_str.json():
                strs_by_inv.setdefault(s["inverter_id"], {})[s["string_index"]] = s["id"]

        fleet = []
        for m in sorted(mappings, key=lambda x: int(x["external_station_id"])):
            st_id = m["external_station_id"]
            site_id = m["site_id"]
            inv = inv_by_site.get(site_id)
            inv_id = inv["id"] if inv else None
            string_map = strs_by_inv.get(inv_id, {}) if inv_id else {}

            fleet.append({
                "mapping_id": m["id"],
                "station_id": st_id,
                "station_name": m["station_name"],
                "site_id": site_id,
                "inverter_id": inv_id,
                "oem_device_id": int(inv["oem_device_id"]) if inv and inv.get("oem_device_id") and inv["oem_device_id"] != "None" else None,
                "serial_number": inv.get("serial_number") if inv else None,
                "capacity_kw": float(inv.get("capacity_kw", 0)) if inv else 0,
                "string_map": string_map,
                "metadata": m.get("metadata", {})
            })
        return fleet

    def clear_day_range(self, inverter_id: str, string_ids: List[str], date_str: str, max_retries: int = 5) -> None:
        """
        Pre-cleans any existing records for a day before inserting a new full batch.
        Guarantees partial-batch recovery and zero duplicate rows on interruption or re-run.
        """
        start_ts = f"{date_str}T00:00:00.000Z"
        end_ts = f"{date_str}T23:59:59.999Z"

        for attempt in range(max_retries):
            try:
                # 1. Delete string_telemetry for this day's strings
                for s_id in string_ids:
                    requests.delete(
                        f"{self.url}/rest/v1/string_telemetry?string_id=eq.{s_id}&timestamp=gte.{start_ts}&timestamp=lte.{end_ts}",
                        headers=self.headers,
                        timeout=30
                    )

                # 2. Delete telemetry for this day's inverter
                requests.delete(
                    f"{self.url}/rest/v1/telemetry?inverter_id=eq.{inverter_id}&timestamp=gte.{start_ts}&timestamp=lte.{end_ts}",
                    headers=self.headers,
                    timeout=30
                )
                return
            except Exception as e:
                if attempt == max_retries - 1:
                    logger.warning(f"clear_day_range failed after {max_retries} retries: {e}")
                    return
                time.sleep(2 ** (attempt + 1))

    def insert_batch(self, table: str, records: List[Dict[str, Any]], chunk_size: int = 500, max_retries: int = 5) -> int:
        """
        Inserts records in chunks using standard PostgREST endpoint with retry backoff.
        """
        total = 0
        for i in range(0, len(records), chunk_size):
            chunk = records[i:i + chunk_size]
            for attempt in range(max_retries):
                try:
                    r = requests.post(
                        f"{self.url}/rest/v1/{table}",
                        headers=self.headers,
                        json=chunk,
                        timeout=30
                    )
                    if r.status_code in (200, 201):
                        break
                    else:
                        raise RuntimeError(f"Failed to insert chunk into {table} (HTTP {r.status_code}): {r.text[:300]}")
                except Exception as e:
                    if attempt == max_retries - 1:
                        raise
                    backoff = 2 ** (attempt + 1)
                    logger.warning(f"insert_batch into {table} failed: {e}. Retrying in {backoff}s...")
                    time.sleep(backoff)
            total += len(chunk)
        return total

    def update_mapping_checkpoint(self, mapping_id: str, metadata: Dict[str, Any], max_retries: int = 5) -> None:
        """
        Updates metadata on oem_station_mappings, preserving all existing daily records with retry backoff.
        """
        for attempt in range(max_retries):
            try:
                r = requests.patch(
                    f"{self.url}/rest/v1/oem_station_mappings?id=eq.{mapping_id}",
                    headers=self.headers,
                    json={"metadata": metadata, "updated_at": datetime.now(timezone.utc).isoformat()},
                    timeout=30
                )
                r.raise_for_status()
                return
            except Exception as e:
                if attempt == max_retries - 1:
                    raise
                time.sleep(2 ** (attempt + 1))


def parse_day_stats(
    raw_data: List[Dict[str, Any]],
    inverter_id: str,
    string_map: Dict[int, str]
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Parses SolarOS 123-metric response into inverter telemetry and string telemetry records.
    Preserves exact collection timestamps and raw values.
    """
    metric_map: Dict[str, Dict[int, float]] = {}
    for m in raw_data:
        s_name = m.get("storageName")
        if not s_name:
            continue
        pts = m.get("detailList", [])
        metric_map[s_name] = {p["collectionTime"]: float(p["value"]) for p in pts}

    # Find all timestamps where the inverter was recording
    all_timestamps = set()
    for s_name, pts in metric_map.items():
        if s_name in ("DP1", "DV1", "DC1", "APo_t1", "Et_ge0", "PG_Pt1"):
            all_timestamps.update(pts.keys())

    sorted_times = sorted(all_timestamps)
    tel_records = []
    str_records = []

    for t in sorted_times:
        iso_ts = datetime.fromtimestamp(t, tz=timezone.utc).isoformat()

        # 1. String metrics (PV1 is primary; check PV1..PV8)
        for s_idx in range(1, 9):
            s_id = string_map.get(s_idx)
            if not s_id:
                continue

            dv_key = f"DV{s_idx}"
            dc_key = f"DC{s_idx}"
            dp_key = f"DP{s_idx}"

            v = metric_map.get(dv_key, {}).get(t)
            c = metric_map.get(dc_key, {}).get(t)
            p = metric_map.get(dp_key, {}).get(t)

            # Skip string record if no data for this string at this time
            if v is None and c is None and p is None:
                continue

            v_val = round(v, 2) if v is not None else 0.0
            c_val = round(c, 2) if c is not None else 0.0
            p_kw = round(p / 1000.0, 4) if p is not None else round((v_val * c_val) / 1000.0, 4)

            str_records.append({
                "string_id": s_id,
                "timestamp": iso_ts,
                "voltage_v": v_val,
                "current_a": c_val,
                "power_kw": p_kw,
                "status": "ok"
            })

        # 2. Inverter telemetry
        apo = metric_map.get("APo_t1", {}).get(t, 0.0)
        ac_power_kw = round(apo / 1000.0, 3) if apo > 0 else 0.0

        # Sum DC power across all strings
        dc_w = 0.0
        for s_idx in range(1, 9):
            dc_w += metric_map.get(f"DP{s_idx}", {}).get(t, 0.0)
        dc_power_kw = round(dc_w / 1000.0, 3)

        et0 = metric_map.get("Et_ge0", {}).get(t)
        energy_kwh = round(et0, 3) if et0 is not None else 0.0

        et_dy = metric_map.get("Etdy_ge1", {}).get(t)
        daily_gen_kwh = round(et_dy, 2) if et_dy is not None else None

        # Temperature resolution (T_AC_RDT1 preferred, then IGBT_T1, then ENV_T0)
        temp_c = None
        for t_key in ("T_AC_RDT1", "IGBT_T1", "ENV_T0"):
            t_val = metric_map.get(t_key, {}).get(t)
            if t_val is not None and -40 <= t_val <= 120:
                temp_c = round(t_val, 1)
                break

        # Efficiency
        eff = 0.0
        if dc_power_kw > 0.05 and ac_power_kw > 0.0:
            eff = min(100.0, round((ac_power_kw / dc_power_kw) * 100.0, 2))

        is_online = (ac_power_kw > 0.0 or dc_power_kw > 0.0)

        tel_records.append({
            "inverter_id": inverter_id,
            "timestamp": iso_ts,
            "ac_power_kw": ac_power_kw,
            "dc_power_kw": dc_power_kw,
            "energy_kwh": energy_kwh,
            "efficiency_pct": eff,
            "temperature_c": temp_c,
            "daily_generation_kwh": daily_gen_kwh,
            "total_generation_kwh": energy_kwh,
            "online_status": is_online,
            "last_update": datetime.now(timezone.utc).isoformat()
        })

    return tel_records, str_records


def run_intraday_backfill(
    env_file: str,
    target_station: Optional[str] = None,
    limit_days: Optional[int] = None,
    force_all: bool = False
):
    env = load_env(env_file)
    supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    solaros_token = env.get("SOLAROS_ACCESS_TOKEN")

    if not supabase_url or not supabase_key or not solaros_token:
        raise ValueError("Missing SUPABASE_URL, SERVICE_ROLE_KEY, or SOLAROS_ACCESS_TOKEN in env.")

    logger.info(f"Target Supabase URL: {supabase_url}")
    client = SolarOSClient(token=solaros_token)
    db = SupabaseBackfillManager(url=supabase_url, service_role_key=supabase_key)

    fleet = db.get_feston_fleet()
    logger.info(f"Loaded {len(fleet)} Feston stations from database.")

    total_fleet_str_inserted = 0
    total_fleet_tel_inserted = 0
    summary_results = []

    for station in fleet:
        st_id = station["station_id"]
        dev_id = station["oem_device_id"]
        inv_id = station["inverter_id"]
        name = station["station_name"]
        meta = station["metadata"]

        if target_station and str(st_id) != str(target_station):
            continue

        if not dev_id or not inv_id:
            logger.warning(f"Station {st_id} ({name}) has no active inverter/device. Skipping.")
            continue

        # Get existing daily records to know which dates to backfill
        daily_records = meta.get("historical_daily_records", [])
        if not daily_records:
            logger.warning(f"Station {st_id} ({name}) has no daily records in metadata. Skipping.")
            continue

        # Check existing intraday backfill status
        intraday_meta = meta.get("intraday_backfill", {})
        completed_dates = set(intraday_meta.get("completed_dates", [])) if not force_all else set()

        sorted_dates = [r["date"] for r in daily_records if r.get("date")]
        if limit_days:
            sorted_dates = sorted_dates[:limit_days]

        logger.info(f"=== PROCESSING STATION {st_id} ({name}) | Inverter: {inv_id} | Device: {dev_id} ===")
        logger.info(f"Dates to process: {len(sorted_dates)} (Already completed: {len(completed_dates)})")

        st_str_inserted = intraday_meta.get("total_string_records", 0) if not force_all else 0
        st_tel_inserted = intraday_meta.get("total_telemetry_records", 0) if not force_all else 0
        string_ids = list(station["string_map"].values())

        for d_str in sorted_dates:
            if d_str in completed_dates:
                logger.info(f"  Station {st_id} date {d_str} already completed. Skipping.")
                continue

            logger.info(f"  Fetching 1-min data for Station {st_id} on {d_str}...")
            raw_stats = client.get_device_stats_day(dev_id, d_str)
            if raw_stats is None:
                logger.error(f"  Failed to fetch data for Station {st_id} date {d_str}. Skipping date.")
                continue

            tel_batch, str_batch = parse_day_stats(raw_stats, inv_id, station["string_map"])

            if not tel_batch and not str_batch:
                logger.info(f"  No daylight readings for Station {st_id} on {d_str} (inverter idle). Marking date completed.")
                completed_dates.add(d_str)
                # Save checkpoint
                intraday_meta["completed_dates"] = sorted(list(completed_dates))
                intraday_meta["last_checkpoint"] = d_str
                intraday_meta["updated_at"] = datetime.now(timezone.utc).isoformat()
                meta["intraday_backfill"] = intraday_meta
                db.update_mapping_checkpoint(station["mapping_id"], meta)
                continue

            # 1. Partial-batch recovery & duplicate prevention: Clear existing records for this day
            db.clear_day_range(inv_id, string_ids, d_str)

            # 2. Insert telemetry batch
            tel_count = db.insert_batch("telemetry", tel_batch)

            # 3. Insert string_telemetry batch
            str_count = db.insert_batch("string_telemetry", str_batch)

            st_tel_inserted += tel_count
            st_str_inserted += str_count
            total_fleet_tel_inserted += tel_count
            total_fleet_str_inserted += str_count

            logger.info(f"  ✓ {d_str}: Inserted {tel_count} inverter telemetry points, {str_count} string telemetry points.")

            # 4. Checkpoint date
            completed_dates.add(d_str)
            intraday_meta = {
                "status": "in_progress",
                "resolution": "1_minute",
                "completed_dates": sorted(list(completed_dates)),
                "total_string_records": st_str_inserted,
                "total_telemetry_records": st_tel_inserted,
                "last_checkpoint": d_str,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            meta["intraday_backfill"] = intraday_meta
            db.update_mapping_checkpoint(station["mapping_id"], meta)

        # Mark station completed if all dates done
        if len(completed_dates) >= len(sorted_dates):
            intraday_meta["status"] = "completed"
            meta["intraday_backfill"] = intraday_meta
            db.update_mapping_checkpoint(station["mapping_id"], meta)
            logger.info(f"=== COMPLETED STATION {st_id} ({name}): Total Str={st_str_inserted}, Total Tel={st_tel_inserted} ===")

        summary_results.append({
            "station_id": st_id,
            "name": name,
            "device_id": dev_id,
            "completed_dates": len(completed_dates),
            "total_dates": len(sorted_dates),
            "string_records": st_str_inserted,
            "telemetry_records": st_tel_inserted
        })

    logger.info("==================================================")
    logger.info("INTRADAY HISTORICAL BACKFILL EXECUTION SUMMARY")
    logger.info("==================================================")
    logger.info(f"Total String Telemetry Inserted: {total_fleet_str_inserted}")
    logger.info(f"Total Inverter Telemetry Inserted: {total_fleet_tel_inserted}")
    for res in summary_results:
        logger.info(f"Station {res['station_id']:8s} ({res['name']:20s}): {res['completed_dates']}/{res['total_dates']} dates | Str: {res['string_records']} | Tel: {res['telemetry_records']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Solar Assist Feston Intraday 1-Minute Backfill")
    parser.add_argument("--env-file", default="backend/.env", help="Path to env file (default: backend/.env for staging)")
    parser.add_argument("--station", default=None, help="Specific station ID to backfill")
    parser.add_argument("--limit-days", type=int, default=None, help="Limit number of days to process per inverter")
    parser.add_argument("--force-all", action="store_true", help="Force re-run even if already marked completed")
    args = parser.parse_args()

    run_intraday_backfill(
        env_file=args.env_file,
        target_station=args.station,
        limit_days=args.limit_days,
        force_all=args.force_all
    )

