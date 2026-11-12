import os
import time
import logging
import threading
from datetime import datetime, timezone
from typing import Set
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

try:
    from adapters.solis import SolisAdapter
    from adapters.feston import FestonAdapter
    from adapters.base import OemAdapter
    from alarm_mappings import translate_alert
    from distributed_lock import DistributedLock
except ImportError:
    from backend.adapters.solis import SolisAdapter
    from backend.adapters.feston import FestonAdapter
    from backend.adapters.base import OemAdapter
    from backend.alarm_mappings import translate_alert
    from backend.distributed_lock import DistributedLock

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("sync_service")

# --- SETTINGS & SAFETY GUARD ---
PRODUCTION_PROJECT_REF = "ylnmjvgnjootrkywbcsj"
STAGING_PROJECT_REF = "xpjzuquqehjamqsqshwq"

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or f"https://{STAGING_PROJECT_REF}.supabase.co"
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""

# Safety guard for local development/testing:
# When executing locally or in test mode, block accidental production targets unless explicitly authorized.
# In production hosting (where ENV or NODE_ENV == 'production'), allow standard operation.
env = os.getenv("ENV") or os.getenv("NODE_ENV") or "development"
allow_prod = os.getenv("ALLOW_PRODUCTION_INGESTION", "").lower() in ("true", "1")
if env != "production" and not allow_prod and PRODUCTION_PROJECT_REF in SUPABASE_URL:
    raise RuntimeError(
        f"CRITICAL SAFETY VIOLATION: Non-production environment ({env}) cannot target production project ({PRODUCTION_PROJECT_REF}). "
        "Local sync service execution must target staging unless ALLOW_PRODUCTION_INGESTION=true is explicitly set."
    )


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

def supabase_post(table: str, data: list, headers_override: dict = None, params: dict = None) -> list:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = get_supabase_headers()
    if headers_override:
        headers.update(headers_override)
    response = requests.post(url, headers=headers, json=data, params=params, timeout=25)
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
    elif provider in ("feston", "solaros"):
        app_id = config.get("app_id") or os.getenv("SOLAROS_APP_ID") or "202610131053002"
        app_secret = config.get("app_secret") or os.getenv("SOLAROS_APP_SECRET") or "a7e3f7b5ab36de3103b76b62798ea2d3"
        api_url = config.get("api_url") or os.getenv("SOLAROS_API_URL") or "https://india-developer.solaros.com"
        email = config.get("email") or os.getenv("SOLAROS_EMAIL")
        username = config.get("username") or os.getenv("SOLAROS_USERNAME")
        password = config.get("password") or os.getenv("SOLAROS_PASSWORD")
        access_token = config.get("access_token") or os.getenv("SOLAROS_ACCESS_TOKEN")
        company_id = config.get("company_id") or (int(os.getenv("SOLAROS_COMPANY_ID")) if os.getenv("SOLAROS_COMPANY_ID") else None)
        return FestonAdapter(
            app_id=app_id,
            app_secret=app_secret,
            api_url=api_url,
            email=email,
            username=username,
            password=password,
            access_token=access_token,
            company_id=company_id
        )
    else:
        raise ValueError(f"Unsupported provider: {provider}")

sync_lock = threading.Lock()

SEVERITY_TO_PRIORITY = {
    "critical": "p1",
    "high": "p2",
    "medium": "p3",
    "low": "p4"
}

def process_alert_automation_python(alert_row: dict):
    """Idempotent Python helper to create/associate Ticket and Draft Work Order for actionable alerts."""
    try:
        alert_id = alert_row.get("id")
        requires_technician = alert_row.get("requires_technician", False)
        status = alert_row.get("status")
        
        if not requires_technician or status != "open":
            logger.info(f"Skipping automation for alert {alert_id}: requires_technician is False or status is not open.")
            return
            
        org_id = alert_row.get("org_id")
        site_id = alert_row.get("site_id")
        code = alert_row.get("code")
        title = alert_row.get("title", "")
        description = alert_row.get("description", "")
        severity = alert_row.get("severity", "medium")
        priority = SEVERITY_TO_PRIORITY.get(severity, "p3")
        
        # 1. Idempotent Ticket Lookup / Creation
        existing_tickets = supabase_get("tickets", params={
            "alert_id": f"eq.{alert_id}",
            "status": "in.(open,in_progress,on_hold)"
        })
        
        ticket_id = None
        if existing_tickets:
            ticket_id = existing_tickets[0]["id"]
            logger.info(f"Reusing active Ticket ID {ticket_id} for alert {alert_id}")
        else:
            ticket_payload = {
                "org_id": org_id,
                "site_id": site_id,
                "alert_id": alert_id,
                "title": f"[ALARM] {title}",
                "description": f"Automated ticket created for alert code {code}. {description}",
                "status": "open",
                "priority": priority
            }
            res_ticket = supabase_post("tickets", [ticket_payload], headers_override={"Prefer": "return=representation"})
            if res_ticket:
                ticket_id = res_ticket[0]["id"]
                logger.info(f"Created Ticket ID {ticket_id} for alert {alert_id}")
                
        if not ticket_id:
            return
            
        # 2. Idempotent Draft Work Order Lookup / Creation
        existing_wos = supabase_get("work_orders", params={
            "ticket_id": f"eq.{ticket_id}",
            "status": "in.(draft,scheduled,en_route,in_progress)"
        })
        
        if existing_wos:
            logger.info(f"Reusing active Work Order ID {existing_wos[0]['id']} for Ticket {ticket_id}")
        else:
            # Priority 1: Technician already at this site today
            today_date = datetime.now(timezone.utc).date().isoformat()
            technician_id = None
            try:
                site_wos = supabase_get("work_orders", params={
                    "site_id": f"eq.{site_id}",
                    "scheduled_date": f"eq.{today_date}",
                    "technician_id": "not.is.null"
                })
                if site_wos:
                    technician_id = site_wos[0]["technician_id"]
                    logger.info(f"Assigning technician {technician_id} because they have another Job at this site today.")
            except Exception as e:
                logger.error(f"Error querying existing WOs for technician assignment: {e}")
                
            if not technician_id:
                try:
                    techs = supabase_get("profiles", params={"role": "eq.technician"})
                    if techs:
                        technician_id = techs[0]["id"]
                        logger.info(f"Fallback assignment to technician {technician_id}.")
                except Exception as e:
                    logger.error(f"Error falling back to any technician: {e}")
                    
            wo_payload = {
                "org_id": org_id,
                "site_id": site_id,
                "ticket_id": ticket_id,
                "technician_id": technician_id,
                "title": f"Alarm Investigation: {title}",
                "description": f"Field investigation task for alert code {code}. {description}\nRecommended Action: {alert_row.get('recommended_action', 'Perform manual inspection.')}",
                "type": "alarm_investigation",
                "status": "scheduled" if technician_id else "draft",
                "scheduled_date": today_date if technician_id else None,
                "estimated_duration_mins": 60
            }
            res_wo = supabase_post("work_orders", [wo_payload], headers_override={"Prefer": "return=representation"})
            if res_wo:
                logger.info(f"Created Work Order ID {res_wo[0]['id']} for Ticket {ticket_id}")
    except Exception as e:
        logger.error(f"Error processing alert automation for alert {alert_row.get('id')}: {e}", exc_info=True)

STRING_DEVIATION_THRESHOLD = float(os.getenv("STRING_DEVIATION_THRESHOLD") or 0.25)
MIN_STRING_POWER_KW = 0.1

def analyze_strings_for_anomalies(inv_id, site_id, org_id, string_telemetries, telemetry, oem: str = "solis") -> list:
    """
    Returns a list of active synthetic alert keys.
    Detects string performance deviations on the FIRST qualifying telemetry cycle,
    escalates on persistence, and auto-resolves on recovery while retaining history.
    """
    active_keys = []
    if not string_telemetries or len(string_telemetries) < 2:
        return active_keys
        
    if not telemetry or (telemetry.dc_power_kw is not None and telemetry.dc_power_kw < 0.2):
        return active_keys
        
    # Active strings: strings producing voltage/current above noise floor
    active_st_list = [
        st for st in string_telemetries 
        if st.power_kw is not None and (st.voltage_v > 10.0 or st.current_a > 0.05)
    ]
    if len(active_st_list) < 2:
        return active_keys

    powers = [st.power_kw for st in active_st_list]
    powers.sort()
    mid = len(powers) // 2
    median_power = (powers[mid] + powers[~mid]) / 2.0
    
    if median_power < MIN_STRING_POWER_KW:
        return active_keys
        
    anomalous_strings = []
    for st in active_st_list:
        if st.power_kw < median_power * (1 - STRING_DEVIATION_THRESHOLD):
            deviation = (median_power - st.power_kw) / median_power * 100
            anomalous_strings.append({
                "index": st.string_index,
                "power": st.power_kw,
                "deviation": deviation
            })
            
    if not anomalous_strings:
        return active_keys
        
    code = "STRING_PERFORMANCE_DEVIATION"
    active_keys.append(f"{code}:{inv_id}")
    active_keys.append(f"STRING_ANOMALY:{inv_id}") # Backward-compat key match
    
    existing = supabase_get("alerts", params={"code": f"in.({code},STRING_ANOMALY)", "inverter_id": f"eq.{inv_id}", "status": "eq.open"})
    
    if existing:
        alert = existing[0]
        # Persistence across subsequent polls: escalate severity and flag for technician action
        title = "STRING PERFORMANCE DEVIATION"
        affected_str = ", ".join([f"String #{a['index']}" for a in anomalous_strings])
        desc = f"Persistent string underperformance: {affected_str} operating {anomalous_strings[0]['deviation']:.1f}% below peer median ({median_power:.2f} kW)."
        
        try:
            supabase_patch("alerts", {
                "code": code,
                "title": title,
                "description": desc,
                "severity": "high",
                "requires_technician": True,
                "recommended_action": "Field investigation required: inspect string DC connections, module shading, or diode failures."
            }, params={"id": f"eq.{alert['id']}"})
        except Exception:
            supabase_patch("alerts", {
                "code": code,
                "title": title,
                "description": desc,
                "severity": "high"
            }, params={"id": f"eq.{alert['id']}"})
        
        updated = supabase_get("alerts", params={"id": f"eq.{alert['id']}"})
        if updated:
            process_alert_automation_python(updated[0])
    else:
        # First-cycle detection: surface immediately without multi-poll delay requirement
        title = "STRING PERFORMANCE DEVIATION"
        affected_str = ", ".join([f"String #{a['index']}" for a in anomalous_strings])
        desc = f"First-cycle deviation detected: {affected_str} operating {anomalous_strings[0]['deviation']:.1f}% below peer median ({median_power:.2f} kW)."
        
        synth_payload = {
            "org_id": org_id,
            "site_id": site_id,
            "inverter_id": inv_id,
            "code": code,
            "title": title,
            "description": desc,
            "severity": "medium",
            "status": "open",
            "triggered_at": telemetry.timestamp,
            "oem": oem,
            "alarm_code": "STRING_DEV_01",
            "category": "performance",
            "is_auto_resolvable": True,
            "requires_technician": False,
            "recommended_action": "Monitor on subsequent telemetry cycles for recovery or persistence."
        }
        try:
            supabase_post("alerts", [synth_payload], headers_override={"Prefer": "return=representation"})
        except Exception:
            base_synth = {
                "org_id": org_id,
                "site_id": site_id,
                "inverter_id": inv_id,
                "code": code,
                "title": title,
                "description": desc,
                "severity": "medium",
                "status": "open",
                "triggered_at": telemetry.timestamp
            }
            supabase_post("alerts", [base_synth], headers_override={"Prefer": "return=representation"})
        
    return active_keys

def process_station_concurrently(station, adapter, plants_mapping, org_id, provider, dist_lock=None):
    metrics = {
        "error_count": 0,
        "sites_upserted_count": 0,
        "inverters_linked_count": 0,
        "telemetry_inserted_count": 0,
        "string_telemetry_inserted_count": 0,
        "alerts_processed_count": 0,
        "mapped_site_id": None,
        "plant_id": str(station.plant_id)
    }
    
    plant_id = station.plant_id
    try:
        if dist_lock:
            dist_lock.assert_active_owner()
            
        # Check mapping: 1. Try dedicated oem_station_mappings table
        mapped_site_id = None
        try:
            db_station_map = supabase_get("oem_station_mappings", params={
                "oem": f"eq.{provider}",
                "external_station_id": f"eq.{plant_id}"
            })
            if db_station_map:
                mapped_site_id = db_station_map[0].get("site_id")
        except Exception as e:
            logger.debug(f"oem_station_mappings lookup skipped or table not yet migrated: {e}")

        # 2. Check plants_mapping in integration config
        if not mapped_site_id:
            for pm in plants_mapping:
                if str(pm.get("plant_id")) == str(plant_id):
                    mapped_site_id = pm.get("site_id")
                    break
                
        # Validate if the mapped site exists in DB
        is_valid_mapped_site = False
        if mapped_site_id:
            try:
                site_data = supabase_get("sites", params={"id": f"eq.{mapped_site_id}"})
                if site_data:
                    is_valid_mapped_site = True
            except Exception as e:
                logger.error(f"Error checking site {mapped_site_id}: {e}")
                mapped_site_id = None
        
        # Populate common site model fields
        site_fields = {
            "name": station.name,
            "location": station.location,
            "latitude": float(station.location != "Unknown" and 19.0 or 0.0),
            "longitude": float(station.location != "Unknown" and 73.0 or 0.0),
            "capacity_kwp": station.capacity_kwp,
            "status": "active",
            "timezone": station.timezone
        }
        if station.commissioned_on:
            site_fields["commissioned_on"] = station.commissioned_on
        
        if dist_lock:
            dist_lock.assert_active_owner()
            
        if is_valid_mapped_site:
            # Update (preserve site's org_id assignment)
            supabase_patch("sites", site_fields, params={"id": f"eq.{mapped_site_id}"})
            site_id = mapped_site_id
            logger.info(f"Updated Site ID: {site_id} for Station '{station.name}' (External ID: {plant_id})")
        else:
            # Create (set org_id for new site)
            create_site_fields = {**site_fields, "org_id": org_id}
            res_site = supabase_post("sites", [create_site_fields], headers_override={"Prefer": "return=representation"})
            site_id = res_site[0]["id"]
            metrics["sites_upserted_count"] += 1
            logger.info(f"Created Site ID: {site_id} for Station '{station.name}' (External ID: {plant_id})")
            
            # Persist deterministic mapping in oem_station_mappings
            try:
                supabase_post("oem_station_mappings", [{
                    "site_id": site_id,
                    "oem": provider,
                    "external_station_id": str(plant_id),
                    "station_name": station.name
                }])
            except Exception as e:
                logger.debug(f"Failed to record oem_station_mappings entry (schema may be pending): {e}")
            
        metrics["mapped_site_id"] = site_id
        
        # 3. Sync Inverters under this Site
        devices = adapter.list_devices(plant_id)
        serial_to_inv_id_map = {}
        all_synthetic_alerts = set()
        
        for dev in devices:
            try:
                # Check if inverter exists in DB
                db_inverters = supabase_get("inverters", params={
                    "oem": f"eq.{provider}",
                    "oem_device_id": f"eq.{dev.oem_device_id}"
                })
                
                inv_capacity = dev.capacity_kw if dev.capacity_kw > 0.0 else (station.capacity_kwp or 0.0)
                inv_fields = {
                    "site_id": site_id,
                    "model": dev.model,
                    "serial_number": dev.serial_number,
                    "capacity_kw": inv_capacity,
                    "string_count": dev.string_count,
                    "status": dev.status,
                    "last_seen_at": dev.last_seen_at
                }
                if station.commissioned_on:
                    inv_fields["installed_on"] = station.commissioned_on
                
                if dist_lock:
                    dist_lock.assert_active_owner()
                    
                if db_inverters:
                    inv_id = db_inverters[0]["id"]
                    supabase_patch("inverters", inv_fields, params={"id": f"eq.{inv_id}"})
                    logger.info(f"Updated Inverter ID: {inv_id} under Site {site_id}")
                else:
                    inv_fields.update({
                        "oem": provider,
                        "oem_device_id": dev.oem_device_id,
                        "installed_on": station.commissioned_on or dev.installed_on or "2023-01-01"
                    })
                    res_inv = supabase_post("inverters", [inv_fields], headers_override={"Prefer": "return=representation"})
                    inv_id = res_inv[0]["id"]
                    logger.info(f"Created Inverter ID: {inv_id} under Site {site_id}")
                    
                metrics["inverters_linked_count"] += 1
                serial_to_inv_id_map[dev.serial_number] = inv_id
                
                # 4. Sync Telemetry and String Telemetry
                telemetry, string_telemetries = adapter.fetch_telemetry(dev.oem_device_id)
                
                if telemetry:
                    if telemetry.timestamp and telemetry.timestamp > dev.last_seen_at:
                        supabase_patch("inverters", {"last_seen_at": telemetry.timestamp}, params={"id": f"eq.{inv_id}"})
                    
                    inv_cap = float(dev.get("capacity_kw") or 0.0) if isinstance(dev, dict) else float(getattr(dev, "capacity_kw", 0.0) or 0.0)
                    spec_yield = round(telemetry.daily_generation_kwh / inv_cap, 2) if (inv_cap > 0 and telemetry.daily_generation_kwh > 0) else telemetry.specific_yield
                    telemetry_payload = {
                        "inverter_id": inv_id,
                        "timestamp": telemetry.timestamp,
                        "ac_power_kw": telemetry.ac_power_kw,
                        "dc_power_kw": telemetry.dc_power_kw,
                        "energy_kwh": telemetry.energy_kwh,
                        "efficiency_pct": telemetry.efficiency_pct,
                        "temperature_c": telemetry.temperature_c,
                        "daily_generation_kwh": telemetry.daily_generation_kwh,
                        "total_generation_kwh": telemetry.total_generation_kwh,
                        "specific_yield": spec_yield,
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
                    }
                    if dist_lock:
                        dist_lock.assert_active_owner()
                    try:
                        supabase_post(
                            "telemetry", 
                            [telemetry_payload],
                            headers_override={"Prefer": "resolution=ignore-duplicates"},
                            params={"on_conflict": "inverter_id,timestamp"}
                        )
                    except requests.exceptions.HTTPError as e:
                        if "42P10" in str(e) or "400" in str(e):
                            existing = supabase_get("telemetry", params={
                                "inverter_id": f"eq.{inv_id}",
                                "timestamp": f"eq.{telemetry.timestamp}"
                            })
                            if not existing:
                                base_payload = {
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
                                    "last_update": telemetry.last_update
                                }
                                try:
                                    supabase_post("telemetry", [telemetry_payload])
                                except Exception:
                                    supabase_post("telemetry", [base_payload])
                        else:
                            raise
                    metrics["telemetry_inserted_count"] += 1
                    logger.info(f"Processed Telemetry for Inverter {inv_id}")
                        
                # Strings lookup and creation
                existing_strings = supabase_get("strings", params={"inverter_id": f"eq.{inv_id}"})
                string_map = {s["string_index"]: s["id"] for s in existing_strings}
                
                # Dynamic MPPT Discovery: Seed String 1 if no strings exist yet for this inverter
                if not string_map:
                    string_cap = round(inv_capacity / (dev.string_count or 1), 2) if (dev.string_count or 1) > 0 else inv_capacity
                    str_payload = {
                        "inverter_id": inv_id,
                        "string_index": 1,
                        "capacity_kw": string_cap,
                        "status": "ok"
                    }
                    if getattr(dev, "modules_count", None):
                        str_payload["modules_count"] = dev.modules_count
                    res_str = supabase_post("strings", [str_payload], headers_override={"Prefer": "return=representation"})
                    if res_str:
                        string_map[1] = res_str[0]["id"]
                        logger.info(f"Dynamically discovered and created initial String Index 1 for Inverter {inv_id}")

                # String Telemetry sync (100% Dynamic & Safe Pruning)
                string_telemetry_batch = []
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
                        string_cap = round(inv_capacity / (dev.string_count or 1), 2) if (dev.string_count or 1) > 0 else 0.0
                        str_payload = {
                            "inverter_id": inv_id,
                            "string_index": st.string_index,
                            "capacity_kw": string_cap,
                            "status": "ok"
                        }
                        if getattr(dev, "modules_count", None):
                            str_payload["modules_count"] = dev.modules_count
                        res_str = supabase_post("strings", [str_payload], headers_override={"Prefer": "return=representation"})
                        string_id = res_str[0]["id"]
                        string_map[st.string_index] = string_id
                    # Accumulate string telemetry for batch upsert
                    string_telemetry_batch.append({
                        "string_id": string_id,
                        "timestamp": telemetry.timestamp,
                        "voltage_v": st.voltage_v,
                        "current_a": st.current_a,
                        "power_kw": st.power_kw,
                        "status": st.status
                    })

                # Batch upsert all active string telemetry for this inverter in one HTTP request
                if string_telemetry_batch:
                    if dist_lock:
                        dist_lock.assert_active_owner()
                    try:
                        supabase_post(
                            "string_telemetry", 
                            string_telemetry_batch,
                            headers_override={"Prefer": "resolution=ignore-duplicates"},
                            params={"on_conflict": "string_id,timestamp"}
                        )
                    except requests.exceptions.HTTPError as e:
                        if "42P10" in str(e) or "400" in str(e):
                            for stb in string_telemetry_batch:
                                existing_st = supabase_get("string_telemetry", params={
                                    "string_id": f"eq.{stb['string_id']}",
                                    "timestamp": f"eq.{stb['timestamp']}"
                                })
                                if not existing_st:
                                    supabase_post("string_telemetry", [stb])
                        else:
                            raise
                    metrics["string_telemetry_inserted_count"] += len(string_telemetry_batch)
                
                # Update dynamic string count and ensure communicating inverters are marked online
                dynamic_string_count = len(string_map)
                inv_patch = {
                    "string_count": dynamic_string_count,
                    "status": "online" if telemetry else dev.status,
                    "last_seen_at": telemetry.timestamp.isoformat() if (telemetry and hasattr(telemetry, "timestamp") and telemetry.timestamp) else dev.last_seen_at
                }
                supabase_patch("inverters", inv_patch, params={"id": f"eq.{inv_id}"})
                
                # Analyze strings for anomalies
                synth_alerts = analyze_strings_for_anomalies(inv_id, site_id, org_id, string_telemetries, telemetry, oem=provider)
                for sa in synth_alerts:
                    all_synthetic_alerts.add(sa)
                    
            except Exception as e:
                logger.error(f"Error syncing inverter {dev.serial_number}: {e}", exc_info=True)
                metrics["error_count"] += 1
                
        # 5. Sync Alerts for the plant
        alerts = adapter.fetch_alerts(plant_id)
        if alerts is None:
            logger.warning(f"[Alert Sync] Received null/failed response for plant ID {plant_id}. Skipping alert ingestion/resolution to prevent incorrect state clearance.")
        else:
            active_alert_keys = set(all_synthetic_alerts)
            for alert in alerts:
                try:
                    # Try parsing device SN from description
                    device_sn = None
                    if "(Device SN: " in alert.description:
                        device_sn = alert.description.split("(Device SN: ")[1].split(")")[0]
                        
                    inv_id = serial_to_inv_id_map.get(device_sn) if device_sn else None
                    key = f"{alert.code}:{inv_id or ''}"
                    active_alert_keys.add(key)
                    
                    # Prevent duplicate check
                    params = {
                        "code": f"eq.{alert.code}",
                        "status": "eq.open",
                        "site_id": f"eq.{site_id}"
                    }
                    if inv_id:
                        params["inverter_id"] = f"eq.{inv_id}"
                    else:
                        params["inverter_id"] = "is.null"
                        
                    existing_alerts = supabase_get("alerts", params=params)
                    if not existing_alerts:
                        if dist_lock:
                            dist_lock.assert_active_owner()
                        translated = translate_alert(alert.oem, alert.alarm_code, alert.title)
                        alert_payload = {
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
                        }
                        try:
                            res_alert = supabase_post("alerts", [alert_payload], headers_override={"Prefer": "return=representation"})
                        except Exception:
                            base_alert = {
                                "org_id": org_id,
                                "site_id": site_id,
                                "inverter_id": inv_id,
                                "code": alert.code,
                                "title": translated.get("title", alert.title),
                                "description": alert.description + (f" - {translated.get('description')}" if translated.get('description') else ""),
                                "severity": translated.get("severity", alert.severity),
                                "status": "open",
                                "triggered_at": alert.triggered_at
                            }
                            res_alert = supabase_post("alerts", [base_alert], headers_override={"Prefer": "return=representation"})
                        metrics["alerts_processed_count"] += 1
                        logger.info(f"Created alert for code {alert.code} under Site {site_id}")
                        
                        if res_alert:
                            process_alert_automation_python(res_alert[0])
                except Exception as e:
                    logger.error(f"Error syncing alert code {alert.code} for station {station.name}: {e}", exc_info=True)
                    metrics["error_count"] += 1

            # Auto-resolve database alerts that are no longer reported as active by the Solis API snapshot
            try:
                db_open_alerts = supabase_get("alerts", params={
                    "site_id": f"eq.{site_id}",
                    "status": "in.(open,acknowledged)"
                })
                for db_alert in db_open_alerts:
                    code_key = f"{db_alert['code']}:{db_alert.get('inverter_id') or ''}"
                    alarm_code_key = f"{db_alert.get('alarm_code') or db_alert['code']}:{db_alert.get('inverter_id') or ''}"
                    if code_key not in active_alert_keys and alarm_code_key not in active_alert_keys:
                        if dist_lock:
                            dist_lock.assert_active_owner()
                        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                        supabase_patch("alerts", {
                            "status": "resolved",
                            "resolved_at": now_iso
                        }, params={"id": f"eq.{db_alert['id']}"})
                        logger.info(f"Automatically resolved alert ID: {db_alert['id']} (Code: {db_alert['code']}) for Site {site_id}")
                        
                        # Conservative Ticket Resolution: Check if remaining active alerts or active WOs exist
                        try:
                            linked_tickets = supabase_get("tickets", params={
                                "alert_id": f"eq.{db_alert['id']}",
                                "status": "in.(open,in_progress,on_hold)"
                            })
                            for t in linked_tickets:
                                t_id = t["id"]
                                remaining_alerts = supabase_get("alerts", params={
                                    "status": "in.(open,acknowledged)",
                                    "site_id": f"eq.{site_id}",
                                    "code": f"eq.{db_alert['code']}"
                                })
                                remaining_wos = supabase_get("work_orders", params={
                                    "ticket_id": f"eq.{t_id}",
                                    "status": "in.(draft,scheduled,en_route,in_progress)"
                                })
                                if not remaining_alerts and not remaining_wos:
                                    supabase_patch("tickets", {
                                        "status": "resolved",
                                        "resolved_at": now_iso
                                    }, params={"id": f"eq.{t_id}"})
                                    logger.info(f"Verified telemetry clearance: Resolved Ticket ID {t_id} after Alert clearance.")
                        except Exception as t_err:
                            logger.error(f"Error evaluating ticket resolution for alert {db_alert['id']}: {t_err}")
            except Exception as e:
                logger.error(f"Error auto-resolving alerts for site {site_id}: {e}", exc_info=True)
                metrics["error_count"] += 1
                
    except Exception as e:
        logger.error(f"Error syncing station {station.name} (Plant {station.plant_id}): {e}", exc_info=True)
        metrics["error_count"] += 1
        
    return metrics


def poll_and_sync_all(trigger_source: str = "manual", oem_filter: str = None):
    """
    Polls all active OEM integrations, normalizes data, and persists records safely.
    Guaranteed concurrency-safe across distributed containers via DistributedLock.
    Supports oem_filter ('solis' or 'feston') for controlled single-OEM execution.
    Provides strict failure isolation between OEMs.
    """
    started_at = datetime.now(timezone.utc)
    
    # Intra-process lock
    if not sync_lock.acquire(blocking=False):
        logger.warning("Another sync thread in this process is already in progress. Skipping cycle.")
        return
        
    dist_lock = None
    sync_run_id = None
    telemetry_inserted_count = 0
    string_telemetry_inserted_count = 0
    alerts_processed_count = 0
    total_error_count = 0
    stations_fetched_count = 0
    sites_upserted_count = 0
    inverters_linked_count = 0
    oem_metrics = {}
    
    try:
        if not SUPABASE_KEY:
            logger.error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set. Cannot run sync.")
            return

        # Distributed lock across all container instances / workers
        dist_lock = DistributedLock(
            supabase_url=SUPABASE_URL,
            supabase_key=SUPABASE_KEY,
            lease_seconds=int(os.getenv("SYNC_LOCK_LEASE_SECONDS") or 120),
            heartbeat_interval=15
        )
        if not dist_lock.acquire():
            logger.warning("Another active worker currently holds the distributed lock. Skipping this invocation.")
            return
            
        logger.info(f"Starting multi-OEM sync cycle (Source: {trigger_source}, Filter: {oem_filter or 'all'})...")
            
        # Create sync_run record in DB
        try:
            sync_run_payload = {
                "status": "running",
                "oem": oem_filter or "multi_oem",
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
            total_error_count += 1
            
        # 1. Fetch active OEM configurations
        all_integrations = supabase_get("oem_integrations", params={"is_active": "eq.true"})
        integrations = []
        for integ in all_integrations:
            raw_p = integ.get("provider")
            p = "feston" if raw_p == "solaros" else raw_p
            if oem_filter and p != oem_filter:
                continue
            integrations.append(integ)
            
        logger.info(f"Found {len(integrations)} active OEM integration(s) matching filter '{oem_filter or 'all'}'")
        
        # Process each OEM integration in an isolated failure domain
        for integ in integrations:
            raw_provider = integ.get("provider")
            provider = "feston" if raw_provider == "solaros" else raw_provider
            org_id = integ.get("org_id")
            config = integ.get("config", {})
            plants_mapping = config.get("plants", [])
            
            oem_metrics[provider] = {
                "status": "pending",
                "stations_fetched": 0,
                "sites_upserted": 0,
                "inverters_linked": 0,
                "telemetry_inserted": 0,
                "string_telemetry_inserted": 0,
                "alerts_processed": 0,
                "error_count": 0,
                "error_message": None
            }
            
            logger.info(f"--- Starting isolated sync for OEM '{provider}' (Integration: {integ['id']}) ---")
            if dist_lock:
                dist_lock.assert_active_owner()
            
            try:
                try:
                    adapter = get_adapter_for_integration(integ)
                except Exception as e:
                    logger.error(f"Failed to load adapter for provider {provider}: {e}")
                    oem_metrics[provider]["status"] = "failed"
                    oem_metrics[provider]["error_message"] = f"Adapter load error: {e}"
                    oem_metrics[provider]["error_count"] += 1
                    total_error_count += 1
                    continue
                    
                # 2. List stations dynamically from OEM API
                try:
                    stations = adapter.list_stations()
                    stations_fetched_count += len(stations)
                    oem_metrics[provider]["stations_fetched"] = len(stations)
                    logger.info(f"Discovered {len(stations)} station(s) for {provider}")
                except Exception as e:
                    logger.error(f"Failed to list stations for provider {provider}: {e}")
                    oem_metrics[provider]["status"] = "failed"
                    oem_metrics[provider]["error_message"] = f"List stations error: {e}"
                    oem_metrics[provider]["error_count"] += 1
                    total_error_count += 1
                    continue
                
                updated_plants_mapping = []
                oem_err_count = 0
                
                # --- CONCURRENT FAN-OUT PROCESSING FOR THIS OEM ---
                with ThreadPoolExecutor(max_workers=20) as executor:
                    futures = []
                    for station in stations:
                        futures.append(executor.submit(process_station_concurrently, station, adapter, plants_mapping, org_id, provider, dist_lock))
                    
                    for future in as_completed(futures):
                        try:
                            metrics = future.result()
                            oem_err_count += metrics["error_count"]
                            sites_upserted_count += metrics["sites_upserted_count"]
                            inverters_linked_count += metrics["inverters_linked_count"]
                            telemetry_inserted_count += metrics["telemetry_inserted_count"]
                            string_telemetry_inserted_count += metrics["string_telemetry_inserted_count"]
                            alerts_processed_count += metrics["alerts_processed_count"]
                            
                            oem_metrics[provider]["sites_upserted"] += metrics["sites_upserted_count"]
                            oem_metrics[provider]["inverters_linked"] += metrics["inverters_linked_count"]
                            oem_metrics[provider]["telemetry_inserted"] += metrics["telemetry_inserted_count"]
                            oem_metrics[provider]["string_telemetry_inserted"] += metrics["string_telemetry_inserted_count"]
                            oem_metrics[provider]["alerts_processed"] += metrics["alerts_processed_count"]
                            
                            if metrics["mapped_site_id"]:
                                updated_plants_mapping.append({
                                    "plant_id": metrics["plant_id"], 
                                    "site_id": metrics["mapped_site_id"]
                                    })
                        except Exception as e:
                            logger.error(f"Unhandled exception in {provider} station worker thread: {e}", exc_info=True)
                            oem_err_count += 1
                # --- END FAN-OUT ---
                
                oem_metrics[provider]["error_count"] = oem_err_count
                total_error_count += oem_err_count
                
                # Update integration plants mapping on Supabase (preserving existing keys)
                try:
                    if dist_lock:
                        dist_lock.assert_active_owner()
                    new_config = dict(config)
                    new_config["plants"] = updated_plants_mapping
                    supabase_patch("oem_integrations", {
                        "config": new_config,
                        "last_sync_at": datetime.now(timezone.utc).isoformat()
                    }, params={"id": f"eq.{integ['id']}"})
                    logger.info(f"Integration {integ['id']} ({provider}) updated config successfully.")
                except Exception as e:
                    logger.error(f"Failed to update oem_integrations config mapping for {provider}: {e}")
                    total_error_count += 1
                    
                oem_metrics[provider]["status"] = "success" if oem_err_count == 0 else "partial_success"
                logger.info(f"--- Completed sync for OEM '{provider}': Status = {oem_metrics[provider]['status']} ---")
                
            except Exception as oem_unhandled:
                logger.error(f"Unhandled error in OEM '{provider}' sync cycle: {oem_unhandled}", exc_info=True)
                oem_metrics[provider]["status"] = "failed"
                oem_metrics[provider]["error_message"] = str(oem_unhandled)
                oem_metrics[provider]["error_count"] += 1
                total_error_count += 1
                # Execution proceeds to the next OEM in the loop
            
        # Determine overall run status
        succeeded_oems = [o for o, m in oem_metrics.items() if m["status"] in ("success", "partial_success")]
        failed_oems = [o for o, m in oem_metrics.items() if m["status"] == "failed"]
        
        if failed_oems and succeeded_oems:
            final_status = "partial_success"
        elif failed_oems and not succeeded_oems:
            final_status = "failed"
        else:
            final_status = "success"
            
        summary_messages = []
        for o, m in oem_metrics.items():
            summary_messages.append(f"{o}: {m['status']} (stations: {m['stations_fetched']}, inverters: {m['inverters_linked']}, errors: {m['error_count']})")
        final_summary = "; ".join(summary_messages) if summary_messages else "No active integrations processed."
        
        logger.info(f"Cycle completed with overall status: {final_status}. Summary: {final_summary}")
        
        # Update final sync run log
        if sync_run_id:
            completed_at = datetime.now(timezone.utc)
            duration_seconds = (completed_at - started_at).total_seconds()
            supabase_patch("sync_runs", {
                "status": final_status,
                "completed_at": completed_at.isoformat(),
                "sites_processed": stations_fetched_count,
                "inverters_processed": inverters_linked_count,
                "telemetry_records": telemetry_inserted_count,
                "string_records": string_telemetry_inserted_count,
                "alerts_processed": alerts_processed_count,
                "error_count": total_error_count,
                "error_message": final_summary if final_status != "success" else None,
                "duration_seconds": duration_seconds
            }, params={"id": f"eq.{sync_run_id}"})
            
    except Exception as e:
        logger.error(f"Fatal error during synchronization cycle: {e}", exc_info=True)
        if sync_run_id:
            try:
                completed_at = datetime.now(timezone.utc)
                duration_seconds = (completed_at - started_at).total_seconds()
                supabase_patch("sync_runs", {
                    "status": "failed",
                    "completed_at": completed_at.isoformat(),
                    "error_message": str(e),
                    "error_count": total_error_count + 1,
                    "duration_seconds": duration_seconds
                }, params={"id": f"eq.{sync_run_id}"})
            except Exception as patch_err:
                logger.error(f"Failed to log sync run failure: {patch_err}")
    finally:
        if dist_lock and dist_lock.acquired:
            dist_lock.release()
        sync_lock.release()

async def start_polling_loop():
    """Polling loop background worker run inside the server process."""
    env = os.getenv("ENV") or os.getenv("NODE_ENV") or "development"
    enable_daemon = os.getenv("ENABLE_DAEMON_POLLING", "").lower() in ("true", "1")
    
    if env == "production" and not enable_daemon:
        logger.info("Background polling daemon disabled in production mode (ENABLE_DAEMON_POLLING not set; awaiting scheduled trigger).")
        return
        
    poll_interval = int(os.getenv("POLL_INTERVAL_SECONDS") or 900)
    logger.info(f"Starting autonomous polling daemon. Interval: {poll_interval} seconds")
    
    import asyncio
    await asyncio.sleep(5)
    
    while True:
        try:
            await asyncio.to_thread(poll_and_sync_all, trigger_source="autonomous_daemon")
        except Exception as e:
            logger.error(f"Polling loop encountered an unhandled exception: {e}")
        
        logger.info(f"Sleeping for {poll_interval} seconds...")
        await asyncio.sleep(poll_interval)
