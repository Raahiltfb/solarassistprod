import hashlib
import hmac
import base64
import requests
import json
from datetime import datetime, timezone
import pandas as pd
import time
import os

# --- API SETTINGS ---
# Checks Environment Variables first (GitHub Actions / Cloud), falls back to hardcoded strings for local testing
KEY_ID = os.getenv("SOLIS_KEY_ID") or "1300386381678106385"
KEY_SECRET = os.getenv("SOLIS_KEY_SECRET") or "a21fcc244b2f4fe48097ceca92a1c160"
API_URL = "https://www.soliscloud.com:13333"

def get_solis_data(endpoint, body_dict):
    """Sends signed authentication requests to the SolisCloud API."""
    body = json.dumps(body_dict)
    content_md5 = base64.b64encode(hashlib.md5(body.encode('utf-8')).digest()).decode('utf-8')
    date_str = datetime.now(timezone.utc).strftime('%a, %d %b %Y %H:%M:%S GMT')
    encrypt_str = f"POST\n{content_md5}\napplication/json\n{date_str}\n{endpoint}"
    hmac_obj = hmac.new(KEY_SECRET.encode('utf-8'), encrypt_str.encode('utf-8'), hashlib.sha1)
    sign = base64.b64encode(hmac_obj.digest()).decode('utf-8')
    
    headers = {
        "Content-Type": "application/json", 
        "Content-MD5": content_md5, 
        "Date": date_str, 
        "Authorization": f"API {KEY_ID}:{sign}"
    }
    try:
        response = requests.post(f"{API_URL}{endpoint}", headers=headers, data=body, timeout=25)
        return response.json()
    except Exception as e:
        return {"code": "-1", "msg": str(e)}

try:
    print("🚀 Starting Complete Master Solis Diagnostic & Yield Data Export...")
    list_result = get_solis_data("/v1/api/userStationList", {"pageNo": 1, "pageSize": 100})
    
    if list_result.get("code") == "0":
        stations = list_result['data']['page']['records']
        final_report = []

        for s in stations:
            p_id = s.get('id')
            p_name = s.get('sName') or s.get('stationName') or "N/A"
            
            # --- 1. TOTAL YIELD UNIT PARSING ---
            raw_str = str(s.get('allEnergyStr', "")).upper()
            raw_val = float(s.get('allEnergy', 0))
            standard_total_kwh = round(raw_val * 1000, 2) if "M" in raw_str else round(raw_val, 2)

            # --- 2. FULL ALARM LOGIC (Levels 1, 2, and 3) ---
            alarm_payload = {
                "pageNo": "1", 
                "pageSize": "20", 
                "stationId": int(p_id),
                "state": 0  # Active / Unprocessed alarms
            }
            alarm_res = get_solis_data("/v1/api/alarmList", alarm_payload)
            
            found_alarms = []
            max_severity = "Healthy"
            
            if alarm_res.get("code") == "0":
                records = alarm_res.get('data', {}).get('records', [])
                for r in records:
                    code = r.get('alarmCode') or "???"
                    msg = r.get('alarmMsg') or "Fault Detected"
                    device = r.get('alarmDeviceSn', 'N/A')
                    lvl = str(r.get('alarmLevel'))
                    
                    found_alarms.append(f"[{code}] {msg} (Device: {device})")
                    
                    if lvl == "3": 
                        max_severity = "CRITICAL"
                    elif lvl == "2" and max_severity != "CRITICAL": 
                        max_severity = "WARNING"
                    elif lvl == "1" and max_severity == "Healthy":
                        max_severity = "INFO/COMM"

            # --- 3. STATION DETAIL (Yield, Power, Timestamps) ---
            detail_result = get_solis_data("/v1/api/stationDetail", {"id": p_id})
            d = detail_result.get('data', {}) if detail_result.get("code") == "0" else {}
            
            daily_yield = float(d.get('dayEnergy', 0))
            capacity = float(d.get('capacity', 0))
            calc_flh = round(daily_yield / capacity, 2) if capacity > 0 else 0
            
            ts = d.get('dataTimestamp') or d.get('updateTime') or s.get('dataTimestamp')
            last_update = datetime.fromtimestamp(int(ts)/1000).strftime('%Y-%m-%d %H:%M:%S') if ts else "N/A"
            health_status = max_severity if found_alarms else ("Online" if d.get('state') == 1 else "Offline")

            # Base station record dictionary
            base_row = {
                "Plant Name": p_name,
                "Plant ID": p_id,
                "Health Status": health_status,
                "Active Alarms": " | ".join(found_alarms) if found_alarms else "None",
                "Daily Yield (kWh)": daily_yield,
                "Specific Yield (kWh/kWp)": calc_flh,
                "Today Full Load Hours": calc_flh,
                "Current Power (kW)": d.get('power', 0),
                "Total Yield (kWh)": standard_total_kwh,
                "Installed Capacity (kWp)": capacity,
                "Inverter Online/Total": f"{s.get('inverterOnlineCount',0)}/{s.get('inverterCount',0)}",
                "Last Update": last_update,
            }

            # --- 4. INVERTER & STRING TELEMETRY LOGIC ---
            inv_list_res = get_solis_data("/v1/api/inverterList", {"stationId": p_id})
            inverters = []
            
            if inv_list_res.get("code") == "0":
                inverters = inv_list_res.get('data', {}).get('page', {}).get('records', [])

            if inverters:
                # Create a detailed row for every inverter attached to the station
                for inv in inverters:
                    row = base_row.copy()
                    inv_id = inv.get('id')
                    row["Inverter SN"] = inv.get('sn', 'N/A')
                    row["Inverter ID"] = inv_id
                    
                    inv_detail = get_solis_data("/v1/api/inverterDetail", {"id": inv_id})
                    if inv_detail.get("code") == "0":
                        inv_data = inv_detail.get('data', {})
                        # Map up to 8 Strings (uPv = Voltage, iPv = Current)
                        for i in range(1, 9):
                            v = inv_data.get(f'uPv{i}')
                            curr = inv_data.get(f'iPv{i}')
                            
                            if v and float(v) > 50:  # Threshold for active string voltage
                                row[f"Str{i}_V"] = round(float(v), 2)
                                row[f"Str{i}_A"] = round(float(curr), 2) if curr else 0.0
                            else:
                                row[f"Str{i}_V"] = 0
                                row[f"Str{i}_A"] = 0
                    else:
                        # Reset string data if detail fetch fails
                        for i in range(1, 9):
                            row[f"Str{i}_V"] = 0
                            row[f"Str{i}_A"] = 0

                    final_report.append(row)
            else:
                # If no inverters found, retain the station row with null inverter data
                row = base_row.copy()
                row["Inverter SN"] = "N/A"
                row["Inverter ID"] = "N/A"
                for i in range(1, 9):
                    row[f"Str{i}_V"] = 0
                    row[f"Str{i}_A"] = 0
                final_report.append(row)

            status_icon = "🚨" if found_alarms else "✅"
            print(f"{status_icon} Processed: {p_name[:25].ljust(25)} | Inverters: {len(inverters)} | Alarms: {len(found_alarms)}")
            time.sleep(0.5)

        # --- 5. EXPORT MASTER CSV ---
        df = pd.DataFrame(final_report)
        
        # Enforce clean, structured column ordering
        base_cols = [
            "Plant Name", "Plant ID", "Inverter SN", "Inverter ID", 
            "Health Status", "Active Alarms", "Daily Yield (kWh)", 
            "Specific Yield (kWh/kWp)", "Today Full Load Hours", "Current Power (kW)", 
            "Total Yield (kWh)", "Installed Capacity (kWp)", "Inverter Online/Total", "Last Update"
        ]
        string_cols = sorted([c for c in df.columns if c.startswith("Str")])
        
        df = df[base_cols + string_cols]
        
        filename = f"Solis_Master_Diagnostics_{datetime.now().strftime('%Y-%m-%d')}.csv"
        df.to_csv(filename, index=False)

        print(f"\n📊 Master Report Generated Successfully: '{filename}' (Total Rows: {len(df)})")

    else:
        print(f"❌ API Error: {list_result.get('msg')}")

except Exception as e:
    print(f"⚠️ Script Execution Error: {e}")