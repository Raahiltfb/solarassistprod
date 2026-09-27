import os
import time
import logging
import threading
from datetime import datetime, timezone
from typing import Set
from concurrent.futures import ThreadPoolExecutor, as_completed
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
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE"

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

def analyze_strings_for_anomalies(inv_id, site_id, org_id, string_telemetries, telemetry) -> list:
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
        
        supabase_patch("alerts", {
            "code": code,
            "title": title,
            "description": desc,
            "severity": "high",
            "requires_technician": True,
            "recommended_action": "Field investigation required: inspect string DC connections, module shading, or diode failures."
        }, params={"id": f"eq.{alert['id']}"})
        
        updated = supabase_get("alerts", params={"id": f"eq.{alert['id']}"})
        if updated:
            process_alert_automation_python(updated[0])
    else:
        # First-cycle detection: surface immediately without multi-poll delay requirement
        title = "STRING PERFORMANCE DEVIATION"
        affected_str = ", ".join([f"String #{a['index']}" for a in anomalous_strings])
        desc = f"First-cycle deviation detected: {affected_str} operating {anomalous_strings[0]['deviation']:.1f}% below peer median ({median_power:.2f} kW)."
        
        supabase_post("alerts", [{
            "org_id": org_id,
            "site_id": site_id,
            "inverter_id": inv_id,
            "code": code,
            "title": title,
            "description": desc,
            "severity": "medium",
            "status": "open",
            "triggered_at": telemetry.timestamp,
            "oem": "solis",
            "alarm_code": "STRING_DEV_01",
            "category": "performance",
            "is_auto_resolvable": True,
            "requires_technician": False,
            "recommended_action": "Monitor on subsequent telemetry cycles for recovery or persistence."
        }], headers_override={"Prefer": "return=representation"})
        
    return active_keys

def process_station_concurrently(station, adapter, plants_mapping, org_id, provider):
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
            "name": station.name,
            "location": station.location,
            "latitude": float(station.location != "Unknown" and 19.0 or 0.0),
            "longitude": float(station.location != "Unknown" and 73.0 or 0.0),
            "capacity_kwp": station.capacity_kwp,
            "status": "active",
            "timezone": station.timezone
        }
        
        if is_valid_mapped_site:
            # Update (preserve site's org_id assignment)
            supabase_patch("sites", site_fields, params={"id": f"eq.{mapped_site_id}"})
            site_id = mapped_site_id
            logger.info(f"Updated Site ID: {site_id} for Station '{station.name}'")
        else:
            # Create (set org_id for new site)
            create_site_fields = {**site_fields, "org_id": org_id}
            res_site = supabase_post("sites", [create_site_fields], headers_override={"Prefer": "return=representation"})
            site_id = res_site[0]["id"]
            metrics["sites_upserted_count"] += 1
            logger.info(f"Created Site ID: {site_id} for Station '{station.name}'")
            
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
                    
                metrics["inverters_linked_count"] += 1
                serial_to_inv_id_map[dev.serial_number] = inv_id
                
                # 4. Sync Telemetry and String Telemetry
                telemetry, string_telemetries = adapter.fetch_telemetry(dev.oem_device_id)
                
                if telemetry:
                    if telemetry.timestamp and telemetry.timestamp > dev.last_seen_at:
                        supabase_patch("inverters", {"last_seen_at": telemetry.timestamp}, params={"id": f"eq.{inv_id}"})
                    
                    # Upsert telemetry gracefully handling duplicates
                    supabase_post(
                        "telemetry", 
                        [{
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
                        }],
                        headers_override={"Prefer": "resolution=ignore-duplicates"},
                        params={"on_conflict": "inverter_id,timestamp"}
                    )
                    metrics["telemetry_inserted_count"] += 1
                    logger.info(f"Processed Telemetry for Inverter {inv_id}")
                        
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
                        
                    # Sync string telemetry (upsert gracefully)
                    supabase_post(
                        "string_telemetry", 
                        [{
                            "string_id": string_id,
                            "timestamp": telemetry.timestamp,
                            "voltage_v": st.voltage_v,
                            "current_a": st.current_a,
                            "power_kw": st.power_kw,
                            "status": st.status
                        }],
                        headers_override={"Prefer": "resolution=ignore-duplicates"},
                        params={"on_conflict": "string_id,timestamp"}
                    )
                    metrics["string_telemetry_inserted_count"] += 1
                
                # Update dynamic string count in inverters table
                dynamic_string_count = len(string_map)
                supabase_patch("inverters", {"string_count": dynamic_string_count}, params={"id": f"eq.{inv_id}"})
                
                # Analyze strings for anomalies
                synth_alerts = analyze_strings_for_anomalies(inv_id, site_id, org_id, string_telemetries, telemetry)
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
                        translated = translate_alert(alert.oem, alert.alarm_code, alert.title)
                        res_alert = supabase_post("alerts", [{
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
                        }], headers_override={"Prefer": "return=representation"})
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
            
            # --- CONCURRENT FAN-OUT PROCESSING ---
            with ThreadPoolExecutor(max_workers=20) as executor:
                futures = []
                for station in stations:
                    futures.append(executor.submit(process_station_concurrently, station, adapter, plants_mapping, org_id, provider))
                
                for future in as_completed(futures):
                    try:
                        metrics = future.result()
                        error_count += metrics["error_count"]
                        sites_upserted_count += metrics["sites_upserted_count"]
                        inverters_linked_count += metrics["inverters_linked_count"]
                        telemetry_inserted_count += metrics["telemetry_inserted_count"]
                        string_telemetry_inserted_count += metrics["string_telemetry_inserted_count"]
                        alerts_processed_count += metrics["alerts_processed_count"]
                        
                        if metrics["mapped_site_id"]:
                            active_mapped_site_ids.add(metrics["mapped_site_id"])
                            updated_plants_mapping.append({
                                "plant_id": metrics["plant_id"], 
                                "site_id": metrics["mapped_site_id"]
                            })
                    except Exception as e:
                        logger.error(f"Unhandled exception in station worker thread: {e}", exc_info=True)
                        error_count += 1
            # --- END FAN-OUT ---
            
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
        
        if stations_fetched_count == 0:
            logger.warning("Verification gate failed! The API returned 0 total stations (likely an OEM API outage). Cleanup aborted to prevent data loss.")
            if sync_run_id:
                supabase_patch("sync_runs", {
                    "status": "failed",
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "error_message": "Verification gate failed: OEM API returned 0 stations.",
                    "error_count": error_count + 1
                }, params={"id": f"eq.{sync_run_id}"})
            return
            
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
