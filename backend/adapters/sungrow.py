import time
import requests
from datetime import datetime, timezone
from typing import List, Tuple, Optional, Dict, Any

from .base import (
    OemAdapter,
    NormalizedStation,
    NormalizedDevice,
    NormalizedTelemetry,
    NormalizedStringTelemetry,
    NormalizedAlert,
)

class SungrowAdapter(OemAdapter):
    def __init__(
        self,
        app_key: str = "B3500A80C94EADF9C52E01D7790A96DD",
        secret_key: str = "k2a5vg8w7qdua4nqet6rsspnrhsmr3in",
        rsa_public_key: str = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDoFf8y0HkNSRf4zNRVRW9NbTBiQ1uFPJcSCVx_D33yhb1vCoI9BrS_KpcXm4ATIJ5ogFptKuYOmVqgEda8jMmFplBGcsiLL_EJ-6d0TUoPwFddMr7shd51Y-vbel-Aqjmr-ShL7NbHLN_J0RrWDFW4ga0c1oVxY5IFWRHwFDMVAQIDAQAB",
        api_url: str = "https://gateway.isolarcloud.in",
        token: Optional[str] = None,
        user_account: Optional[str] = None,
        user_password: Optional[str] = None,
    ):
        super().__init__(key_id=app_key, key_secret=secret_key, api_url=api_url)
        self.app_key = app_key
        self.secret_key = secret_key
        self.rsa_public_key = rsa_public_key
        self.api_url = api_url.rstrip("/")
        self.token = token
        self.user_account = user_account
        self.user_password = user_password

    def login(self) -> Optional[str]:
        if not self.user_account or not self.user_password:
            return None
        headers = {
            "Content-Type": "application/json;charset=UTF-8",
            "appkey": self.app_key,
            "sys_code": "901",
            "x-access-key": self.secret_key,
        }
        body = {
            "appkey": self.app_key,
            "sys_code": "901",
            "user_account": self.user_account,
            "user_password": self.user_password,
        }
        try:
            resp = requests.post(f"{self.api_url}/openapi/login", json=body, headers=headers, timeout=20)
            resp.raise_for_status()
            data = resp.json()
            if data.get("result_code") == "1" and data.get("result_data"):
                self.token = data["result_data"].get("token")
                return self.token
        except Exception as e:
            print(f"[Sungrow] Login failed: {e}")
        return None

    def _call_sungrow(self, path: str, body: Optional[dict] = None) -> Optional[dict]:
        if not self.token:
            self.login()
        headers = {
            "Content-Type": "application/json;charset=UTF-8",
            "appkey": self.app_key,
            "sys_code": "901",
            "token": self.token or "",
            "x-access-key": self.secret_key,
        }
        payload = {
            "appkey": self.app_key,
            "token": self.token,
            **(body or {}),
        }
        try:
            resp = requests.post(f"{self.api_url}{path}", json=payload, headers=headers, timeout=20)
            resp.raise_for_status()
            data = resp.json()
            if data.get("result_code") in ("002", "E900") and self.user_account:
                # Token expired, retry login once
                if self.login():
                    headers["token"] = self.token or ""
                    payload["token"] = self.token
                    resp = requests.post(f"{self.api_url}{path}", json=payload, headers=headers, timeout=20)
                    resp.raise_for_status()
                    return resp.json()
            return data
        except Exception as e:
            print(f"[Sungrow] Exception calling {path}: {e}")
            return None

    def list_stations(self) -> List[NormalizedStation]:
        res = self._call_sungrow("/openapi/getPowerStationList", {"curPage": 1, "size": 50})
        if not res or not res.get("result_data"):
            return []
        items = res["result_data"].get("pageList") or []
        stations = []
        for it in items:
            stations.append(
                NormalizedStation(
                    plant_id=str(it.get("ps_id") or it.get("id") or ""),
                    name=str(it.get("ps_name") or it.get("name") or "Sungrow Plant"),
                    capacity_kwp=float((it.get("total_capcity") or {}).get("value") or it.get("installed_power") or it.get("capacity") or 500.0),
                    location=str(it.get("ps_location") or it.get("address") or "India"),
                    timezone="Asia/Kolkata",
                    commissioned_on=str(it.get("grid_connection_date"))[:10] if it.get("grid_connection_date") else None,
                )
            )
        return stations

    def list_devices(self, plant_id: str) -> List[NormalizedDevice]:
        res = self._call_sungrow("/openapi/getDeviceList", {"ps_id": int(plant_id) if str(plant_id).isdigit() else plant_id, "device_type": 1, "size": 50})
        if not res or not res.get("result_data"):
            return []
        items = res["result_data"].get("pageList") or []
        devices = []
        for d in items:
            # Only include active inverter records
            if d.get("device_type") != 1 or d.get("rel_state") == 0 or not d.get("device_sn"):
                continue
            dev_id = str(d.get("ps_key") or d.get("uuid") or d.get("device_id") or "")
            model_code = str(d.get("device_model_code") or d.get("device_model") or "Sungrow Inverter")
            cap = 125.0 if "125" in model_code else (110.0 if "110" in model_code else (100.0 if "100" in model_code else float(d.get("device_power") or 100.0)))
            dev_status = str(d.get("dev_status") or d.get("device_status") or "")
            is_online = dev_status == "1" or dev_status.lower() == "online"

            devices.append(
                NormalizedDevice(
                    oem_device_id=dev_id,
                    model=model_code,
                    serial_number=str(d.get("device_sn") or dev_id),
                    capacity_kw=cap,
                    string_count=8,
                    status="online" if is_online else "offline",
                    last_seen_at=datetime.now(timezone.utc).isoformat(),
                    installed_on=str(d.get("grid_connection_date") or d.get("install_date") or "2024-07-16")[:10],
                )
            )
        return devices

    def fetch_telemetry(self, device_id: str) -> Tuple[Optional[NormalizedTelemetry], List[NormalizedStringTelemetry]]:
        ps_id = int(device_id.split("_")[0]) if "_" in device_id and device_id.split("_")[0].isdigit() else 1376094
        res = self._call_sungrow(
            "/openapi/getDeviceRealTimeData",
            {
                "ps_id": ps_id,
                "device_type": 1,
                "ps_key_list": [device_id],
                "point_id_list": ["83001", "83002", "83003", "83004", "83005", "83006", "83020", "83022", "83025", "83026", "83027", "83028", "83029", "p83020", "p83022", "p83025"]
            }
        )
        if not res or not res.get("result_data"):
            return None, []
        dev_list = res["result_data"].get("device_point_list") or []
        if not dev_list:
            return None, []
        d = dev_list[0].get("device_point") or {}

        ac_power_kw = float(d.get("p83022") or d.get("p_active") or 0.0)
        dc_power_kw = float(d.get("p83020") or d.get("p_dc") or 0.0)
        daily_kwh = float(d.get("p83025") or d.get("e_today") or 0.0)
        total_kwh = float(d.get("p83026") or d.get("e_total") or 0.0)
        temp_c = float(d.get("p83027") or d.get("temp") or 35.0)
        is_online = (ac_power_kw > 0) or (dc_power_kw > 0) or (d.get("device_status") == 1)
        efficiency = min(100.0, max(0.0, (ac_power_kw / dc_power_kw) * 100.0)) if dc_power_kw > 0 else (98.0 if is_online else 0.0)
        iso_time = datetime.now(timezone.utc).isoformat()

        telemetry = NormalizedTelemetry(
            timestamp=iso_time,
            ac_power_kw=ac_power_kw,
            dc_power_kw=dc_power_kw,
            energy_kwh=total_kwh,
            efficiency_pct=efficiency,
            temperature_c=temp_c,
            daily_generation_kwh=daily_kwh,
            total_generation_kwh=total_kwh,
            specific_yield=0.0,
            online_status=is_online,
            last_update=iso_time,
            frequency_hz=float(d.get("p83028") or 50.0),
            power_factor=float(d.get("p83029") or 1.0),
            voltage_r_v=float(d.get("p83001") or 0) or None,
            voltage_s_v=float(d.get("p83002") or 0) or None,
            voltage_t_v=float(d.get("p83003") or 0) or None,
            current_r_a=float(d.get("p83004") or 0) or None,
            current_s_a=float(d.get("p83005") or 0) or None,
            current_t_a=float(d.get("p83006") or 0) or None,
            metrics=d,
        )

        string_telemetries = []
        for i in range(1, 9):
            v = float(d.get(f"p8303{i}_v") or d.get(f"pv{i}_voltage") or 0.0)
            c = float(d.get(f"p8303{i}_i") or d.get(f"pv{i}_current") or 0.0)
            if v > 10.0 or c > 0.05:
                p_kw = (v * c) / 1000.0
                string_telemetries.append(
                    NormalizedStringTelemetry(
                        string_index=i,
                        voltage_v=v,
                        current_a=c,
                        power_kw=p_kw,
                        status="normal" if p_kw > 0.05 else "low_current",
                        metrics={"string": i},
                    )
                )

        return telemetry, string_telemetries

    def fetch_alerts(self, plant_id: str) -> List[NormalizedAlert]:
        try:
            from alarm_mappings import translate_alert
        except ImportError:
            from backend.alarm_mappings import translate_alert

        res = self._call_sungrow("/openapi/getFaultList", {"ps_id": plant_id})
        if not res or not res.get("result_data"):
            return []
        items = res["result_data"].get("faultList") or []
        iso_time = datetime.now(timezone.utc).isoformat()

        alerts = []
        for item in items:
            raw_code = str(item.get("fault_code") or item.get("alarm_code") or "FAULT_UNKNOWN")
            code_key = raw_code if raw_code.startswith("FAULT_") else f"FAULT_{raw_code}"
            default_title = str(item.get("fault_name") or f"Sungrow Fault {raw_code}")
            tr = translate_alert("sungrow", code_key, default_title)

            alerts.append(
                NormalizedAlert(
                    code=code_key,
                    title=tr["title"],
                    description=tr["description"],
                    severity=tr["severity"],
                    triggered_at=str(item.get("fault_time")) if item.get("fault_time") else iso_time,
                    alarm_code=raw_code,
                    oem="sungrow",
                    category=tr["category"],
                    is_auto_resolvable=tr["is_auto_resolvable"],
                    requires_technician=tr["requires_technician"],
                    recommended_action=tr["recommended_action"],
                )
            )
        return alerts

