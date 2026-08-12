import os
import time
import logging
import threading
from datetime import datetime, timezone
from typing import Set
import requests

from adapters.solis import SolisAdapter
from adapters.base import OemAdapter
from alarm_mappings import translate_alert

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("sync_service")

# --- SETTINGS ---
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "https://ylnmjvgnjootrkywbcsj.supabase.co"
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def get_supabase_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }

def supabase_get(table: str, params: dict = None) -> list:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = get_supabase_headers()
    response = requests.get(url, headers=headers, params=params, timeout=25)
    response.raise_for_status()
    return response.json()

def supabase_post(table: str, data: list, headers_override: dict = None) -> list:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = get_supabase_headers()
    if headers_override:
        headers.update(headers_override)
    response = requests.post(url, headers=headers, json=data, timeout=25)
    response.raise_for_status()
    return response.json() if response.content else []

def supabase_patch(table: str, data: dict, params: dict = None) -> list:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = get_supabase_headers()
    response = requests.patch(url, headers=headers, json=data, params=params, timeout=25)
    response.raise_for_status()
    return response.json() if response.content else []

def supabase_delete(table: str, params: dict = None) -> list:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = get_supabase_headers()
    response = requests.delete(url, headers=headers, params=params, timeout=25)
    response.raise_for_status()
    return response.json() if response.content else []

def get_adapter_for_integration(integ: dict) -> OemAdapter:
    provider = integ.get("provider")
    config = integ.get("config", {})
    
    # Grab adapter-specific settings or fall back to system envs
    if provider == "solis":
        key_id = config.get("solis_key_id") or os.getenv("SOLIS_KEY_ID") or "1300386381678106385"
        key_secret = config.get("solis_key_secret") or os.getenv("SOLIS_KEY_SECRET") or "a21fcc244b2f4fe48097ceca92a1c160"
        api_url = config.get("solis_api_url") or os.getenv("SOLIS_API_URL") or "https://www.soliscloud.com:13333"
        return SolisAdapter(key_id=key_id, key_secret=key_secret, api_url=api_url)
    else:
        raise ValueError(f"Unsupported provider: {provider}")

sync_lock = threading.Lock()

def poll_and_sync_all(trigger_source: str = "manual"):
    """Polls all active OEM integrations, normalizes data, and cleans up demo data safely."""
    started_at = datetime.now(timezone.utc)
    
    if not sync_lock.acquire(blocking=False):
        logger.warning("Another sync session is already in progress. Logging skipped cycle.")
        try:
            sync_run_payload = {
                "status": "failed",
                "oem": "solis",
                "trigger_source": trigger_source,
                "started_at": started_at.isoformat(),
                "completed_at": started_at.isoformat(),
                "error_message": "Skipped: Another synchronization run was already in progress.",
                "duration_seconds": 0.0,
                "error_count": 1
            }
            supabase_post("sync_runs", [sync_run_payload])
        except Exception as e:
            logger.error(f"Failed to log skipped sync run: {e}")
        return
        
    sync_run_id = None
    telemetry_inserted_count = 0
    string_telemetry_inserted_count = 0
    alerts_processed_count = 0
    error_count = 0
    stations_fetched_count = 0
    sites_upserted_count = 0
    inverters_linked_count = 0
    
    try:
        logger.info("Starting sync and data normalization cycle...")
        
        if not SUPABASE_KEY:
            logger.error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set. Cannot run sync.")
            return
            
        # Create sync_run record in DB
        try:
            sync_run_payload = {
                "status": "running",
                "oem": "solis",
                "trigger_source": trigger_source,
                "started_at": started_at.isoformat(),
                "sites_processed": 0,
                "inverters_processed": 0,
                "telemetry_records": 0,
                "string_records": 0,
                "alerts_processed": 0,
                "error_count": 0
            }
            sync_run_res = supabase_post("sync_runs", [sync_run_payload], headers_override={"Prefer": "return=representation"})
            if sync_run_res:
                sync_run_id = sync_run_res[0]["id"]
                logger.info(f"Initialized sync_runs tracking record with ID: {sync_run_id}")
        except Exception as e:
            logger.error(f"Failed to initialize sync_runs record: {e}")
            error_count += 1
            
        # 1. Fetch active OEM configurations
        integrations = supabase_get("oem_integrations", params={"is_active": "eq.true"})
        logger.info(f"Found {len(integrations)} active OEM integration(s)")
        
        # Active mapped site IDs across all integrations to keep after cleanup
        active_mapped_site_ids: Set[str] = set()
        
        for integ in integrations:
            provider = integ.get("provider")
            org_id = integ.get("org_id")
            config = integ.get("config", {})
            plants_mapping = config.get("plants", [])
            
            logger.info(f"Running adapter sync for {provider} (Integration: {integ['id']})")
            
            try:
                adapter = get_adapter_for_integration(integ)
            except Exception as e:
                logger.error(f"Failed to load adapter for provider {provider}: {e}")
                error_count += 1
                continue
                
            # 2. Get list of solar stations from API
            try:
                stations = adapter.list_stations()
                stations_fetched_count += len(stations)
                logger.info(f"Adapter returned {len(stations)} station(s) for {provider}")
            except Exception as e:
                logger.error(f"Failed to list stations for provider {provider}: {e}")
                error_count += 1
                continue
            
            # Map to translate plant_id to site_id during the iteration
            updated_plants_mapping = []
            
            for station in stations:
                plant_id = station.plant_id
                
                try:
                    # Check mapping
                    mapped_site_id = None
                    for pm in plants_mapping:
                        if str(pm.get("plant_id")) == str(plant_id):
                            mapped_site_id = pm.get("site_id")
                            break
                            
                    # Validate if the mapped site exists and has the correct name
                    is_valid_mapped_site = False
                    if mapped_site_id:
                        try:
                            site_data = supabase_get("sites", params={"id": f"eq.{mapped_site_id}"})
                            if site_data and site_data[0].get("name") == station.name:
                                is_valid_mapped_site = True
                        except Exception as e:
                            logger.error(f"Error checking site {mapped_site_id}: {e}")
                            mapped_site_id = None
                    
                    # If not valid or mapped, look up by name in sites table to prevent duplicate names
                    if not is_valid_mapped_site:
                        try:
                            existing_sites = supabase_get("sites", params={"name": f"eq.{station.name}"})
                            if existing_sites:
                                mapped_site_id = existing_sites[0]["id"]
                                is_valid_mapped_site = True
                        except Exception as e:
                            logger.error(f"Error searching site by name {station.name}: {e}")
                    
                    # Populate common site model fields
                    site_fields = {
                        "org_id": org_id,
                        "name": station.name,
                        "location": station.location,
                        "latitude": float(station.location != "Unknown" and 19.0 or 0.0),
                        "longitude": float(station.location != "Unknown" and 73.0 or 0.0),
                        "capacity_kwp": station.capacity_kwp,
                        "status": "active",
                        "timezone": station.timezone
                    }
                    
                    if is_valid_mapped_site:
                        # Update
                        supabase_patch("sites", site_fields, params={"id": f"eq.{mapped_site_id}"})
                        site_id = mapped_site_id
                        logger.info(f"Updated Site ID: {site_id} for Station '{station.name}'")
                    else:
                        # Create
                        res_site = supabase_post("sites", [site_fields], headers_override={"Prefer": "return=representation"})
                        site_id = res_site[0]["id"]
                        sites_upserted_count += 1
                        logger.info(f"Created Site ID: {site_id} for Station '{station.name}'")
                        
                    active_mapped_site_ids.add(site_id)
                    updated_plants_mapping.append({"plant_id": str(plant_id), "site_id": site_id})
                    
                    # 3. Sync Inverters under this Site
                    devices = adapter.list_devices(plant_id)
                    serial_to_inv_id_map = {}
                    
                    for dev in devices:
                        try:
                            # Check if inverter exists in DB
                            db_inverters = supabase_get("inverters", params={
                                "oem": f"eq.{provider}",
                                "oem_device_id": f"eq.{dev.oem_device_id}"
                            })
                            
                            inv_fields = {
                                "site_id": site_id,
                                "model": dev.model,
                                "serial_number": dev.serial_number,
                                "capacity_kw": dev.capacity_kw,
                                "string_count": dev.string_count,
                                "status": dev.status,
                                "last_seen_at": dev.last_seen_at
                            }
                            
                            if db_inverters:
                                inv_id = db_inverters[0]["id"]
                                supabase_patch("inverters", inv_fields, params={"id": f"eq.{inv_id}"})
                                logger.info(f"Updated Inverter ID: {inv_id} under Site {site_id}")
                            else:
                                inv_fields.update({
                                    "oem": provider,
                                    "oem_device_id": dev.oem_device_id,
                                    "installed_on": datetime.now(timezone.utc).date().isoformat()
                                })
                                res_inv = supabase_post("inverters", [inv_fields], headers_override={"Prefer": "return=representation"})
                                inv_id = res_inv[0]["id"]
                                logger.info(f"Created Inverter ID: {inv_id} under Site {site_id}")
                                
                            inverters_linked_count += 1
                            serial_to_inv_id_map[dev.serial_number] = inv_id
                            
                            # 4. Sync Telemetry and String Telemetry
                            telemetry, string_telemetries = adapter.fetch_telemetry(dev.oem_device_id)
                            
                            if telemetry:
                                # Prevent duplicates check
                                existing_telemetry = supabase_get("telemetry", params={
                                    "inverter_id": f"eq.{inv_id}",
                                    "timestamp": f"eq.{telemetry.timestamp}"
                                })
                                if not existing_telemetry:
                                    supabase_post("telemetry", [{
                                        "inverter_id": inv_id,
                                        "timestamp": telemetry.timestamp,
                                        "ac_power_kw": telemetry.ac_power_kw,
                                        "dc_power_kw": telemetry.dc_power_kw,
                                        "energy_kwh": telemetry.energy_kwh,
                                        "efficiency_pct": telemetry.efficiency_pct,
                                        "temperature_c": telemetry.temperature_c,
                                        "daily_generation_kwh": telemetry.daily_generation_kwh,
                                        "total_generation_kwh": telemetry.total_generation_kwh,
                                        "specific_yield": telemetry.specific_yield,
                                        "online_status": telemetry.online_status,
                                        "last_update": telemetry.last_update,
                                        "frequency_hz": telemetry.frequency_hz,
                                        "reactive_power_kvar": telemetry.reactive_power_kvar,
                                        "power_factor": telemetry.power_factor,
                                        "current_r_a": telemetry.current_r_a,
                                        "current_s_a": telemetry.current_s_a,
                                        "current_t_a": telemetry.current_t_a,
                                        "voltage_r_v": telemetry.voltage_r_v,
                                        "voltage_s_v": telemetry.voltage_s_v,
                                        "voltage_t_v": telemetry.voltage_t_v,
                                        "apparent_power_kva": telemetry.apparent_power_kva,
                                        "battery_soc_pct": telemetry.battery_soc_pct,
                                        "battery_soh_pct": telemetry.battery_soh_pct,
                                        "battery_power_kw": telemetry.battery_power_kw,
                                        "battery_voltage_v": telemetry.battery_voltage_v,
                                        "battery_current_a": telemetry.battery_current_a,
                                        "load_power_kw": telemetry.load_power_kw,
                                        "grid_purchased_today_kwh": telemetry.grid_purchased_today_kwh,
                                        "grid_sell_today_kwh": telemetry.grid_sell_today_kwh,
                                        "load_today_kwh": telemetry.load_today_kwh,
                                        "metrics": telemetry.metrics
                                    }])
                                    telemetry_inserted_count += 1
                                    logger.info(f"Logged Telemetry for Inverter {inv_id}")
                                else:
                                    logger.info(f"Telemetry for Inverter {inv_id} already exists. Skipping.")
                                    
                            # Strings lookup and creation
                            existing_strings = supabase_get("strings", params={"inverter_id": f"eq.{inv_id}"})
                            string_map = {s["string_index"]: s["id"] for s in existing_strings}
                            
                            # String Telemetry sync (100% Dynamic & Safe Pruning)
                            for st in string_telemetries:
                                string_id = string_map.get(st.string_index)
                                
                                # A string channel is active if it generates voltage or current
                                is_active = (st.voltage_v > 0.0 or st.current_a > 0.0)
                                
                                # Prune legacy placeholder strings if daytime active generation is running but this string is 0
                                if not is_active and string_id and telemetry and telemetry.ac_power_kw > 1.0:
                                    supabase_delete("strings", params={"id": f"eq.{string_id}"})
                                    string_map.pop(st.string_index, None)
                                    logger.info(f"Safely pruned legacy placeholder string Index {st.string_index} for Inverter {inv_id}")
                                    continue
                                    
                                # If unconnected and not in DB, skip completely (prevents fake channels)
                                if not is_active and not string_id:
                                    continue
                                    
                                # If active but not in DB, create it dynamically
                                if not string_id:
                                    string_cap = round(dev.capacity_kw / (dev.string_count or 8), 2) if (dev.string_count or 8) > 0 else 0.0
                                    res_str = supabase_post("strings", [{
                                        "inverter_id": inv_id,
                                        "string_index": st.string_index,
                                        "modules_count": 20,
                                        "capacity_kw": string_cap,
                                        "status": "ok"
                                    }], headers_override={"Prefer": "return=representation"})
                                    string_id = res_str[0]["id"]
                                    string_map[st.string_index] = string_id
                                    logger.info(f"Dynamically created physical String Index {st.string_index} for Inverter {inv_id}")
                                    
                                # Sync string telemetry
                                existing_str_tel = supabase_get("string_telemetry", params={
                                    "string_id": f"eq.{string_id}",
                                    "timestamp": f"eq.{telemetry.timestamp}"
                                })
                                if not existing_str_tel:
                                    supabase_post("string_telemetry", [{
                                        "string_id": string_id,
                                        "timestamp": telemetry.timestamp,
                                        "voltage_v": st.voltage_v,
                                        "current_a": st.current_a,
                                        "power_kw": st.power_kw,
                                        "status": st.status
                                    }])
                                    string_telemetry_inserted_count += 1
                                else:
                                    logger.info(f"String Telemetry for String {string_id} already exists. Skipping.")
                            
                            # Update dynamic string count in inverters table
                            dynamic_string_count = len(string_map)
                            supabase_patch("inverters", {"string_count": dynamic_string_count}, params={"id": f"eq.{inv_id}"})
                            
                            time.sleep(0.1) # Smooth pacing
                        except Exception as e:
                            logger.error(f"Error syncing inverter {dev.serial_number}: {e}", exc_info=True)
                            error_count += 1
                            
                    # 5. Sync Alerts for the plant
                    alerts = adapter.fetch_alerts(plant_id)
                    for alert in alerts:
                        try:
                            # Try parsing device SN from description
                            device_sn = None
                            if "(Device SN: " in alert.description:
                                device_sn = alert.description.split("(Device SN: ")[1].split(")")[0]
                                
                            inv_id = serial_to_inv_id_map.get(device_sn) if device_sn else None
                            
                            # Prevent duplicate check
                            params = {
                                "code": f"eq.{alert.code}",
                                "status": "eq.open",
                                "site_id": f"eq.{site_id}"
                            }
                            if inv_id:
                                params["inverter_id"] = f"eq.{inv_id}"
                                
                            existing_alerts = supabase_get("alerts", params=params)
                            if not existing_alerts:
                                translated = translate_alert(alert.oem, alert.alarm_code, alert.title)
                                supabase_post("alerts", [{
                                    "org_id": org_id,
                                    "site_id": site_id,
                                    "inverter_id": inv_id,
                                    "code": alert.code,
                                    "title": translated.get("title", alert.title),
                                    "description": alert.description + (f" - {translated.get('description')}" if translated.get('description') else ""),
                                    "severity": translated.get("severity", alert.severity),
                                    "status": "open",
                                    "triggered_at": alert.triggered_at,
                                    "oem": alert.oem,
                                    "alarm_code": alert.alarm_code,
                                    "category": translated.get("category", "inverter"),
                                    "is_auto_resolvable": translated.get("is_auto_resolvable", False),
                                    "requires_technician": translated.get("requires_technician", True),
                                    "recommended_action": translated.get("recommended_action", "")
                                }])
                                alerts_processed_count += 1
                                logger.info(f"Created alert for code {alert.code} under Site {site_id}")
                        except Exception as e:
                            logger.error(f"Error syncing alert code {alert.code} for station {station.name}: {e}", exc_info=True)
                            error_count += 1
                            
                except Exception as e:
                    logger.error(f"Error syncing station {station.name} (Plant {station.plant_id}): {e}", exc_info=True)
                    error_count += 1
            
            # 6. Update configuration plants mapping on Supabase
            try:
                supabase_patch("oem_integrations", {
                    "config": {"plants": updated_plants_mapping},
                    "last_sync_at": datetime.now(timezone.utc).isoformat()
                }, params={"id": f"eq.{integ['id']}"})
                logger.info(f"Integration {integ['id']} updated config successfully.")
            except Exception as e:
                logger.error(f"Failed to update oem_integrations config mapping: {e}")
                error_count += 1
            
        # 7. Verification Gate Check
        # Count unique site mappings actually stored across active configs
        all_active_configs = supabase_get("oem_integrations", params={"is_active": "eq.true"})
        current_mapped_site_ids = set()
        for c in all_active_configs:
            for p in c.get("config", {}).get("plants", []):
                s_id = p.get("site_id")
                if s_id:
                    current_mapped_site_ids.add(s_id)
                    
        # Verification Count Check
        logger.info(f"Verification Gate: Stations Fetched: {stations_fetched_count} | Unique Sites Mapped: {len(current_mapped_site_ids)}")
        
        if len(current_mapped_site_ids) != stations_fetched_count:
            logger.warning("Verification gate failed! The number of mapped sites in DB does not match station count. Cleanup aborted.")
            if sync_run_id:
                supabase_patch("sync_runs", {
                    "status": "failed",
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "error_message": "Verification gate failed: Mapped sites count mismatch.",
                    "error_count": error_count + 1
                }, params={"id": f"eq.{sync_run_id}"})
            return
            
        # Verification Passed -> Perform Cleanup of leftover demo sites
        logger.info("Verification gate passed! Proceeding to remove unmapped demo sites...")
        
        all_db_sites = supabase_get("sites")
        deleted_sites_count = 0
        
        for site in all_db_sites:
            site_id = site["id"]
            if site_id not in current_mapped_site_ids:
                logger.info(f"Removing unmapped demo site: '{site.get('name')}' (ID: {site_id})")
                try:
                    supabase_delete("sites", params={"id": f"eq.{site_id}"})
                    deleted_sites_count += 1
                except Exception as e:
                    logger.error(f"Failed to delete demo site {site_id}: {e}")
                    error_count += 1
                
        logger.info(f"Cleanup finished. Demo Sites removed: {deleted_sites_count}")
        logger.info("Sync, migration, and verification completed successfully!")
        
        # Log successful sync run completed
        if sync_run_id:
            completed_at = datetime.now(timezone.utc)
            duration_seconds = (completed_at - started_at).total_seconds()
            supabase_patch("sync_runs", {
                "status": "success",
                "completed_at": completed_at.isoformat(),
                "sites_processed": stations_fetched_count,
                "inverters_processed": inverters_linked_count,
                "telemetry_records": telemetry_inserted_count,
                "string_records": string_telemetry_inserted_count,
                "alerts_processed": alerts_processed_count,
                "error_count": error_count,
                "duration_seconds": duration_seconds
            }, params={"id": f"eq.{sync_run_id}"})
            
    except Exception as e:
        logger.error(f"Error occurred during synchronization: {e}", exc_info=True)
        if sync_run_id:
            try:
                completed_at = datetime.now(timezone.utc)
                duration_seconds = (completed_at - started_at).total_seconds()
                supabase_patch("sync_runs", {
                    "status": "failed",
                    "completed_at": completed_at.isoformat(),
                    "error_message": str(e),
                    "error_count": error_count + 1,
                    "duration_seconds": duration_seconds
                }, params={"id": f"eq.{sync_run_id}"})
            except Exception as patch_err:
                logger.error(f"Failed to log sync run failure: {patch_err}")
    finally:
        sync_lock.release()

async def start_polling_loop():
    """Polling loop background worker run inside the server process."""
    env = os.getenv("ENV") or os.getenv("NODE_ENV") or "development"
    if env == "production":
        logger.info("Background polling loop disabled in production mode (delegating execution to Vercel Cron).")
        return
        
    poll_interval = int(os.getenv("POLL_INTERVAL_SECONDS") or 900)
    logger.info(f"Starting background polling service. Interval: {poll_interval} seconds")
    
    import asyncio
    await asyncio.sleep(5)
    
    while True:
        try:
            await asyncio.to_thread(poll_and_sync_all, trigger_source="local_daemon")
        except Exception as e:
            logger.error(f"Polling loop encountered an unhandled exception: {e}")
        
        logger.info(f"Sleeping for {poll_interval} seconds...")
        await asyncio.sleep(poll_interval)
