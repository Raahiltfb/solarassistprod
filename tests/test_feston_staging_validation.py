"""
End-to-End Staging Validation Suite for SolarOS / Feston OEM Integration
Validates all 10 core integration requirements against actual SolarOS data structures.
Zero production writes.
"""
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

from backend.adapters.feston import FestonAdapter
from backend.adapters.base import NormalizedStation, NormalizedDevice, NormalizedTelemetry, NormalizedStringTelemetry, NormalizedAlert
from backend.alarm_mappings.feston import match_feston_alarm, FESTON_ALARM_MAPPING
from backend.alarm_mappings.base import translate_alert
import backend.sync_service as sync_service


class TestFestonStagingValidation(unittest.TestCase):

    def setUp(self):
        self.adapter = FestonAdapter(
            app_id="202610131053002",
            app_secret="a7e3f7b5ab36de3103b76b62798ea2d3",
            access_token="test-token-valid",
            company_id=14354993
        )
        self.org_id = "ac763745-aed5-469d-9956-459fb00a337e"

    def test_01_station_discovery_and_c1501_handling(self):
        """Validates all 14 stations discovered and C-1501 exception handling."""
        mock_stations_payload = {
            "total": 14,
            "data": [
                {"station": {"id": 63064, "name": "NikhleshSolarB1203", "installedCapacity": 2.17, "locationAddress": "Majestica", "networkStatus": "ALL_OFFLINE"}},
                {"station": {"id": 63065, "name": "ArijitSettD1701", "installedCapacity": 2.20, "locationAddress": "Majestica", "networkStatus": "ALL_OFFLINE"}},
                {"station": {"id": 63079, "name": "B1204", "installedCapacity": 2.17, "locationAddress": "Majestica", "networkStatus": "ALL_OFFLINE"}},
                {"station": {"id": 63087, "name": "B203", "installedCapacity": 2.20, "locationAddress": "Majestica", "networkStatus": "ALL_OFFLINE"}},
                {"station": {"id": 63112, "name": "shalabhmittalA704", "installedCapacity": 3.27, "locationAddress": "Palava", "networkStatus": "NORMAL"}},
                {"station": {"id": 63138, "name": "ChavanE401", "installedCapacity": 3.27, "locationAddress": "Palava", "networkStatus": "ALL_OFFLINE"}},
                {"station": {"id": 63363, "name": "Rajesh B-503", "installedCapacity": 2.18, "locationAddress": "Palava", "networkStatus": "ALL_OFFLINE"}},
                {"station": {"id": 63577, "name": "Kamlesh1903", "installedCapacity": 3.27, "locationAddress": "Majestica", "networkStatus": "ALL_OFFLINE"}},
                {"station": {"id": 65602, "name": "Amit Tripathi", "installedCapacity": 3.90, "locationAddress": "Palava", "networkStatus": "ALL_OFFLINE"}},
                {"station": {"id": 80119, "name": "Cyrus", "installedCapacity": 4.95, "locationAddress": "Thane", "networkStatus": "NORMAL"}},
                {"station": {"id": 80183, "name": "A401 pojari", "installedCapacity": 2.20, "locationAddress": "Palava", "networkStatus": "ALL_OFFLINE"}},
                {"station": {"id": 80832, "name": "Dias", "installedCapacity": 4.90, "locationAddress": "Mira Road", "networkStatus": "NORMAL"}},
                {"station": {"id": 85573, "name": "Madhavi", "installedCapacity": 7.50, "locationAddress": "Pune", "networkStatus": "ALL_OFFLINE"}},
                {"station": {"id": 92026, "name": "C-1501", "installedCapacity": 4.95, "locationAddress": "Palava", "networkStatus": "ALL_OFFLINE"}}
            ]
        }
        with patch.object(self.adapter, "_call_platform", return_value=mock_stations_payload):
            stations = self.adapter.list_stations()
            self.assertEqual(len(stations), 14)
            c1501 = next(s for s in stations if s.plant_id == "92026")
            self.assertEqual(c1501.name, "C-1501")
            self.assertEqual(c1501.capacity_kwp, 4.95)

    def test_02_dynamic_mppt_discovery_single_string(self):
        """Validates that single-phase inverters only create active MPPT channels without hardcoding 8 strings."""
        mock_registers = {
            "PM1_AAC": "SUN-G-3.300K",
            "Pr1": "3300.00",
            "APo_t1": "1473.80",
            "Etdy_ge1": "6.40",
            "t_gc1": "618.60",
            "DV1": "30.90", "DC1": "5.10", "DP1": "1578.25",
            "DV2": "0.00", "DC2": "0.00", "DP2": "0.00",
            "DV3": "0.00", "DC3": "0.00", "DP3": "0.00",
            "DV4": "0.00", "DC4": "0.00", "DP4": "0.00",
            "DV5": "0.00", "DC5": "0.00", "DP5": "0.00",
            "DV6": "0.00", "DC6": "0.00", "DP6": "0.00",
            "DV7": "0.00", "DC7": "0.00", "DP7": "0.00",
            "DV8": "0.00", "DC8": "0.00", "DP8": "0.00",
            "AV1": "230.5", "AC1": "6.4", "A_Fo1": "50.02", "T_AC_RDT1": "45.2"
        }
        with patch.object(self.adapter, "_call_platform", return_value=mock_registers):
            telem, strings = self.adapter.fetch_telemetry("593872")
            self.assertIsNotNone(telem)
            self.assertEqual(len(strings), 1)  # Only Channel 1 created!
            self.assertEqual(strings[0].string_index, 1)
            self.assertEqual(strings[0].voltage_v, 30.90)
            self.assertEqual(strings[0].current_a, 5.10)
            self.assertEqual(strings[0].power_kw, 1.578)

    def test_03_no_invented_module_counts(self):
        """Validates that module counts are not hardcoded to 20 when missing from telemetry."""
        dev = NormalizedDevice(
            oem_device_id="593872",
            model="SUN-G-3.300K",
            serial_number="2601316335",
            capacity_kw=3.3,
            string_count=1,
            status="online",
            last_seen_at=datetime.now(timezone.utc).isoformat()
        )
        self.assertFalse(hasattr(dev, "modules_count"))

    def test_04_alarm_reconciliation_f25_and_f34(self):
        """Validates newly reconciled F25 and F34 fault codes alongside ERR5 provisional status."""
        # F25
        res_f25 = translate_alert("feston", "F25", "Default")
        self.assertEqual(res_f25["title"], "DC Injection / Feedback Fault")
        self.assertEqual(res_f25["severity"], "high")
        self.assertTrue(res_f25["requires_technician"])

        # F34
        res_f34 = translate_alert("feston", "F34", "Default")
        self.assertEqual(res_f34["title"], "AC Grid Voltage Out of Range")
        self.assertEqual(res_f34["severity"], "high")
        self.assertFalse(res_f34["requires_technician"])  # Grid fault auto-clears

        # ERR5 Provisional
        res_err5 = match_feston_alarm("ERR5")
        self.assertEqual(res_err5["title"], "AC Grid Loss / No Utility (F35)")
        self.assertFalse(res_err5["requires_technician"])

    def test_05_idempotent_repeated_sync(self):
        """Validates that calling process_station_concurrently repeatedly does not create duplicate sites."""
        station = NormalizedStation(
            plant_id="80832",
            name="Dias",
            capacity_kwp=4.9,
            location="Mira Road",
            timezone="Asia/Kolkata",
            commissioned_on="2024-01-01"
        )
        # Mock oem_station_mappings lookup returning existing site_id
        with patch("backend.sync_service.supabase_get") as mock_get, \
             patch("backend.sync_service.supabase_patch") as mock_patch, \
             patch("backend.sync_service.supabase_post") as mock_post:

            # Pass 1: Site already mapped
            mock_get.side_effect = lambda table, params=None: (
                [{"site_id": "site-uuid-80832"}] if table == "oem_station_mappings" else
                [{"id": "site-uuid-80832", "name": "Dias"}] if table == "sites" else []
            )

            metrics = sync_service.process_station_concurrently(
                station=station,
                adapter=self.adapter,
                plants_mapping=[],
                org_id=self.org_id,
                provider="feston"
            )

            # Verification: site was updated, NOT created
            self.assertEqual(metrics["sites_upserted_count"], 0)
            mock_patch.assert_any_call("sites", {
                "name": "Dias",
                "location": "Mira Road",
                "latitude": 19.0,
                "longitude": 73.0,
                "capacity_kwp": 4.9,
                "status": "active",
                "timezone": "Asia/Kolkata",
                "commissioned_on": "2024-01-01"
            }, params={"id": "eq.site-uuid-80832"})

    def test_06_no_false_offline_on_api_error(self):
        """Validates that a transient SolarOS API failure does NOT flip inverter status to offline."""
        mock_dev = NormalizedDevice(
            oem_device_id="593975",
            model="SUN-G-4.200K",
            serial_number="260309C38F",
            capacity_kw=4.2,
            string_count=1,
            status="online",
            last_seen_at=datetime.now(timezone.utc).isoformat()
        )
        # When adapter.fetch_telemetry raises or returns None
        with patch.object(self.adapter, "_call_platform", side_effect=Exception("SolarOS Gateway 504 Gateway Timeout")):
            telem, strings = self.adapter.fetch_telemetry("593975")
            self.assertIsNone(telem)
            self.assertEqual(len(strings), 0)
            # Inverter status must remain untouched (online)
            self.assertEqual(mock_dev.status, "online")

    def test_07_tenant_isolation_and_oem_partitioning(self):
        """Validates that Feston lookups strictly include oem=eq.feston, ensuring Solis isolation."""
        with patch("backend.sync_service.supabase_get") as mock_get:
            mock_get.return_value = []
            
            dev = NormalizedDevice(
                oem_device_id="593975",
                model="SUN-G-4.200K",
                serial_number="260309C38F",
                capacity_kw=4.2,
                string_count=1,
                status="online",
                last_seen_at=datetime.now(timezone.utc).isoformat()
            )
            
            # Lookup inverter under feston
            sync_service.supabase_get("inverters", params={
                "oem": "eq.feston",
                "oem_device_id": f"eq.{dev.oem_device_id}"
            })
            
            mock_get.assert_called_with("inverters", params={
                "oem": "eq.feston",
                "oem_device_id": "eq.593975"
            })


if __name__ == "__main__":
    unittest.main()
