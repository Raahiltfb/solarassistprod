from typing import List, Tuple, Optional
from pydantic import BaseModel, Field

class NormalizedStation(BaseModel):
    plant_id: str
    name: str
    capacity_kwp: float
    location: str
    timezone: str

class NormalizedDevice(BaseModel):
    oem_device_id: str
    model: str
    serial_number: str
    capacity_kw: float
    string_count: int
    status: str
    last_seen_at: str

class NormalizedTelemetry(BaseModel):
    timestamp: str
    ac_power_kw: float
    dc_power_kw: float
    energy_kwh: float
    efficiency_pct: float
    temperature_c: float
    daily_generation_kwh: float
    total_generation_kwh: float
    specific_yield: float
    online_status: bool
    last_update: str
    frequency_hz: Optional[float] = None
    reactive_power_kvar: Optional[float] = None
    power_factor: Optional[float] = None
    current_r_a: Optional[float] = None
    current_s_a: Optional[float] = None
    current_t_a: Optional[float] = None
    voltage_r_v: Optional[float] = None
    voltage_s_v: Optional[float] = None
    voltage_t_v: Optional[float] = None
    apparent_power_kva: Optional[float] = None
    battery_soc_pct: Optional[float] = None
    battery_soh_pct: Optional[float] = None
    battery_power_kw: Optional[float] = None
    battery_voltage_v: Optional[float] = None
    battery_current_a: Optional[float] = None
    load_power_kw: Optional[float] = None
    grid_purchased_today_kwh: Optional[float] = None
    grid_sell_today_kwh: Optional[float] = None
    load_today_kwh: Optional[float] = None
    metrics: dict = Field(default_factory=dict)

class NormalizedStringTelemetry(BaseModel):
    string_index: int
    voltage_v: float
    current_a: float
    power_kw: float
    status: str
    metrics: dict = Field(default_factory=dict)

class NormalizedAlert(BaseModel):
    code: str
    title: str
    description: str
    severity: str
    triggered_at: str
    alarm_code: str
    oem: str
    category: str
    is_auto_resolvable: bool
    requires_technician: bool
    recommended_action: str

class OemAdapter:
    def __init__(self, key_id: str, key_secret: str, api_url: str):
        self.key_id = key_id
        self.key_secret = key_secret
        self.api_url = api_url

    def list_stations(self) -> List[NormalizedStation]:
        """Fetch all solar stations/plants linked to the account."""
        raise NotImplementedError

    def list_devices(self, plant_id: str) -> List[NormalizedDevice]:
        """Fetch all devices (inverters) for a given station."""
        raise NotImplementedError

    def fetch_telemetry(self, device_id: str) -> Tuple[Optional[NormalizedTelemetry], List[NormalizedStringTelemetry]]:
        """Fetch live telemetry and individual string metrics for a device."""
        raise NotImplementedError

    def fetch_alerts(self, plant_id: str) -> List[NormalizedAlert]:
        """Fetch active alarms/fault alerts for a station."""
        raise NotImplementedError
