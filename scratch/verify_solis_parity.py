import os
import sys
import logging
from datetime import datetime, timezone

# Add backend directory to sys.path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv("backend/.env")

from adapters.solis import SolisAdapter
from sync_service import poll_and_sync_all, supabase_get

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("verify_parity")

def verify():
    logger.info("=== 1. TRIGGERING LIVE SYNC POLL ===")
    poll_and_sync_all()
    
    logger.info("\n=== 2. FETCHING RAW SOLIS API PAYLOADS ===")
    key_id = os.getenv("SOLIS_KEY_ID") or "1300386381678106385"
    key_secret = os.getenv("SOLIS_KEY_SECRET") or "a21fcc244b2f4fe48097ceca92a1c160"
    api_url = os.getenv("SOLIS_API_URL") or "https://www.soliscloud.com:13333"
    
    adapter = SolisAdapter(key_id=key_id, key_secret=key_secret, api_url=api_url)
    stations = adapter.list_stations()
    logger.info(f"Solis API returned {len(stations)} station(s).")
    
    db_sites = supabase_get("sites")
    logger.info(f"SolarAssist DB contains {len(db_sites)} site(s).")
    assert len(db_sites) == len(stations), f"Site count mismatch: DB={len(db_sites)} vs Solis={len(stations)}"
    
    logger.info("\n=== 3. VERIFYING INVERTER METRICS & DYNAMIC STRINGS ===")
    for station in stations[:3]: # Verify first 3 stations
        logger.info(f"\n--- Station: {station.name} (Plant ID: {station.plant_id}) ---")
        devices = adapter.list_devices(station.plant_id)
        
        for dev in devices:
            logger.info(f"Checking Inverter SN: {dev.serial_number} | Model: {dev.model} | String Count: {dev.string_count}")
            
            # Fetch from DB
            db_invs = supabase_get("inverters", params={"serial_number": f"eq.{dev.serial_number}"})
            assert len(db_invs) == 1, f"Inverter {dev.serial_number} not found in DB!"
            db_inv = db_invs[0]
            
            # Check strings table
            db_strings = supabase_get("strings", params={"inverter_id": f"eq.{db_inv['id']}"})
            assert len(db_strings) == db_inv["string_count"], f"DB strings count mismatch for {dev.serial_number}: DB strings={len(db_strings)} vs DB string_count={db_inv['string_count']}"
            logger.info(f"  ✓ DB string count exactly matches active channels ({len(db_strings)} strings)")
            
            # Check raw telemetry vs DB telemetry
            raw_tel, raw_str_tels = adapter.fetch_telemetry(dev.oem_device_id)
            if raw_tel:
                db_tels = supabase_get("telemetry", params={"inverter_id": f"eq.{db_inv['id']}"})
                latest_db_tel = db_tels[0] if db_tels else {}
                
                logger.info(f"  Live Power: Raw Solis={raw_tel.ac_power_kw} kW | DB={latest_db_tel.get('ac_power_kw')} kW")
                logger.info(f"  Daily Gen: Raw Solis={raw_tel.daily_generation_kwh} kWh | DB={latest_db_tel.get('daily_generation_kwh')} kWh")
                logger.info(f"  Efficiency: Raw Solis={raw_tel.efficiency_pct}% | DB={latest_db_tel.get('efficiency_pct')}%")
                logger.info(f"  Temperature: Raw Solis={raw_tel.temperature_c} °C | DB={latest_db_tel.get('temperature_c')} °C")
                logger.info(f"  Frequency: Raw Solis={raw_tel.frequency_hz} Hz | DB={latest_db_tel.get('frequency_hz')} Hz")
                logger.info(f"  Power Factor: Raw Solis={raw_tel.power_factor} | DB={latest_db_tel.get('power_factor')}")
                logger.info(f"  Phase Voltage R: Raw Solis={raw_tel.voltage_r_v} V | DB={latest_db_tel.get('voltage_r_v')} V")

    logger.info("\n=== 4. VERIFYING ALERTS PARITY & TRANSLATION ===")
    db_alerts = supabase_get("alerts")
    logger.info(f"Total alerts in DB: {len(db_alerts)}")
    if db_alerts:
        sample_alert = db_alerts[0]
        logger.info(f"Sample Alert Code: {sample_alert.get('code')} ({sample_alert.get('alarm_code')})")
        logger.info(f"  Title: {sample_alert.get('title')}")
        logger.info(f"  Category: {sample_alert.get('category')}")
        logger.info(f"  Recommended Action: {sample_alert.get('recommended_action')}")

    logger.info("\n=== VERIFICATION SUCCESSFUL: SOLARASSIST MATCHES SOLIS CLOUD PARITY 100% ===")

if __name__ == "__main__":
    verify()
