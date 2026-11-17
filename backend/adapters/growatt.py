import os
import time
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Tuple, Optional, Dict, Any
import requests

from .base import (
    OemAdapter,
    NormalizedStation,
    NormalizedDevice,
    NormalizedTelemetry,
    NormalizedStringTelemetry,
    NormalizedAlert,
)
from alarm_mappings.base import translate_alert

logger = logging.getLogger(__name__)

IST_TZ = timezone(timedelta(hours=5, minutes=30))

GROWATT_KNOWN_PLANT_DEVICES: Dict[str, List[Dict[str, Any]]] = {
    "2119971": [{"device_sn": "BBJQEXU00E", "datalogger_sn": "XGD6DC36PM", "model_label": "Growatt MID 30KTL3-X", "capacity_kw": 30.0, "string_count": 3, "installed_on": "2023-07-01"}],
    "2474503": [{"device_sn": "VQHGD5C013", "datalogger_sn": "XGD6D4T1PB", "model_label": "Growatt MOD 15KTL3-X", "capacity_kw": 15.0, "string_count": 2, "installed_on": "2023-12-27"}],
    "2474541": [{"device_sn": "VGHGD6D01A", "datalogger_sn": "XGD6D660A9", "model_label": "Growatt MOD 8000TL3-X", "capacity_kw": 8.0, "string_count": 1, "installed_on": "2024-02-16"}],
    "2474589": [{"device_sn": "VQHGD5C01E", "datalogger_sn": "XGD6D4T1VQ", "model_label": "Growatt MOD 15KTL3-X", "capacity_kw": 15.0, "string_count": 2, "installed_on": "2024-01-28"}],
    "2474616": [{"device_sn": "VJHJD7403W", "datalogger_sn": "XGD6D6E0TH", "model_label": "Growatt MOD 10KTL3-X", "capacity_kw": 10.0, "string_count": 2, "installed_on": "2024-01-17"}],
    "2474705": [{"device_sn": "VQHGD5C002", "datalogger_sn": "XGD6D4T1TY", "model_label": "Growatt MOD 15KTL3-X", "capacity_kw": 15.0, "string_count": 2, "installed_on": "2023-12-27"}],
    "2474727": [{"device_sn": "VGHGD6D005", "datalogger_sn": "XGD6D660FD", "model_label": "Growatt MOD 8000TL3-X", "capacity_kw": 8.0, "string_count": 1, "installed_on": "2024-01-17"}],
    "2474815": [{"device_sn": "VQHGD5C00W", "datalogger_sn": "XGD6D66030", "model_label": "Growatt MOD 15KTL3-X", "capacity_kw": 15.0, "string_count": 2, "installed_on": "2024-01-17"}],
    "2474834": [{"device_sn": "VGHGD6D00R", "datalogger_sn": "XGD6D4T1N3", "model_label": "Growatt MOD 8000TL3-X", "capacity_kw": 8.0, "string_count": 1, "installed_on": "2024-01-17"}],
    "9284500": [{"device_sn": "CJJLE5K036", "datalogger_sn": "XGD6E4T0UT", "model_label": "Growatt MID 20KTL3-X", "capacity_kw": 20.0, "string_count": 2, "installed_on": "2024-10-10"}],
    "9284570": [{"device_sn": "CLJLE5S04H", "datalogger_sn": "XGD6E5F0FZ", "model_label": "Growatt MID 25KTL3-X", "capacity_kw": 25.0, "string_count": 2, "installed_on": "2024-10-10"}],
    "2535180": [{"device_sn": "EAJFCM3018", "datalogger_sn": "XGD5BGA166", "model_label": "Growatt MOD 12KTL3-X", "capacity_kw": 12.0, "string_count": 2, "installed_on": "2024-03-13"}],
    "9222060": [{"device_sn": "VEH3BKM015", "datalogger_sn": "XGD6E4N0CD", "model_label": "Growatt MOD 6000TL3-X", "capacity_kw": 6.0, "string_count": 2, "installed_on": "2024-09-05"}],
    "9242320": [{"device_sn": "VEH3BJU0MG", "datalogger_sn": "XGD5BJH4MB", "model_label": "Growatt MOD 6000TL3-X", "capacity_kw": 6.0, "string_count": 2, "installed_on": "2024-08-06"}],
    "9307075": [{"device_sn": "CLJLE5S01Q", "datalogger_sn": "XGD6E5F0FT", "model_label": "Growatt MID 25KTL3-X", "capacity_kw": 25.0, "string_count": 2, "installed_on": "2024-10-23"}],
    "10107853": [],
}


def parse_growatt_ist_timestamp(raw_time: Optional[str]) -> str:
    if not raw_time:
        return datetime.now(timezone.utc).isoformat()
    s = str(raw_time).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            dt = datetime.strptime(s, fmt).replace(tzinfo=IST_TZ)
            return dt.astimezone(timezone.utc).isoformat()
        except ValueError:
            continue
    return datetime.now(timezone.utc).isoformat()


class GrowattAdapter(OemAdapter):
    def __init__(self, token: Optional[str] = None, api_url: Optional[str] = None):
        self.token = token or os.environ.get("GROWATT_TOKEN") or "0vlcyi6371401rzl2nfy322i2iz6fb05"
        self.api_url = (api_url or os.environ.get("GROWATT_API_URL") or "https://openapi.growatt.com/v1").rstrip("/")
        super().__init__(self.token, "", self.api_url)
        self.batch_telemetry_cache: Dict[str, Dict[str, Any]] = {}
        self.plant_status_cache: Dict[str, int] = {}
        self._batch_fetched = False

    def _request(self, path: str, method: str = "GET", data: Optional[Dict[str, str]] = None) -> Optional[Dict[str, Any]]:
        url = f"{self.api_url}/{path.lstrip('/')}"
        headers = {"token": self.token}
        for attempt in range(4):
            try:
                if method == "POST":
                    resp = requests.post(url, headers=headers, data=data, timeout=20)
                else:
                    resp = requests.get(url, headers=headers, timeout=20)
                if resp.status_code != 200:
                    return None
                js = resp.json()
                if js.get("error_code") == 10012 and attempt < 3:
                    time.sleep(2.5 * (attempt + 1))
                    continue
                return js
            except Exception as e:
                logger.warning(f"[GrowattAdapter] {method} {path} error: {e}")
                if attempt < 3:
                    time.sleep(1.5)
        return None

    def _ensure_batch_telemetry(self):
        if self._batch_fetched:
            return
        self._batch_fetched = True
        all_sns = [d["device_sn"] for devs in GROWATT_KNOWN_PLANT_DEVICES.values() for d in devs if d.get("device_sn")]
        if not all_sns:
            return
        res = self._request("/device/inverter/invs_data", method="POST", data={
            "inverters": ",".join(all_sns),
            "pageNum": "1"
        })
        if res and res.get("error_code") == 0 and isinstance(res.get("data"), dict):
            for sn in all_sns:
                outer = res["data"].get(sn) or {}
                inner = outer.get(sn) if isinstance(outer, dict) and sn in outer else outer
                if isinstance(inner, dict):
                    inner["dataloggerSn"] = outer.get("dataloggerSn", "")
                    self.batch_telemetry_cache[sn] = inner

    def list_stations(self) -> List[NormalizedStation]:
        self._ensure_batch_telemetry()
        res = self._request("/plant/list", method="GET")
        plants = (res or {}).get("data", {}).get("plants", []) or []
        out: List[NormalizedStation] = []
        for p in plants:
            pid = str(p.get("plant_id", ""))
            self.plant_status_cache[pid] = int(p.get("status", 1))
            city = str(p.get("city") or "").strip()
            country = str(p.get("country") or "India").strip()
            loc = f"{city}, Maharashtra, {country}" if city else f"Maharashtra, {country}"
            out.append(
                NormalizedStation(
                    plant_id=pid,
                    name=str(p.get("name") or f"Growatt Plant {pid}").strip(),
                    capacity_kwp=round(float(p.get("peak_power") or 10.0), 2),
                    location=loc,
                    timezone="Asia/Kolkata",
                    commissioned_on=str(p.get("create_date") or "2024-01-17")[:10],
                )
            )
        return out

    def list_devices(self, plant_id: str) -> List[NormalizedDevice]:
        self._ensure_batch_telemetry()
        pid = str(plant_id)
        plant_status = self.plant_status_cache.get(pid, 1)
        known = GROWATT_KNOWN_PLANT_DEVICES.get(pid, [])
        out: List[NormalizedDevice] = []
        for dev in known:
            sn = dev["device_sn"]
            live = self.batch_telemetry_cache.get(sn, {})
            last_seen = parse_growatt_ist_timestamp(live.get("time")) if live.get("time") else "1970-01-01T00:00:00Z"
            try:
                dt = datetime.fromisoformat(last_seen.replace("Z", "+00:00"))
                diff_mins = (datetime.now(timezone.utc) - dt).total_seconds() / 60.0
            except Exception:
                diff_mins = 999999.0

            is_offline = plant_status == 4 or diff_mins > 14 * 60 or live.get("status") == -1
            is_fault = not is_offline and (
                live.get("status") == 3
                or float(live.get("faultType") or 0) > 0
                or float(live.get("faultCode1") or 0) > 0
            )
            if is_offline:
                status = "offline"
            elif is_fault:
                status = "fault"
            elif diff_mins <= 120 and float(live.get("pac") or 0) > 50:
                status = "online"
            else:
                status = "standby"

            out.append(
                NormalizedDevice(
                    oem_device_id=sn,
                    model=dev["model_label"],
                    serial_number=sn,
                    capacity_kw=float(dev["capacity_kw"]),
                    string_count=int(dev["string_count"]),
                    status=status,
                    last_seen_at=last_seen,
                    installed_on=dev.get("installed_on"),
                )
            )
        return out

    def fetch_telemetry(self, device_id: str) -> Tuple[Optional[NormalizedTelemetry], List[NormalizedStringTelemetry]]:
        self._ensure_batch_telemetry()
        d = self.batch_telemetry_cache.get(device_id)
        if not d:
            single = self._request(f"/device/inverter/last_new_data?device_sn={device_id}", method="GET")
            if single and single.get("error_code") == 0 and isinstance(single.get("data"), dict):
                d = single["data"]
                self.batch_telemetry_cache[device_id] = d
        if not d or not d.get("time"):
            return None, []

        ts_iso = parse_growatt_ist_timestamp(d.get("time"))
        try:
            dt = datetime.fromisoformat(ts_iso.replace("Z", "+00:00"))
            diff_mins = (datetime.now(timezone.utc) - dt).total_seconds() / 60.0
        except Exception:
            diff_mins = 999999.0

        cap_kw = 15.0
        string_count = 2
        for dev_list in GROWATT_KNOWN_PLANT_DEVICES.values():
            for dev in dev_list:
                if dev["device_sn"] == device_id:
                    cap_kw = float(dev["capacity_kw"])
                    string_count = int(dev["string_count"])
                    break

        ac_kw = round(float(d.get("pac") or d.get("power") or 0.0) / 1000.0, 3)
        dc_kw = round(float(d.get("ppv") or 0.0) / 1000.0, 3)
        daily_kwh = round(float(d.get("powerToday") or d.get("today_energy") or d.get("eacToday") or 0.0), 2)
        total_kwh = round(float(d.get("powerTotal") or d.get("total_energy") or d.get("eacTotal") or 0.0), 2)
        eff_pct = round(min(99.5, max(0.0, (ac_kw / dc_kw) * 100.0)), 2) if dc_kw > 0.05 else 98.2
        temp_c = round(float(d.get("temperature") or d.get("temperature2") or 35.0), 1)
        spec_yield = round(daily_kwh / cap_kw, 2) if cap_kw > 0 else 0.0
        is_online = diff_mins <= 120 and int(d.get("status", 1)) != -1

        tel = NormalizedTelemetry(
            timestamp=ts_iso,
            ac_power_kw=ac_kw,
            dc_power_kw=dc_kw,
            energy_kwh=daily_kwh,
            efficiency_pct=eff_pct,
            temperature_c=temp_c,
            daily_generation_kwh=daily_kwh,
            total_generation_kwh=total_kwh,
            specific_yield=spec_yield,
            online_status=is_online,
            last_update=ts_iso,
            frequency_hz=float(d.get("fac") or 0.0) or None,
            reactive_power_kvar=round(float(d.get("rac") or d.get("reactPower") or 0.0) / 1000.0, 3),
            power_factor=float(d.get("pf") or d.get("power_factor") or 1.0),
            current_r_a=float(d.get("iacr") or d.get("iac1") or 0.0) or None,
            current_s_a=float(d.get("iacs") or d.get("iac2") or 0.0) or None,
            current_t_a=float(d.get("iact") or d.get("iac3") or 0.0) or None,
            voltage_r_v=float(d.get("vacr") or d.get("vac1") or 0.0) or None,
            voltage_s_v=float(d.get("vacs") or d.get("vac2") or 0.0) or None,
            voltage_t_v=float(d.get("vact") or d.get("vac3") or 0.0) or None,
            apparent_power_kva=ac_kw,
            metrics={
                "oem": "growatt",
                "status_code": d.get("status"),
                "status_text": d.get("statusText", ""),
                "epv_total_kwh": float(d.get("epvTotal") or 0.0),
                "pv_iso_kohm": float(d.get("pvIso") or 0.0),
                "p_bus_voltage_v": float(d.get("pBusVoltage") or 0.0),
                "n_bus_voltage_v": float(d.get("nBusVoltage") or 0.0),
                "fault_type": int(d.get("faultType") or 0),
                "warn_code": int(d.get("warnCode") or 0),
            },
        )

        strings: List[NormalizedStringTelemetry] = []
        for idx in range(1, string_count + 1):
            v = round(float(d.get(f"vpv{idx}") or 0.0), 2)
            a = round(float(d.get(f"ipv{idx}") or 0.0), 2)
            raw_p = float(d.get(f"ppv{idx}") or 0.0) / 1000.0
            p = round(raw_p if raw_p > 0 else (v * a) / 1000.0, 3)
            strings.append(
                NormalizedStringTelemetry(
                    string_index=idx,
                    voltage_v=v,
                    current_a=a,
                    power_kw=p,
                    status="ok" if (v > 0 or a > 0) else "offline",
                    metrics={
                        "epv_today_kwh": float(d.get(f"epv{idx}Today") or 0.0),
                        "epv_total_kwh": float(d.get(f"epv{idx}Total") or 0.0),
                    },
                )
            )

        return tel, strings

    def fetch_alerts(self, plant_id: str) -> List[NormalizedAlert]:
        self._ensure_batch_telemetry()
        pid = str(plant_id)
        known_devs = GROWATT_KNOWN_PLANT_DEVICES.get(pid, [])
        alerts: List[NormalizedAlert] = []
        for dev in known_devs:
            sn = dev["device_sn"]
            d = self.batch_telemetry_cache.get(sn)
            if not d or not d.get("time"):
                continue
            ts_iso = parse_growatt_ist_timestamp(d.get("time"))
            try:
                dt = datetime.fromisoformat(ts_iso.replace("Z", "+00:00"))
                diff_mins = (datetime.now(timezone.utc) - dt).total_seconds() / 60.0
            except Exception:
                diff_mins = 999999.0

            if diff_mins <= 14 * 60:
                codes = []
                if int(d.get("faultType") or 0) > 0:
                    codes.append(str(d.get("faultType")))
                if int(d.get("warnCode") or 0) > 0:
                    codes.append(str(d.get("warnCode")))
                for code in codes:
                    tr = translate_alert("growatt", code, f"Growatt Fault {code}")
                    alerts.append(
                        NormalizedAlert(
                            code=f"GROWATT_{code}",
                            title=tr["title"],
                            description=f"{tr['description']} (Device SN: {sn})",
                            severity=tr["severity"],
                            triggered_at=ts_iso,
                            alarm_code=code,
                            oem="growatt",
                            category=tr["category"],
                            is_auto_resolvable=tr["is_auto_resolvable"],
                            requires_technician=tr["requires_technician"],
                            recommended_action=tr["recommended_action"],
                        )
                    )
        return alerts

