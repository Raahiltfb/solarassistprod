import unittest
from unittest.mock import patch, MagicMock
import os
import json
import tempfile
import time
from datetime import datetime, timezone

from backend.adapters.feston import FestonAdapter
from backend.adapters.base import (
    NormalizedStation,
    NormalizedDevice,
    NormalizedTelemetry,
    NormalizedStringTelemetry,
    NormalizedAlert
)
from backend.alarm_mappings.base import translate_alert
from backend.alarm_mappings.feston import match_feston_alarm, FESTON_ALARM_MAPPING
import backend.sync_service as sync_service


class TestFestonAdapter(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.cache_file = os.path.join(self.temp_dir.name, "token_cache.json")
        self.adapter = FestonAdapter(
            app_id="202610131053002",
            app_secret="test_secret",
            api_url="https://india-developer.solaros.com",
            email="ops@solarassist.com",
            password="test_password_123",
            token_cache_path=self.cache_file
        )

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_initialization(self):
        self.assertEqual(self.adapter.app_id, "202610131053002")
        self.assertEqual(self.adapter.app_secret, "test_secret")
        self.assertEqual(self.adapter.api_url, "https://india-developer.solaros.com")
        self.assertEqual(self.adapter.email, "ops@solarassist.com")

    @patch("requests.post")
    def test_token_acquisition_and_caching(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "code": "1000000",
            "msg": "success",
            "success": True,
            "accessToken": "mock_jwt_access_token_12345",
            "tokenType": "bearer",
            "expiresIn": 5183999
        }
        mock_post.return_value = mock_resp

        token = self.adapter.get_access_token()
        self.assertEqual(token, "mock_jwt_access_token_12345")
        self.assertTrue(os.path.exists(self.cache_file))

        # Check cached content
        with open(self.cache_file, "r") as f:
            cache = json.load(f)
        self.assertEqual(cache["accessToken"], "mock_jwt_access_token_12345")
        self.assertEqual(cache["appId"], "202610131053002")

        # Second call should use cache without invoking requests.post again
        mock_post.reset_mock()
        token2 = self.adapter.get_access_token()
        self.assertEqual(token2, "mock_jwt_access_token_12345")
        mock_post.assert_not_called()

    @patch("requests.post")
    def test_list_stations_normalization(self, mock_post):
        # Seed token in adapter so auth request is not triggered
        self.adapter.access_token = "valid_token"
        self.adapter.token_expiry = time.time() + 3600

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "code": "1000000",
            "success": True,
            "total": 1,
            "stationList": [
                {
                    "id": 10852,
                    "name": "Solar Assist Feston Site Alpha",
                    "installedCapacity": 125.0,
                    "locationAddress": "MIDC Industrial Area, Pune, Maharashtra",
                    "locationLat": 18.5204,
                    "locationLng": 73.8567,
                    "regionTimezone": "Asia/Kolkata",
                    "connectionStatus": "NORMAL",
                    "generationPower": 98.4,
                    "startOperatingTime": "2024-03-15T00:00:00Z"
                }
            ]
        }
        mock_post.return_value = mock_resp

        stations = self.adapter.list_stations()
        self.assertEqual(len(stations), 1)
        st = stations[0]
        self.assertIsInstance(st, NormalizedStation)
        self.assertEqual(st.plant_id, "10852")
        self.assertEqual(st.name, "Solar Assist Feston Site Alpha")
        self.assertEqual(st.capacity_kwp, 125.0)
        self.assertEqual(st.location, "MIDC Industrial Area, Pune, Maharashtra")
        self.assertEqual(st.timezone, "Asia/Kolkata")
        self.assertEqual(st.commissioned_on, "2024-03-15")

    @patch("requests.post")
    def test_list_devices_normalization(self, mock_post):
        self.adapter.access_token = "valid_token"
        self.adapter.token_expiry = time.time() + 3600

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "code": "1000000",
            "success": True,
            "total": 2,
            "deviceListItems": [
                {
                    "deviceId": 9901,
                    "deviceSn": "FESTON-INV-001",
                    "deviceType": "INVERTER",
                    "productId": "SUN-100K-G03",
                    "connectStatus": 1,
                    "collectionTime": 1730000000,
                    "stationId": 10852
                },
                {
                    "deviceId": 9902,
                    "deviceSn": "COLLECTOR-DATA-001",
                    "deviceType": "COLLECTOR",
                    "connectStatus": 1,
                    "collectionTime": 1730000000,
                    "stationId": 10852
                }
            ]
        }
        mock_post.return_value = mock_resp

        devices = self.adapter.list_devices("10852")
        # Collector device must be filtered out, leaving only the inverter
        self.assertEqual(len(devices), 1)
        inv = devices[0]
        self.assertIsInstance(inv, NormalizedDevice)
        self.assertEqual(inv.serial_number, "FESTON-INV-001")
        self.assertEqual(inv.model, "SUN-100K-G03")
        self.assertEqual(inv.status, "online")

    @patch("requests.post")
    def test_fetch_telemetry_normalization(self, mock_post):
        self.adapter.access_token = "valid_token"
        self.adapter.token_expiry = time.time() + 3600

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "code": "1000000",
            "success": True,
            "deviceDataList": [
                {
                    "deviceSn": "FESTON-INV-001",
                    "deviceType": "INVERTER",
                    "deviceState": 1,
                    "collectionTime": 1730000000,
                    "dataList": [
                        {"key": "Active Power", "value": 85.5, "unit": "kW"},
                        {"key": "Total DC Power", "value": 87.2, "unit": "kW"},
                        {"key": "Daily Energy", "value": 412.0, "unit": "kWh"},
                        {"key": "Total Energy", "value": 24500.0, "unit": "kWh"},
                        {"key": "Inverter Temp", "value": 48.5, "unit": "°C"},
                        {"key": "Grid Frequency", "value": 50.02, "unit": "Hz"},
                        {"key": "Power Factor", "value": 0.99, "unit": ""},
                        {"key": "Voltage L1", "value": 230.5, "unit": "V"},
                        {"key": "Voltage L2", "value": 231.2, "unit": "V"},
                        {"key": "Voltage L3", "value": 229.8, "unit": "V"},
                        {"key": "Current L1", "value": 123.4, "unit": "A"},
                        {"key": "Current L2", "value": 124.0, "unit": "A"},
                        {"key": "Current L3", "value": 122.9, "unit": "A"},
                        {"key": "PV1 Voltage", "value": 680.0, "unit": "V"},
                        {"key": "PV1 Current", "value": 64.0, "unit": "A"},
                        {"key": "PV2 Voltage", "value": 675.0, "unit": "V"},
                        {"key": "PV2 Current", "value": 64.5, "unit": "A"},
                        {"key": "Battery SOC", "value": 92.0, "unit": "%"}
                    ]
                }
            ]
        }
        mock_post.return_value = mock_resp

        telemetry, strings = self.adapter.fetch_telemetry("FESTON-INV-001")
        self.assertIsNotNone(telemetry)
        self.assertIsInstance(telemetry, NormalizedTelemetry)
        self.assertEqual(telemetry.ac_power_kw, 85.5)
        self.assertEqual(telemetry.dc_power_kw, 87.2)
        self.assertEqual(telemetry.daily_generation_kwh, 412.0)
        self.assertEqual(telemetry.total_generation_kwh, 24500.0)
        self.assertEqual(telemetry.temperature_c, 48.5)
        self.assertEqual(telemetry.frequency_hz, 50.02)
        self.assertEqual(telemetry.voltage_r_v, 230.5)
        self.assertEqual(telemetry.voltage_s_v, 231.2)
        self.assertEqual(telemetry.voltage_t_v, 229.8)
        self.assertEqual(telemetry.battery_soc_pct, 92.0)
        self.assertTrue(telemetry.online_status)

        # Verify string channels
        self.assertEqual(len(strings), 2)
        st1, st2 = strings[0], strings[1]
        self.assertEqual(st1.string_index, 1)
        self.assertEqual(st1.voltage_v, 680.0)
        self.assertEqual(st1.current_a, 64.0)
        self.assertEqual(st1.status, "ok")
        self.assertEqual(st2.string_index, 2)
        self.assertEqual(st2.voltage_v, 675.0)
        self.assertEqual(st2.current_a, 64.5)

    @patch("requests.post")
    def test_fetch_alerts_normalization(self, mock_post):
        self.adapter.access_token = "valid_token"
        self.adapter.token_expiry = time.time() + 3600

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "code": "1000000",
            "success": True,
            "total": 1,
            "stationAlertItems": [
                {
                    "alertId": "alt_101",
                    "alertCode": "F35",
                    "alertName": "AC_NoUtillity_Fault F35",
                    "protocolName": "ERR5",
                    "alertStartTime": 1730000000,
                    "status": 1,
                    "deviceSn": "FESTON-INV-001",
                    "deviceType": "INVERTER"
                }
            ]
        }
        mock_post.return_value = mock_resp

        alerts = self.adapter.fetch_alerts("10852")
        self.assertEqual(len(alerts), 1)
        al = alerts[0]
        self.assertIsInstance(al, NormalizedAlert)
        self.assertEqual(al.alarm_code, "F35")
        self.assertEqual(al.oem, "feston")
        self.assertEqual(al.severity, "high")
        self.assertEqual(al.category, "grid")
        self.assertTrue(al.is_auto_resolvable)
        self.assertFalse(al.requires_technician)


class TestFestonAlarmIntelligence(unittest.TestCase):
    def test_feston_alarm_registry_loaded(self):
        self.assertGreater(len(FESTON_ALARM_MAPPING), 10)
        self.assertIn("F35", FESTON_ALARM_MAPPING)
        self.assertIn("F24", FESTON_ALARM_MAPPING)
        self.assertIn("F18", FESTON_ALARM_MAPPING)
        self.assertIn("F23", FESTON_ALARM_MAPPING)
        self.assertIn("F63", FESTON_ALARM_MAPPING)

    def test_match_feston_alarm_variations(self):
        # Match by direct code
        f35 = match_feston_alarm("F35")
        self.assertEqual(f35["title"], "AC Grid Loss / No Utility (F35)")
        self.assertTrue(f35["is_auto_resolvable"])

        # Match by protocol ERR code
        err5 = match_feston_alarm("ERR5")
        self.assertEqual(err5["title"], "AC Grid Loss / No Utility (F35)")

        # Match by alert string with F code embedded
        embedded = match_feston_alarm("", "Grid_NoUtillity_Fault F35 Occurred")
        self.assertEqual(embedded["title"], "AC Grid Loss / No Utility (F35)")

        # Match DC insulation fault
        f24 = match_feston_alarm("F24", "PV Array Insulation Low")
        self.assertEqual(f24["severity"], "critical")
        self.assertEqual(f24["category"], "pv")
        self.assertTrue(f24["requires_technician"])

    def test_translate_alert_dispatch(self):
        solis_alert = translate_alert("solis", "1045", "Default")
        self.assertEqual(solis_alert["title"], "Isolation Fault (ISO-F)")

        feston_alert = translate_alert("feston", "F63", "Default")
        self.assertEqual(feston_alert["title"], "DC Arc Fault Detected (AFCI)")

        solaros_alert = translate_alert("solaros", "F20", "Default")
        self.assertEqual(solaros_alert["title"], "DC Overcurrent Fault")


class TestSyncServiceMultiOem(unittest.TestCase):
    def test_get_adapter_dispatch(self):
        solis_adapter = sync_service.get_adapter_for_integration({"provider": "solis"})
        self.assertEqual(type(solis_adapter).__name__, "SolisAdapter")

        feston_adapter = sync_service.get_adapter_for_integration({"provider": "feston"})
        self.assertEqual(type(feston_adapter).__name__, "FestonAdapter")

        solaros_adapter = sync_service.get_adapter_for_integration({"provider": "solaros"})
        self.assertEqual(type(solaros_adapter).__name__, "FestonAdapter")

    def test_unsupported_provider_raises(self):
        with self.assertRaises(ValueError):
            sync_service.get_adapter_for_integration({"provider": "unknown_oem"})


if __name__ == "__main__":
    unittest.main()

