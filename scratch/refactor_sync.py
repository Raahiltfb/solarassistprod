import re

with open('backend/sync_service.py', 'r') as f:
    content = f.read()

# 1. Add import
if "from concurrent.futures import ThreadPoolExecutor, as_completed" not in content:
    content = content.replace("from typing import Set", "from typing import Set\nfrom concurrent.futures import ThreadPoolExecutor, as_completed")

# 2. Find the start of poll_and_sync_all and insert process_station_concurrently
start_idx = content.find("def poll_and_sync_all(trigger_source: str = \"manual\"):")

process_func = """def process_station_concurrently(station, adapter, plants_mapping, org_id, provider):
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
            metrics["sites_upserted_count"] += 1
            logger.info(f"Created Site ID: {site_id} for Station '{station.name}'")
            
        metrics["mapped_site_id"] = site_id
        
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
            except Exception as e:
                logger.error(f"Error syncing inverter {dev.serial_number}: {e}", exc_info=True)
                metrics["error_count"] += 1
                
        # 5. Sync Alerts for the plant
        alerts = adapter.fetch_alerts(plant_id)
        if alerts is None:
            logger.warning(f"[Alert Sync] Received null/failed response for plant ID {plant_id}. Skipping alert ingestion/resolution to prevent incorrect state clearance.")
        else:
            active_alert_keys = set()
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

"""

content = content[:start_idx] + process_func + "\n" + content[start_idx:]

# 3. Replace the `for station in stations:` block with ThreadPoolExecutor
block_start = content.find("            # Map to translate plant_id to site_id during the iteration")
block_end = content.find("            # 6. Update configuration plants mapping on Supabase")

if block_start == -1 or block_end == -1:
    print("Could not find blocks")
    exit(1)

new_block = """            # Map to translate plant_id to site_id during the iteration
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
            
"""

content = content[:block_start] + new_block + content[block_end:]

with open('backend/sync_service.py', 'w') as f:
    f.write(content)
print("Success")
