import time
import hmac
import base64
import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import List, Tuple, Optional
import requests

from .base import (
    OemAdapter,
    NormalizedStation,
    NormalizedDevice,
    NormalizedTelemetry,
    NormalizedStringTelemetry,
    NormalizedAlert
)

logger = logging.getLogger("solis_adapter")

class SolisAdapter(OemAdapter):
    def _call_solis(self, endpoint: str, body_dict: dict) -> dict:
        """Sends signed authentication requests to the SolisCloud API with retry logic."""
        body = json.dumps(body_dict)
        content_md5 = base64.b64encode(hashlib.md5(body.encode('utf-8')).digest()).decode('utf-8')
        date_str = datetime.now(timezone.utc).strftime('%a, %d %b %Y %H:%M:%S GMT')
        encrypt_str = f"POST\n{content_md5}\napplication/json\n{date_str}\n{endpoint}"
        
        hmac_obj = hmac.new(self.key_secret.encode('utf-8'), encrypt_str.encode('utf-8'), hashlib.sha1)
        sign = base64.b64encode(hmac_obj.digest()).decode('utf-8')
        
        headers = {
            "Content-Type": "application/json", 
            "Content-MD5": content_md5, 
            "Date": date_str, 
            "Authorization": f"API {self.key_id}:{sign}"
        }
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                url = f"{self.api_url}{endpoint}"
                logger.info(f"Solis API Request: POST {url} | Attempt {attempt + 1}")
                response = requests.post(url, headers=headers, data=body, timeout=25)
                response.raise_for_status()
                res_json = response.json()
                if res_json.get("code") == "0":
                    return res_json
                else:
                    logger.warning(f"Solis API returned error code {res_json.get('code')}: {res_json.get('msg')}")
            except Exception as e:
                logger.error(f"Solis API connection error on attempt {attempt + 1}: {e}")
                if attempt == max_retries - 1:
                    return {"code": "-1", "msg": str(e)}
            time.sleep(1)
        return {"code": "-1", "msg": "Failed after max retries"}

    def list_stations(self) -> List[NormalizedStation]:
        res = self._call_solis("/v1/api/userStationList", {"pageNo": 1, "pageSize": 100})
        stations = []
        if res.get("code") == "0":
            records = res.get("data", {}).get("page", {}).get("records", [])
            for s in records:
                plant_id = str(s.get("id"))
                name = s.get("sName") or s.get("stationName") or f"Solis Plant {plant_id}"
                capacity = float(s.get("capacity") or 0.0)
                
                # Construct location
                city = s.get("cityStr") or ""
                region = s.get("regionStr") or ""
                country = s.get("countryStr") or ""
                loc_parts = [part for part in [city, region, country] if part]
                location = ", ".join(loc_parts) if loc_parts else "Unknown"
                
                # Timezone
                timezone_str = s.get("timeZoneStrNew") or s.get("timeZoneName") or "Asia/Kolkata"
                if " " in timezone_str:
                    timezone_str = timezone_str.split(" ", 1)[1]
                
                stations.append(NormalizedStation(
                    plant_id=plant_id,
                    name=name,
                    capacity_kwp=capacity,
                    location=location,
                    timezone=timezone_str
                ))
        return stations

    def list_devices(self, plant_id: str) -> List[NormalizedDevice]:
        station_id_param = int(plant_id) if str(plant_id).isdigit() else plant_id
        res = self._call_solis("/v1/api/inverterList", {"stationId": station_id_param, "pageNo": 1, "pageSize": 100})
        devices = []
        if res.get("code") == "0":
            records = res.get("data", {}).get("page", {}).get("records", [])
            for d in records:
                inv_oem_id = str(d.get("id"))
                serial_number = d.get("sn")
                if not inv_oem_id or not serial_number:
                    continue
                
                # Fetch detailed status
                inv_detail_res = self._call_solis("/v1/api/inverterDetail", {"id": inv_oem_id})
                inv_data = inv_detail_res.get("data", {}) if inv_detail_res.get("code") == "0" else {}
                
                ts = inv_data.get("dataTimestamp") or inv_data.get("updateTime") or d.get("dataTimestamp")
                if ts:
                    try:
                        ts_int = int(ts)
                        last_seen_dt = datetime.fromtimestamp(ts_int / 1000.0, tz=timezone.utc)
                    except (ValueError, TypeError):
                        last_seen_dt = datetime.now(timezone.utc)
                else:
                    last_seen_dt = datetime.now(timezone.utc)
                
                last_seen_at = last_seen_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
                
                state_val = inv_data.get("state")
                pac_val = float(inv_data.get("pac") or 0.0)
                
                # Evaluate connectivity vs operating condition
                # State 1 = Generating, State 2 = Stopped/Standby (e.g. night), State 3 = Fault
                is_fresh = (datetime.now(timezone.utc) - last_seen_dt).total_seconds() <= 1800
                if not is_fresh:
                    status = "offline"
                elif state_val == 1 or state_val == "1" or pac_val > 0:
                    status = "online"
                elif state_val == 3 or state_val == "3":
                    status = "fault"
                else:
                    status = "standby"
                
                model = d.get("machine") or d.get("model") or inv_data.get("model") or "Solis Inverter"
                capacity_kw = float(inv_data.get("power") or d.get("power") or 0.0)
                dc_input_type = inv_data.get("dcInputType") or inv_data.get("dcInputtype")
                if dc_input_type is None:
                    dc_input_type = d.get("dcInputType") or d.get("dcInputtype")
                string_count = int(dc_input_type) + 1 if dc_input_type is not None else 8
                
                devices.append(NormalizedDevice(
                    oem_device_id=inv_oem_id,
                    model=model,
                    serial_number=serial_number,
                    capacity_kw=capacity_kw,
                    string_count=string_count,
                    status=status,
                    last_seen_at=last_seen_at
                ))
        return devices

    def fetch_telemetry(self, device_id: str) -> Tuple[Optional[NormalizedTelemetry], List[NormalizedStringTelemetry]]:
        detail_res = self._call_solis("/v1/api/inverterDetail", {"id": device_id})
        if detail_res.get("code") != "0":
            return None, []
            
        inv_data = detail_res.get("data", {})
        
        # Telemetry
        ac_power_kw = float(inv_data.get("pac") or 0.0)
        dc_power_kw = float(inv_data.get("dcPac") or ac_power_kw)
        energy_kwh = float(inv_data.get("eToday") or 0.0)
        efficiency_pct = float(inv_data.get("efficiency") or 95.0)
        temperature_c = float(inv_data.get("inverterTemperature") or 35.0)
        
        state_val = inv_data.get("state")
        online_status = True if (state_val == 1 or state_val == "1") else False
        
        capacity_kw = float(inv_data.get("power") or 0.0)
        daily_generation_kwh = energy_kwh
        
        # Correctly normalize eTotal (lifetime generation) to standard kWh
        raw_etotal = float(inv_data.get("eTotal") or 0.0)
        e_total_str = str(inv_data.get("eTotalStr") or "kWh").upper()
        if "M" in e_total_str:
            total_generation_kwh = raw_etotal * 1000.0
        elif "G" in e_total_str:
            total_generation_kwh = raw_etotal * 1000000.0
        else:
            total_generation_kwh = raw_etotal
            
        # Parse or calculate Specific Yield (kWh/kWp)
        specific_yield = float(inv_data.get("fullHour") or 0.0)
        if specific_yield == 0.0 and capacity_kw > 0:
            specific_yield = round(daily_generation_kwh / capacity_kw, 2)
        
        ts = inv_data.get("dataTimestamp") or inv_data.get("updateTime")
        if ts:
            try:
                last_seen_dt = datetime.fromtimestamp(int(ts) / 1000.0, tz=timezone.utc)
            except (ValueError, TypeError):
                last_seen_dt = datetime.now(timezone.utc)
        else:
            last_seen_dt = datetime.now(timezone.utc)
        last_seen_at = last_seen_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        
        frequency_hz = float(inv_data.get("fac") or 0.0)
        reactive_power_kvar = float(inv_data.get("reactivePower") or 0.0)
        power_factor = float(inv_data.get("powerFactor") or 1.0)

        current_r_a = float(inv_data.get("iAc1") or 0.0)
        current_s_a = float(inv_data.get("iAc2") or 0.0)
        current_t_a = float(inv_data.get("iAc3") or 0.0)
        voltage_r_v = float(inv_data.get("uAc1") or 0.0)
        voltage_s_v = float(inv_data.get("uAc2") or 0.0)
        voltage_t_v = float(inv_data.get("uAc3") or 0.0)
        apparent_power_kva = float(inv_data.get("apparentPower") or 0.0)

        battery_soc_pct = float(inv_data.get("batteryCapacitySoc") or 0.0) if "batteryCapacitySoc" in inv_data else None
        battery_soh_pct = float(inv_data.get("batteryHealthSoh") or 0.0) if "batteryHealthSoh" in inv_data else None
        battery_power_kw = float(inv_data.get("batteryPower") or 0.0) if "batteryPower" in inv_data else None
        battery_voltage_v = float(inv_data.get("batteryVoltage") or 0.0) if "batteryVoltage" in inv_data else None
        battery_current_a = float(inv_data.get("bstteryCurrent") or 0.0) if "bstteryCurrent" in inv_data else None

        load_power_kw = float(inv_data.get("familyLoadPower") or 0.0) if "familyLoadPower" in inv_data else None
        grid_purchased_today_kwh = float(inv_data.get("gridPurchasedTodayEnergy") or 0.0) if "gridPurchasedTodayEnergy" in inv_data else None
        grid_sell_today_kwh = float(inv_data.get("gridSellTodayEnergy") or 0.0) if "gridSellTodayEnergy" in inv_data else None
        load_today_kwh = float(inv_data.get("homeLoadTodayEnergy") or 0.0) if "homeLoadTodayEnergy" in inv_data else None

        vendor_metrics = {
            "dcBus": inv_data.get("dcBus"),
            "dcBusHalf": inv_data.get("dcBusHalf"),
            "simFlowState": inv_data.get("simFlowState"),
            "fullHour": inv_data.get("fullHour"),
            "totalFullHour": inv_data.get("totalFullHour"),
        }
        
        for i in range(1, 21):
            upv = inv_data.get(f"mpptUpv{i}")
            ipv = inv_data.get(f"mpptIpv{i}")
            pow_val = inv_data.get(f"mpptPow{i}")
            if upv is not None:
                vendor_metrics[f"mpptUpv{i}"] = float(upv)
            if ipv is not None:
                vendor_metrics[f"mpptIpv{i}"] = float(ipv)
            if pow_val is not None:
                vendor_metrics[f"mpptPow{i}"] = float(pow_val)
        
        telemetry = NormalizedTelemetry(
            timestamp=last_seen_at,
            ac_power_kw=ac_power_kw,
            dc_power_kw=dc_power_kw,
            energy_kwh=energy_kwh,
            efficiency_pct=efficiency_pct,
            temperature_c=temperature_c,
            daily_generation_kwh=daily_generation_kwh,
            total_generation_kwh=total_generation_kwh,
            specific_yield=specific_yield,
            online_status=online_status,
            last_update=last_seen_at,
            frequency_hz=frequency_hz,
            reactive_power_kvar=reactive_power_kvar,
            power_factor=power_factor,
            current_r_a=current_r_a,
            current_s_a=current_s_a,
            current_t_a=current_t_a,
            voltage_r_v=voltage_r_v,
            voltage_s_v=voltage_s_v,
            voltage_t_v=voltage_t_v,
            apparent_power_kva=apparent_power_kva,
            battery_soc_pct=battery_soc_pct,
            battery_soh_pct=battery_soh_pct,
            battery_power_kw=battery_power_kw,
            battery_voltage_v=battery_voltage_v,
            battery_current_a=battery_current_a,
            load_power_kw=load_power_kw,
            grid_purchased_today_kwh=grid_purchased_today_kwh,
            grid_sell_today_kwh=grid_sell_today_kwh,
            load_today_kwh=load_today_kwh,
            metrics={k: v for k, v in vendor_metrics.items() if v is not None}
        )
        
        # String Telemetry (Dynamically extract all 32 possible Solis inputs)
        string_telemetries = []
        for i in range(1, 33):
            v = inv_data.get(f"uPv{i}")
            curr = inv_data.get(f"iPv{i}")
            voltage_v = round(float(v), 2) if v else 0.0
            current_a = round(float(curr), 2) if curr else 0.0
            power_kw = round((voltage_v * current_a) / 1000.0, 3)
            str_status = "ok" if voltage_v > 50 else "offline"
            
            string_telemetries.append(NormalizedStringTelemetry(
                string_index=i,
                voltage_v=voltage_v,
                current_a=current_a,
                power_kw=power_kw,
                status=str_status
            ))
            
        return telemetry, string_telemetries

    def fetch_alerts(self, plant_id: str) -> Optional[List[NormalizedAlert]]:
        alerts = []
        page_no = 1
        page_size = 100
        has_more = True

        while has_more:
            alarm_payload = {
                "pageNo": str(page_no),
                "pageSize": str(page_size),
                "stationId": int(plant_id) if str(plant_id).isdigit() else plant_id,
                "state": 0 # Fetch active alarms specifically so they aren't buried under resolved historical alarms
            }
            res = self._call_solis("/v1/api/alarmList", alarm_payload)
            if not res or res.get("code") != "0":
                if page_no == 1:
                    return None
                break
                
            records = res.get("data", {}).get("records", []) if res.get("data") else []
            for alarm in records:
                # Solis alarm state: '0' or '1' = active alarm, '2' = resolved/restored alarm.
                state_str = str(alarm.get("state"))
                if state_str not in ["0", "1"]:
                    continue  # Skip resolved/restored alarms
                    
                code = alarm.get("alarmCode") or "UNKNOWN"
                title = alarm.get("alarmMsg") or "Fault Detected"
                description = alarm.get("alarmMsg") or ""
                
                # Convert alarm begin time (ms) to ISO string
                alarm_ts = alarm.get("alarmBeginTime")
                triggered_at = datetime.fromtimestamp(int(alarm_ts)/1000, tz=timezone.utc).isoformat() if alarm_ts else datetime.now(timezone.utc).isoformat()
                
                # Map severity
                lvl = str(alarm.get("alarmLevel"))
                if lvl == "3":
                    severity = "critical"
                elif lvl == "2":
                    severity = "high"
                elif lvl == "1":
                    severity = "medium"
                else:
                    severity = "low"
                    
                # Append alarmDeviceSn to description for mapping serial number
                sn = alarm.get("alarmDeviceSn")
                if sn:
                    description = f"{description} (Device SN: {sn})"
                    
                alerts.append(NormalizedAlert(
                    code=code,
                    title=title,
                    description=description,
                    severity=severity,
                    triggered_at=triggered_at,
                    alarm_code=code,
                    oem="solis",
                    category="inverter",
                    is_auto_resolvable=False,
                    requires_technician=True,
                    recommended_action=""
                ))
            
            if len(records) < page_size:
                has_more = False
            else:
                page_no += 1
                
        return alerts
