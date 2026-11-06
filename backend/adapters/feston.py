import time
import os
import json
import hashlib
import logging
from datetime import datetime, timezone
from typing import List, Tuple, Optional, Dict, Any
from pathlib import Path
import requests

from .base import (
    OemAdapter,
    NormalizedStation,
    NormalizedDevice,
    NormalizedTelemetry,
    NormalizedStringTelemetry,
    NormalizedAlert
)

try:
    from alarm_mappings import translate_alert
except (ImportError, ValueError):
    try:
        from ..alarm_mappings.base import translate_alert
    except (ImportError, ValueError):
        def translate_alert(oem, code, title):
            return {
                "title": title,
                "description": f"OEM alert: {code}",
                "severity": "medium",
                "category": "inverter",
                "is_auto_resolvable": False,
                "requires_technician": True,
                "recommended_action": "Inspect inverter operational display."
            }

logger = logging.getLogger("feston_adapter")

# Key mapping patterns for SolarOS/Deye register names
KEY_PATTERNS = {
    "ac_power": ["active power", "generation power", "ac power", "total ac power", "output power", "pac"],
    "dc_power": ["dc power", "total dc power", "pv power", "solar power", "ppv"],
    "daily_generation": ["daily generation", "daily energy", "today generation", "today energy", "e-today", "etoday"],
    "total_generation": ["total generation", "total energy", "cumulative energy", "e-total", "etotal"],
    "temperature": ["temperature", "radiator temp", "heatsink temp", "internal temp", "inverter temp"],
    "frequency": ["frequency", "grid frequency", "ac frequency", "fac"],
    "power_factor": ["power factor", "pf"],
    "reactive_power": ["reactive power", "qac"],
    "apparent_power": ["apparent power", "sac"],
    "voltage_r": ["voltage l1", "voltage r", "grid voltage l1", "u_ac1", "u_l1", "vac1"],
    "voltage_s": ["voltage l2", "voltage s", "grid voltage l2", "u_ac2", "u_l2", "vac2"],
    "voltage_t": ["voltage l3", "voltage t", "grid voltage l3", "u_ac3", "u_l3", "vac3"],
    "current_r": ["current l1", "current r", "grid current l1", "i_ac1", "i_l1", "iac1"],
    "current_s": ["current l2", "current s", "grid current l2", "i_ac2", "i_l2", "iac2"],
    "current_t": ["current l3", "current t", "grid current l3", "i_ac3", "i_l3", "iac3"],
    "battery_soc": ["battery soc", "soc", "battery capacity percentage"],
    "battery_soh": ["battery soh", "soh"],
    "battery_power": ["battery power", "battery charge/discharge power", "pbat"],
    "battery_voltage": ["battery voltage", "vbat"],
    "battery_current": ["battery current", "ibat"],
    "load_power": ["load power", "home load", "consumption power", "pload"],
    "grid_purchased_today": ["daily grid purchase", "grid purchased today", "buy energy today"],
    "grid_sell_today": ["daily grid sell", "grid sell today", "sell energy today"],
    "load_today": ["daily consumption", "load today", "load energy today"]
}

class FestonAdapter(OemAdapter):
    """
    Solar Assist OEM Adapter for Feston inverters via SolarOS / DeyeCloud API (India Data Center).
    
    Supports OAuth 2.0 Bearer token management, 60-day token auto-refresh,
    normalized plant discovery, inverter telemetry extraction, and alarm synchronization.
    Supports both SolarOS Platform API (https://india.solaros.com) and OpenAPI Gateway.
    """

    def __init__(
        self,
        app_id: Optional[str] = None,
        app_secret: Optional[str] = None,
        api_url: Optional[str] = None,
        platform_url: Optional[str] = None,
        email: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        access_token: Optional[str] = None,
        company_id: Optional[int] = None,
        token_cache_path: Optional[str] = None
    ):
        self.app_id = str(app_id or os.getenv("SOLAROS_APP_ID") or "202610131053002")
        self.app_secret = str(app_secret or os.getenv("SOLAROS_APP_SECRET") or "a7e3f7b5ab36de3103b76b62798ea2d3")
        self.api_url = (api_url or os.getenv("SOLAROS_API_URL") or "https://india-developer.solaros.com").rstrip("/")
        self.platform_url = (platform_url or os.getenv("SOLAROS_PLATFORM_URL") or "https://india.solaros.com").rstrip("/")
        
        super().__init__(key_id=self.app_id, key_secret=self.app_secret, api_url=self.api_url)

        self.email = email or os.getenv("SOLAROS_EMAIL")
        self.username = username or os.getenv("SOLAROS_USERNAME")
        self.password = password or os.getenv("SOLAROS_PASSWORD")
        self.company_id = company_id or (int(os.getenv("SOLAROS_COMPANY_ID")) if os.getenv("SOLAROS_COMPANY_ID") else None)
        
        self.access_token = access_token or os.getenv("SOLAROS_ACCESS_TOKEN")
        self.token_expiry: float = 0.0
        
        # Token cache file on disk
        if token_cache_path:
            self.cache_path = Path(token_cache_path)
        else:
            self.cache_path = Path(__file__).resolve().parent.parent / ".solaros_token_cache.json"

        self._load_cached_token()

    def _load_cached_token(self):
        """Loads non-expired token from disk cache if present."""
        if self.access_token:
            return
            
        try:
            if self.cache_path.exists():
                with open(self.cache_path, "r", encoding="utf-8") as f:
                    cache = json.load(f)
                    
                cached_app_id = cache.get("appId")
                expires_at = cache.get("expiresAt", 0)
                cached_token = cache.get("accessToken")
                
                if cached_app_id == self.app_id and cached_token and expires_at > (time.time() + 300):
                    self.access_token = cached_token
                    self.token_expiry = expires_at
                    logger.info("Loaded valid SolarOS Bearer token from local cache.")
        except Exception as e:
            logger.warning(f"Could not read SolarOS token cache: {e}")

    def _save_cached_token(self, token: str, expires_in: int):
        """Persists newly acquired token to local disk cache."""
        try:
            expires_at = time.time() + expires_in
            self.access_token = token
            self.token_expiry = expires_at
            
            cache_data = {
                "appId": self.app_id,
                "accessToken": token,
                "expiresAt": expires_at,
                "cachedAt": datetime.now(timezone.utc).isoformat()
            }
            with open(self.cache_path, "w", encoding="utf-8") as f:
                json.dump(cache_data, f)
            logger.info(f"Persisted SolarOS Bearer token to local cache (expires in {expires_in}s).")
        except Exception as e:
            logger.warning(f"Could not write SolarOS token cache: {e}")

    def get_access_token(self, force_refresh: bool = False) -> str:
        """
        Retrieves or refreshes OAuth 2.0 Bearer token via /v1.0/account/token.
        """
        now = time.time()
        if not force_refresh and self.access_token and self.token_expiry > (now + 300):
            return self.access_token

        if self.access_token and not force_refresh:
            return self.access_token

        if not self.password or (not self.email and not self.username):
            if self.access_token:
                logger.info("Using configured SolarOS access token.")
                return self.access_token
            raise ValueError(
                "Cannot acquire SolarOS access token: missing account login credentials. "
                "Provide SOLAROS_EMAIL (or SOLAROS_USERNAME) and SOLAROS_PASSWORD, or set SOLAROS_ACCESS_TOKEN."
            )

        url = f"{self.api_url}/v1.0/account/token?appId={self.app_id}"
        sha256_pass = hashlib.sha256(self.password.encode("utf-8")).hexdigest().lower()
        
        payload: Dict[str, Any] = {
            "appSecret": self.app_secret,
            "password": sha256_pass
        }
        if self.email:
            payload["email"] = self.email
        elif self.username:
            payload["username"] = self.username
            
        if self.company_id is not None:
            payload["companyId"] = self.company_id

        logger.info(f"Authenticating with SolarOS API: POST {self.api_url}/v1.0/account/token?appId={self.app_id}")
        response = requests.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=25
        )
        response.raise_for_status()
        res_json = response.json()
        
        if not res_json.get("success") or res_json.get("code") != "1000000":
            err_msg = res_json.get("msg") or "Authentication failed"
            err_code = res_json.get("code")
            logger.error(f"SolarOS token acquisition failed [{err_code}]: {err_msg}")
            raise RuntimeError(f"SolarOS auth failure [{err_code}]: {err_msg}")
            
        token = res_json.get("accessToken")
        expires_in = int(res_json.get("expiresIn") or 5183999)
        self._save_cached_token(token, expires_in)
        return token

    def _call_platform(self, endpoint: str, method: str = "POST", json_dict: Optional[dict] = None, params: Optional[dict] = None) -> dict:
        """Calls the direct SolarOS India platform service (https://india.solaros.com)."""
        token = self.get_access_token()
        url = f"{self.platform_url}{endpoint}"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}"
        }
        for attempt in range(3):
            try:
                if method.upper() == "POST":
                    response = requests.post(url, json=json_dict or {}, params=params, headers=headers, timeout=25)
                else:
                    response = requests.get(url, params=params, headers=headers, timeout=25)
                if response.status_code == 200:
                    return response.json()
            except Exception as e:
                logger.warning(f"Platform call error on {endpoint} (attempt {attempt+1}): {e}")
                time.sleep(1)
        return {"code": "-1", "msg": "Failed"}

    def _call_solaros(self, endpoint: str, body_dict: Optional[dict] = None) -> dict:
        """Calls the SolarOS OpenAPI gateway (https://india-developer.solaros.com)."""
        token = self.get_access_token()
        url = f"{self.api_url}{endpoint}"
        payload = body_dict or {}

        max_retries = 3
        for attempt in range(max_retries):
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}"
            }
            try:
                logger.info(f"SolarOS API Request: POST {url} | Attempt {attempt + 1}")
                response = requests.post(url, json=payload, headers=headers, timeout=25)
                
                if response.status_code == 401:
                    logger.warning("SolarOS returned 401 Unauthorized. Refreshing token and retrying...")
                    token = self.get_access_token(force_refresh=True)
                    continue

                response.raise_for_status()
                res_json = response.json()
                
                if res_json.get("success") is True or res_json.get("code") == "1000000":
                    return res_json
                else:
                    logger.warning(f"SolarOS API error code {res_json.get('code')}: {res_json.get('msg')}")
                    return res_json
            except Exception as e:
                logger.error(f"SolarOS API request error on attempt {attempt + 1}: {e}")
                if attempt == max_retries - 1:
                    return {"code": "-1", "msg": str(e), "success": False}
                time.sleep(1 + attempt)
                
        return {"code": "-1", "msg": "Failed after max retries", "success": False}

    def list_stations(self) -> List[NormalizedStation]:
        """
        Fetches all solar power stations linked to the SolarOS / Feston account.
        Maps to Solar Assist NormalizedStation model.
        """
        stations: List[NormalizedStation] = []
        page = 1
        size = 50

        # Primary: SolarOS India Platform service
        res_platform = self._call_platform("/maintain-s/operating/station/v2/search", method="POST", json_dict={}, params={"page": 1, "size": 100})
        if res_platform.get("total") and res_platform.get("data"):
            for item in res_platform.get("data", []):
                s = item.get("station", {})
                plant_id = str(s.get("id"))
                name = s.get("name") or f"Feston Plant {plant_id}"
                capacity = float(s.get("installedCapacity") or 0.0)
                location = s.get("locationAddress") or "India"
                timezone_str = s.get("regionTimezone") or "Asia/Kolkata"

                raw_time = s.get("startOperatingTime") or s.get("createdDate")
                commissioned_on = None
                if raw_time:
                    try:
                        if isinstance(raw_time, (int, float)):
                            commissioned_on = datetime.fromtimestamp(raw_time, tz=timezone.utc).strftime("%Y-%m-%d")
                        elif isinstance(raw_time, str) and len(raw_time) >= 10:
                            commissioned_on = raw_time[:10]
                    except Exception:
                        commissioned_on = None

                stations.append(NormalizedStation(
                    plant_id=plant_id,
                    name=name,
                    capacity_kwp=capacity,
                    location=location,
                    timezone=timezone_str,
                    commissioned_on=commissioned_on
                ))
            logger.info(f"Discovered {len(stations)} station(s) from SolarOS Platform API.")
            return stations

        # Fallback: OpenAPI Gateway
        fetched_count = 0
        while True:
            res = self._call_solaros("/v1.0/station/list", {"page": page, "size": size})
            if not res.get("success") and res.get("code") != "1000000":
                break
                
            station_list = res.get("stationList", [])
            fetched_count += len(station_list)
            for s in station_list:
                plant_id = str(s.get("id"))
                name = s.get("name") or f"Feston Plant {plant_id}"
                capacity = float(s.get("installedCapacity") or 0.0)
                location = s.get("locationAddress") or "India"
                timezone_str = s.get("regionTimezone") or "Asia/Kolkata"
                
                raw_time = s.get("startOperatingTime") or s.get("createdDate")
                commissioned_on = None
                if raw_time:
                    try:
                        if isinstance(raw_time, (int, float)):
                            commissioned_on = datetime.fromtimestamp(raw_time, tz=timezone.utc).strftime("%Y-%m-%d")
                        elif isinstance(raw_time, str) and len(raw_time) >= 10:
                            commissioned_on = raw_time[:10]
                    except Exception:
                        commissioned_on = None

                stations.append(NormalizedStation(
                    plant_id=plant_id,
                    name=name,
                    capacity_kwp=capacity,
                    location=location,
                    timezone=timezone_str,
                    commissioned_on=commissioned_on
                ))
                
            total = res.get("total", 0)
            if fetched_count >= total or not station_list:
                break
            page += 1

        logger.info(f"Discovered {len(stations)} station(s) from SolarOS account.")
        return stations

    def list_devices(self, plant_id: str) -> List[NormalizedDevice]:
        """
        Fetches all inverter devices associated with a given station from SolarOS.
        Maps to Solar Assist NormalizedDevice model.
        """
        devices: List[NormalizedDevice] = []
        st_id = int(plant_id) if str(plant_id).isdigit() else plant_id

        # Primary: SolarOS India Platform deviceList
        res_platform = self._call_platform("/maintain-s/power/system/deviceList", method="POST", json_dict={"page": 1, "size": 100})
        if res_platform.get("total") is not None and "data" in res_platform:
            for d in res_platform.get("data", []):
                # Filter for this station and inverters only
                if str(d.get("siteId")) == str(st_id) and d.get("deviceType") == "INVERTER":
                    dev_id = str(d.get("deviceId"))
                    sn = str(d.get("deviceSn") or dev_id)
                    model = str(d.get("productId") or "SUN-G Inverter")
                    state = d.get("deviceState", 1)
                    status = "online" if state == 1 else ("alert" if state == 2 else "offline")

                    devices.append(NormalizedDevice(
                        oem_device_id=dev_id,
                        model=model,
                        serial_number=sn,
                        capacity_kw=0.0,
                        string_count=2,
                        status=status,
                        last_seen_at=datetime.now(timezone.utc).isoformat()
                    ))
            logger.info(f"Discovered {len(devices)} inverter device(s) for plant {plant_id} via SolarOS Platform.")
            return devices

        # Fallback: OpenAPI Gateway if platform endpoint is unavailable
        page = 1
        size = 50
        fetched_count = 0
        while True:
            res = self._call_solaros("/v1.0/station/device", {
                "stationIds": [st_id],
                "page": page,
                "size": size
            })
            if not res.get("success") and res.get("code") != "1000000":
                break

            items = res.get("deviceListItems", [])
            fetched_count += len(items)
            for d in items:
                dev_type = str(d.get("deviceType") or "INVERTER").upper()
                if "INVERTER" not in dev_type and dev_type not in ("PCS", "HYBRID"):
                    continue

                sn = str(d.get("deviceSn") or d.get("deviceId"))
                raw_model = d.get("productId") or "Feston Hybrid Inverter"
                connect_status = d.get("connectStatus")
                status = "online" if connect_status == 1 else ("alert" if connect_status == 2 else "offline")

                col_time = d.get("collectionTime")
                if col_time and isinstance(col_time, (int, float)):
                    last_seen = datetime.fromtimestamp(col_time, tz=timezone.utc).isoformat()
                else:
                    last_seen = datetime.now(timezone.utc).isoformat()

                devices.append(NormalizedDevice(
                    oem_device_id=sn,
                    model=raw_model,
                    serial_number=sn,
                    capacity_kw=0.0,
                    string_count=2,
                    status=status,
                    last_seen_at=last_seen
                ))

            total = res.get("total", 0)
            if fetched_count >= total or not items:
                break
            page += 1

        logger.info(f"Discovered {len(devices)} inverter device(s) for plant {plant_id}.")
        return devices

    def _match_metric_value(self, data_list: list, patterns: list) -> Optional[float]:
        """Helper to match and parse numerical metrics by register key patterns."""
        for item in data_list:
            key_name = str(item.get("key", "")).strip().lower()
            val_raw = item.get("value")
            if val_raw is None:
                continue
                
            for pattern in patterns:
                if pattern in key_name:
                    try:
                        return float(val_raw)
                    except (ValueError, TypeError):
                        pass
        return None

    def fetch_telemetry(self, device_id: str) -> Tuple[Optional[NormalizedTelemetry], List[NormalizedStringTelemetry]]:
        """
        Fetches live electrical telemetry and MPPT string channels for a Feston inverter via SolarOS.
        Normalizes registers into standard Solar Assist telemetry schema.
        """
        now_iso = datetime.now(timezone.utc).isoformat()

        # Primary: Direct Platform OriginalData
        try:
            res_orig = self._call_platform(f"/device-s/device/originalData?deviceId={device_id}", method="GET")
        except Exception as e:
            logger.warning(f"Failed to fetch originalData for device {device_id}: {e}")
            res_orig = None
        if isinstance(res_orig, dict) and (res_orig.get("APo_t1") is not None or res_orig.get("PM1_AAC") is not None):
            ac_w = float(res_orig.get("APo_t1") or 0.0)
            ac_kw = ac_w / 1000.0
            daily_kwh = float(res_orig.get("Etdy_ge1") or res_orig.get("t_gc_tdy1") or 0.0)
            total_kwh = float(res_orig.get("t_gc1") or res_orig.get("Et_ge0") or 0.0)
            v1 = float(res_orig.get("AV1") or 0.0)
            i1 = float(res_orig.get("AC1") or 0.0)
            freq = float(res_orig.get("A_Fo1") or 50.0)
            temp = float(res_orig.get("T_AC_RDT1") or res_orig.get("ENV_T0") or 35.0)
            pf = float(res_orig.get("L_A_P_A_R_P") or 1.0)

            # MPPT Strings
            string_telemetries: List[NormalizedStringTelemetry] = []
            dc_sum_w = 0.0
            for idx in range(1, 9):
                dv = float(res_orig.get(f"DV{idx}") or 0.0)
                dc = float(res_orig.get(f"DC{idx}") or 0.0)
                dp = float(res_orig.get(f"DP{idx}") or 0.0)
                if dv > 0.0 or dc > 0.0:
                    dc_sum_w += dp
                    string_telemetries.append(NormalizedStringTelemetry(
                        string_index=idx,
                        voltage_v=round(dv, 2),
                        current_a=round(dc, 2),
                        power_kw=round(dp / 1000.0, 3),
                        status="ok" if (dv > 10.0 and dc > 0.05) else "standby",
                        metrics={"raw_v": dv, "raw_i": dc, "raw_p": dp}
                    ))

            dc_kw = (dc_sum_w / 1000.0) if dc_sum_w > 0 else ac_kw
            eff = round((ac_kw / dc_kw * 100.0), 2) if dc_kw > 0.05 else 98.2
            eff = min(max(eff, 0.0), 100.0)

            telemetry = NormalizedTelemetry(
                timestamp=now_iso,
                ac_power_kw=round(ac_kw, 3),
                dc_power_kw=round(dc_kw, 3),
                energy_kwh=round(total_kwh, 2),
                efficiency_pct=eff,
                temperature_c=round(temp, 1),
                daily_generation_kwh=round(daily_kwh, 2),
                total_generation_kwh=round(total_kwh, 2),
                specific_yield=round(daily_kwh / max(dc_kw, 1.0), 2) if dc_kw > 0 else 0.0,
                online_status=bool(ac_kw > 0.05),
                last_update=now_iso,
                frequency_hz=round(freq, 2),
                power_factor=pf,
                current_r_a=round(i1, 2),
                voltage_r_v=round(v1, 1),
                metrics=res_orig
            )
            return telemetry, string_telemetries

        # Fallback: OpenAPI Gateway
        try:
            res = self._call_solaros("/v1.0/device/latest", {
                "deviceList": [str(device_id)],
                "deviceType": "INVERTER"
            })
        except Exception as e:
            logger.warning(f"Failed OpenAPI fallback fetch for device {device_id}: {e}")
            return None, []
        if not res.get("success") and res.get("code") != "1000000":
            return None, []

        data_list_resp = res.get("deviceDataList", [])
        if not data_list_resp:
            return None, []

        device_data = data_list_resp[0]
        raw_registers = device_data.get("dataList", [])
        col_time = device_data.get("collectionTime")
        timestamp_iso = datetime.fromtimestamp(col_time, tz=timezone.utc).isoformat() if col_time else now_iso

        ac_power = self._match_metric_value(raw_registers, KEY_PATTERNS["ac_power"]) or 0.0
        dc_power = self._match_metric_value(raw_registers, KEY_PATTERNS["dc_power"]) or ac_power
        daily_gen = self._match_metric_value(raw_registers, KEY_PATTERNS["daily_generation"]) or 0.0
        total_gen = self._match_metric_value(raw_registers, KEY_PATTERNS["total_generation"]) or 0.0
        temp = self._match_metric_value(raw_registers, KEY_PATTERNS["temperature"]) or 35.0
        freq = self._match_metric_value(raw_registers, KEY_PATTERNS["frequency"])
        pf = self._match_metric_value(raw_registers, KEY_PATTERNS["power_factor"])
        v_r = self._match_metric_value(raw_registers, KEY_PATTERNS["voltage_r"])
        v_s = self._match_metric_value(raw_registers, KEY_PATTERNS["voltage_s"])
        v_t = self._match_metric_value(raw_registers, KEY_PATTERNS["voltage_t"])
        i_r = self._match_metric_value(raw_registers, KEY_PATTERNS["current_r"])
        i_s = self._match_metric_value(raw_registers, KEY_PATTERNS["current_s"])
        i_t = self._match_metric_value(raw_registers, KEY_PATTERNS["current_t"])
        b_soc = self._match_metric_value(raw_registers, KEY_PATTERNS["battery_soc"])

        raw_metrics_dict = {item.get("key"): {"value": item.get("value"), "unit": item.get("unit")} for item in raw_registers if item.get("key")}
        efficiency = min(max((ac_power / dc_power * 100.0) if (dc_power and dc_power > 0.1) else 98.2, 0.0), 100.0)

        telemetry = NormalizedTelemetry(
            timestamp=timestamp_iso,
            ac_power_kw=ac_power,
            dc_power_kw=dc_power,
            energy_kwh=total_gen,
            efficiency_pct=round(efficiency, 2),
            temperature_c=temp,
            daily_generation_kwh=daily_gen,
            total_generation_kwh=total_gen,
            specific_yield=round(daily_gen / max(dc_power, 1.0), 2) if dc_power > 0 else 0.0,
            online_status=bool(ac_power > 0.05),
            last_update=timestamp_iso,
            frequency_hz=freq,
            power_factor=pf,
            current_r_a=i_r,
            current_s_a=i_s,
            current_t_a=i_t,
            voltage_r_v=v_r,
            voltage_s_v=v_s,
            voltage_t_v=v_t,
            battery_soc_pct=b_soc,
            metrics=raw_metrics_dict
        )

        string_telemetries = []
        for idx in range(1, 17):
            v = self._match_metric_value(raw_registers, [f"pv{idx} voltage", f"pv{idx}_voltage", f"pv {idx} voltage", f"u_pv{idx}"])
            i = self._match_metric_value(raw_registers, [f"pv{idx} current", f"pv{idx}_current", f"pv {idx} current", f"i_pv{idx}"])
            p = self._match_metric_value(raw_registers, [f"pv{idx} power", f"pv{idx}_power", f"pv {idx} power", f"p_pv{idx}"])
            if v is not None or i is not None:
                v_val = max(v or 0.0, 0.0)
                i_val = max(i or 0.0, 0.0)
                p_val = p if p is not None else round((v_val * i_val) / 1000.0, 3)
                string_telemetries.append(NormalizedStringTelemetry(
                    string_index=idx,
                    voltage_v=round(v_val, 2),
                    current_a=round(i_val, 2),
                    power_kw=round(p_val, 3),
                    status="ok" if (v_val > 10.0 and i_val > 0.05) else "standby",
                    metrics={"raw_v": v, "raw_i": i, "raw_p": p}
                ))

        return telemetry, string_telemetries

    def fetch_alerts(self, plant_id: str) -> List[NormalizedAlert]:
        """
        Fetches active alarms and fault alerts for a station via SolarOS.
        Translates raw SolarOS / Deye fault codes into canonical Solar Assist alerts.
        """
        alerts: List[NormalizedAlert] = []
        st_id = int(plant_id) if str(plant_id).isdigit() else plant_id

        # Primary: Platform Alert Search
        res_platform = self._call_platform("/device-s/device/alert/list?order.direction=DESC&order.property=alertTime", method="POST", json_dict={"page": 1, "size": 100})
        if res_platform.get("total") is not None and "data" in res_platform:
            for item in res_platform.get("data", []):
                raw_code = str(item.get("alertCode") or item.get("protocolName") or "")
                alert_name = item.get("alertName") or f"Alert {raw_code}"
                device_sn = item.get("deviceSn") or ""
                start_time = item.get("alertStartTime")
                triggered_at = datetime.fromtimestamp(start_time, tz=timezone.utc).isoformat() if start_time else datetime.now(timezone.utc).isoformat()
                translated = translate_alert("feston", raw_code, alert_name)

                desc = translated.get("description", "")
                if device_sn:
                    desc = f"(Device SN: {device_sn}) {desc}"

                alerts.append(NormalizedAlert(
                    code=raw_code or alert_name,
                    title=translated.get("title", alert_name),
                    description=desc,
                    severity=translated.get("severity", "medium"),
                    triggered_at=triggered_at,
                    alarm_code=raw_code or "FESTON_ALARM",
                    oem="feston",
                    category=translated.get("category", "inverter"),
                    is_auto_resolvable=translated.get("is_auto_resolvable", False),
                    requires_technician=translated.get("requires_technician", True),
                    recommended_action=translated.get("recommended_action", "Inspect inverter operational display.")
                ))
            return alerts

        # Fallback: OpenAPI Alert List
        now_ts = int(time.time())
        start_ts = now_ts - (30 * 86400)
        res = self._call_solaros("/v1.0/station/alertList", {
            "stationId": st_id,
            "startTimestamp": start_ts,
            "endTimestamp": now_ts,
            "page": 1,
            "size": 100
        })

        if not res.get("success") and res.get("code") != "1000000":
            return alerts

        for item in res.get("stationAlertItems", []):
            if item.get("status") == 0:
                continue
            raw_code = str(item.get("alertCode") or item.get("protocolName") or "")
            alert_name = item.get("alertName") or f"Alert {raw_code}"
            device_sn = item.get("deviceSn") or ""
            start_time = item.get("alertStartTime")
            triggered_at = datetime.fromtimestamp(start_time, tz=timezone.utc).isoformat() if start_time else datetime.now(timezone.utc).isoformat()
            translated = translate_alert("feston", raw_code, alert_name)

            desc = translated.get("description", "")
            if device_sn:
                desc = f"(Device SN: {device_sn}) {desc}"

            alerts.append(NormalizedAlert(
                code=raw_code or alert_name,
                title=translated.get("title", alert_name),
                description=desc,
                severity=translated.get("severity", "medium"),
                triggered_at=triggered_at,
                alarm_code=raw_code or "FESTON_ALARM",
                oem="feston",
                category=translated.get("category", "inverter"),
                is_auto_resolvable=translated.get("is_auto_resolvable", False),
                requires_technician=translated.get("requires_technician", True),
                recommended_action=translated.get("recommended_action", "Inspect inverter operational display.")
            ))

        return alerts
