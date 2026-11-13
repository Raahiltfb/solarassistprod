import time
import json
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

KNOWN_SURYALOGIX_PLANTS: Dict[str, Dict[str, Any]] = {
    "VlpaWHZFU2ZtWE00YlFJMDZHQTlVdXUvdkMvWjM4c2oxNFlXVWJ3MnV4Yz0=": {
        "name": "OMYA Inoj Car Port",
        "token": "VlpaWHZFU2ZtWE00YlFJMDZHQTlVdXUvdkMvWjM4c2oxNFlXVWJ3MnV4Yz0=",
        "capacity_kwp": 100.0,
    },
    "RG9SK3RPbC8yV0o1ODR4U3kzZ2ZIaGF3ZDdPUTdhODF5d2xkL3ZJYW4rcz0=": {
        "name": "OMYA Inoj Stockpile",
        "token": "RG9SK3RPbC8yV0o1ODR4U3kzZ2ZIaGF3ZDdPUTdhODF5d2xkL3ZJYW4rcz0=",
        "capacity_kwp": 500.0,
    },
    "dHVSQWF5TVZoUHF3UmlZS2trUTk5b2YzN2Y2VGcyN2dvQktTMGU0SU5xQT0=": {
        "name": "OMYA Inoj Warehouse",
        "token": "dHVSQWF5TVZoUHF3UmlZS2trUTk5b2YzN2Y2VGcyN2dvQktTMGU0SU5xQT0=",
        "capacity_kwp": 300.0,
    },
}

class SuryalogixAdapter(OemAdapter):
    def __init__(
        self,
        secret: str = "cd8ae85e44e2ca7d997904893f8fb7fe",
        api_url: str = "https://cloud.suryalog.ae/api/get_datalog_v7.php",
        plants: Optional[List[Dict[str, Any]]] = None,
    ):
        super().__init__(key_id="suryalogix", key_secret=secret, api_url=api_url)
        self.secret = secret
        self.api_url = api_url
        if plants:
            self.plant_tokens = [p.get("token") or p.get("plant_id") for p in plants if p.get("token") or p.get("plant_id")]
        else:
            self.plant_tokens = list(KNOWN_SURYALOGIX_PLANTS.keys())
        self._cache: Dict[str, Tuple[float, Any]] = {}
        self._last_call_time = 0.0

    def _rate_paced_fetch(self, payload: dict) -> dict:
        min_interval = 2.5
        elapsed = time.time() - self._last_call_time
        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)
        self._last_call_time = time.time()

        resp = requests.post(self.api_url, json=payload, headers={"Content-Type": "application/json"}, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def _fetch_plant_data(self, plant_token: str) -> Optional[dict]:
        cached = self._cache.get(plant_token)
        if cached and (time.time() - cached[0] < 60.0):
            return cached[1]

        now = int(time.time())
        payload = {
            "secret": self.secret,
            "plant": plant_token,
            "format": "std",
            "for": "data",
            "stime": str(now - 7200),
            "etime": str(now),
        }

        res = self._rate_paced_fetch(payload)
        if res.get("result") != 0:
            print(f"[Suryalogix] Warning for plant {plant_token}: {res.get('cmsg')} (code: {res.get('result')})")
            return None

        data = res.get("data")
        self._cache[plant_token] = (time.time(), data)
        return data

    def list_stations(self) -> List[NormalizedStation]:
        stations = []
        for token in self.plant_tokens:
            known = KNOWN_SURYALOGIX_PLANTS.get(token)
            stations.append(
                NormalizedStation(
                    plant_id=token,
                    name=known["name"] if known else f"Suryalogix Plant {token[:8]}",
                    capacity_kwp=known["capacity_kwp"] if known else 100.0,
                    location="India",
                    timezone="Asia/Kolkata",
                    commissioned_on="2024-01-01",
                )
            )
        return stations

    def list_devices(self, plant_id: str) -> List[NormalizedDevice]:
        data = self._fetch_plant_data(plant_id)
        if not data or not isinstance(data, dict):
            return []

        timestamps = sorted(data.keys())
        if not timestamps:
            return []
        latest_ts = timestamps[-1]
        entry = data[latest_ts]
        inverters = entry.get("inverter", {})

        devices = []
        for inv_id, inv in inverters.items():
            ac_cap = float(inv.get("AC_CAP") or 50.0)
            serial_number = inv.get("SL_NO") or f"{plant_id}_{inv_id}"
            ac_power = float(inv.get("WT") or 0) / 1000.0
            dc_power = float(inv.get("DC_W") or 0) / 1000.0
            inv_status = inv.get("inverter_status")
            is_online = (inv_status == 4) or (ac_power > 0) or (dc_power > 0)

            # Count MPPTs
            string_count = sum(1 for i in range(1, 13) if float(inv.get(f"MPP_V{i}") or 0) > 0 or float(inv.get(f"MPP_I{i}") or 0) > 0)
            if string_count == 0:
                string_count = 4

            iso_time = datetime.fromtimestamp(int(latest_ts), tz=timezone.utc).isoformat()

            devices.append(
                NormalizedDevice(
                    oem_device_id=f"{plant_id}#{inv_id}",
                    model=inv.get("inverter_type") or inv_id,
                    serial_number=serial_number,
                    capacity_kw=ac_cap,
                    string_count=string_count,
                    status="online" if is_online else ("fault" if inv_status == 5 else "online"),
                    last_seen_at=datetime.now(timezone.utc).isoformat(),
                    installed_on="2024-01-01",
                )
            )
        return devices

    def fetch_telemetry(self, device_id: str) -> Tuple[Optional[NormalizedTelemetry], List[NormalizedStringTelemetry]]:
        parts = device_id.split("#")
        plant_id = parts[0]
        inv_id = parts[1] if len(parts) > 1 else "I1"

        data = self._fetch_plant_data(plant_id)
        if not data or not isinstance(data, dict):
            return None, []

        timestamps = sorted(data.keys())
        if not timestamps:
            return None, []
        latest_ts = timestamps[-1]
        entry = data[latest_ts]
        inv = entry.get("inverter", {}).get(inv_id)

        if not inv:
            return None, []

        ac_power_kw = float(inv.get("WT") or 0) / 1000.0
        dc_power_kw = float(inv.get("DC_W") or 0) / 1000.0
        ac_cap = float(inv.get("AC_CAP") or 50.0)
        daily_kwh_raw = float(inv.get("KWH_Day") or (float(inv.get("WHDay") or 0) / 1000.0))
        # Solar sanity check: daily generation cannot exceed 12 kWh/kWp (e.g. 600 kWh for a 50 kW inverter)
        daily_kwh = daily_kwh_raw if (0 < daily_kwh_raw <= max(ac_cap * 12.0, 600.0)) else 0.0
        total_kwh = float(inv.get("WHTot") or 0)
        specific_yield = (daily_kwh / ac_cap) if ac_cap > 0 else 0.0
        temp_c = float(inv.get("TEMP_HS") or inv.get("TEMP_INT") or 35.0)
        inv_status = inv.get("inverter_status")
        is_online = (inv_status == 4) or (ac_power_kw > 0) or (dc_power_kw > 0)
        efficiency = min(100.0, max(0.0, (ac_power_kw / dc_power_kw) * 100.0)) if dc_power_kw > 0 else (97.0 if is_online else 0.0)
        iso_time = datetime.fromtimestamp(int(latest_ts), tz=timezone.utc).isoformat()

        addon = inv.get("ADDON_DATA") if isinstance(inv.get("ADDON_DATA"), dict) else {}

        telemetry = NormalizedTelemetry(
            timestamp=iso_time,
            ac_power_kw=ac_power_kw,
            dc_power_kw=dc_power_kw,
            energy_kwh=total_kwh,
            efficiency_pct=efficiency,
            temperature_c=temp_c,
            daily_generation_kwh=daily_kwh,
            total_generation_kwh=total_kwh,
            specific_yield=specific_yield,
            online_status=is_online,
            last_update=iso_time,
            frequency_hz=float(inv.get("FREQ") or 50.0),
            power_factor=float(inv.get("PFT") or 1.0),
            reactive_power_kvar=float(inv.get("VART") or 0) / 1000.0,
            apparent_power_kva=float(inv.get("VAT") or 0) / 1000.0,
            voltage_r_v=float(addon.get("V1") or inv.get("VT") or 0) or None,
            voltage_s_v=float(addon.get("V2") or inv.get("VT") or 0) or None,
            voltage_t_v=float(addon.get("V3") or inv.get("VT") or 0) or None,
            current_r_a=float(addon.get("I1") or (float(inv.get("IT") or 0) / 3.0)) or None,
            current_s_a=float(addon.get("I2") or (float(inv.get("IT") or 0) / 3.0)) or None,
            current_t_a=float(addon.get("I3") or (float(inv.get("IT") or 0) / 3.0)) or None,
            metrics={
                "raw_suryalog_status": inv.get("suryalog_status"),
                "raw_inverter_status": inv_status,
                "run_hours": inv.get("RUN_HOURS"),
                "temp_int": inv.get("TEMP_INT"),
                "temp_hs": inv.get("TEMP_HS"),
                "day_pr": inv.get("Day_PR"),
                "w1": inv.get("W1"),
                "w2": inv.get("W2"),
                "w3": inv.get("W3"),
            },
        )

        string_telemetries = []
        mpp_idx = 1
        for i in range(1, 13):
            v = float(inv.get(f"MPP_V{i}") or 0)
            c = float(inv.get(f"MPP_I{i}") or 0)
            w = float(inv.get(f"MPP_W{i}") or (v * c))
            if v > 10.0 or c > 0.05 or w > 10.0:
                p_kw = w / 1000.0
                string_telemetries.append(
                    NormalizedStringTelemetry(
                        string_index=mpp_idx,
                        voltage_v=v,
                        current_a=c,
                        power_kw=p_kw,
                        status="normal" if p_kw > 0.05 else ("low_current" if v > 20.0 else "offline"),
                        metrics={"mppt_channel": i, "raw_w": w},
                    )
                )
                mpp_idx += 1

        if not string_telemetries and entry.get("smb"):
            for smb in entry["smb"].values():
                smb_v = float(smb.get("V") or inv.get("DC_V") or 0)
                for s in range(1, 19):
                    s_i = float(smb.get(f"I{s}") or 0)
                    if s_i > 0.05 or smb_v > 50:
                        s_kw = (smb_v * s_i) / 1000.0
                        string_telemetries.append(
                            NormalizedStringTelemetry(
                                string_index=s,
                                voltage_v=smb_v,
                                current_a=s_i,
                                power_kw=s_kw,
                                status="normal" if s_kw > 0.05 else ("low_current" if smb_v > 20.0 else "offline"),
                                metrics={"smb_channel": s},
                            )
                        )

        return telemetry, string_telemetries

    def fetch_alerts(self, plant_id: str) -> List[NormalizedAlert]:
        try:
            from alarm_mappings import translate_alert
        except ImportError:
            from backend.alarm_mappings import translate_alert

        data = self._fetch_plant_data(plant_id)
        if not data or not isinstance(data, dict):
            return []

        timestamps = sorted(data.keys())
        if not timestamps:
            return []
        latest_ts = timestamps[-1]
        entry = data[latest_ts]
        inverters = entry.get("inverter", {})
        iso_time = datetime.fromtimestamp(int(latest_ts), tz=timezone.utc).isoformat()

        alerts = []
        for inv_id, inv in inverters.items():
            inv_status = int(inv.get("inverter_status") or 0)
            suryalog_status = int(inv.get("suryalog_status") or 0)
            temp_hs = float(inv.get("TEMP_HS") or 0)

            if suryalog_status == 0:
                tr = translate_alert("suryalogix", "ERR_COMM_DOWN", "Inverter Communication Lost")
                alerts.append(
                    NormalizedAlert(
                        code="ERR_COMM_DOWN",
                        title=tr["title"],
                        description=f"Inverter {inv_id} lost communication with logger.",
                        severity=tr["severity"],
                        triggered_at=iso_time,
                        alarm_code="ERR_COMM_DOWN",
                        oem="suryalogix",
                        category=tr["category"],
                        is_auto_resolvable=tr["is_auto_resolvable"],
                        requires_technician=tr["requires_technician"],
                        recommended_action=tr["recommended_action"],
                    )
                )

            if inv_status == 5:
                tr = translate_alert("suryalogix", "INV_STATUS_FAULT", "Inverter General Fault")
                alerts.append(
                    NormalizedAlert(
                        code="INV_STATUS_FAULT",
                        title=tr["title"],
                        description=f"Inverter {inv_id} tripped into fault state.",
                        severity=tr["severity"],
                        triggered_at=iso_time,
                        alarm_code="INV_STATUS_FAULT",
                        oem="suryalogix",
                        category=tr["category"],
                        is_auto_resolvable=tr["is_auto_resolvable"],
                        requires_technician=tr["requires_technician"],
                        recommended_action=tr["recommended_action"],
                    )
                )

            if inv_status == 6:
                tr = translate_alert("suryalogix", "INV_STATUS_DERATING", "Inverter Thermal or Power Derating")
                alerts.append(
                    NormalizedAlert(
                        code="INV_STATUS_DERATING",
                        title=tr["title"],
                        description=f"Inverter {inv_id} operating under active power derating.",
                        severity=tr["severity"],
                        triggered_at=iso_time,
                        alarm_code="INV_STATUS_DERATING",
                        oem="suryalogix",
                        category=tr["category"],
                        is_auto_resolvable=tr["is_auto_resolvable"],
                        requires_technician=tr["requires_technician"],
                        recommended_action=tr["recommended_action"],
                    )
                )

            if temp_hs > 80:
                tr = translate_alert("suryalogix", "OVER_TEMP", "Heatsink / Cabinet Over Temperature")
                alerts.append(
                    NormalizedAlert(
                        code="OVER_TEMP",
                        title=tr["title"],
                        description=f"Inverter {inv_id} heatsink temperature is {temp_hs}°C (> 80°C threshold).",
                        severity=tr["severity"],
                        triggered_at=iso_time,
                        alarm_code="OVER_TEMP",
                        oem="suryalogix",
                        category=tr["category"],
                        is_auto_resolvable=tr["is_auto_resolvable"],
                        requires_technician=tr["requires_technician"],
                        recommended_action=tr["recommended_action"],
                    )
                )

        return alerts

