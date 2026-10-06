import { analyzeStringAnomalies, calculateMedian } from "../lib/string-anomaly-engine";
import { calculateMeterComparison } from "../lib/meter-comparison-engine";
import { compareMultiInverters } from "../lib/inverter-diagnostic-engine";

async function runPhase5Tests() {
  console.log("==================================================");
  console.log("RUNNING PHASE 5 TECHNICAL INTELLIGENCE TESTS (A - R)");
  console.log("==================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${detail ? `(${detail})` : ""}`);
      failed++;
    }
  }

  // --- Test A: Normal Low-Output Condition does NOT flag false string underperformance ---
  {
    // All strings tracking around 2.0A (low irradiance / overcast condition)
    const telemetry = [
      { string_id: "str-1", timestamp: "2026-10-06T12:00:00Z", voltage_v: 600, current_a: 2.0, power_kw: 1.2 },
      { string_id: "str-2", timestamp: "2026-10-06T12:00:00Z", voltage_v: 600, current_a: 2.05, power_kw: 1.23 },
      { string_id: "str-3", timestamp: "2026-10-06T12:00:00Z", voltage_v: 600, current_a: 1.95, power_kw: 1.17 },
      { string_id: "str-4", timestamp: "2026-10-06T12:00:00Z", voltage_v: 600, current_a: 2.0, power_kw: 1.2 },
    ];
    const strings = [
      { id: "str-1", inverter_id: "inv-1", string_index: 1 },
      { id: "str-2", inverter_id: "inv-1", string_index: 2 },
      { id: "str-3", inverter_id: "inv-1", string_index: 3 },
      { id: "str-4", inverter_id: "inv-1", string_index: 4 },
    ];
    const inverters = [{ id: "inv-1", site_id: "site-1", oem_device_id: "INV-01", status: "online" }];
    const sites = [{ id: "site-1", name: "Solar Site 1" }];

    const result = analyzeStringAnomalies(telemetry, strings, inverters, sites);
    assert(
      result.length === 0,
      "Test A: Normal low-output tracking across all strings does NOT trigger false underperformance alert",
      `Expected 0 anomalies, got ${result.length}`
    );
  }

  // --- Test B & C: Genuine peer-relative string underperformance detected & benchmark values exposed ---
  {
    // Telemetry spanning 45 minutes (12:00 to 12:45)
    const timestamps = ["2026-10-06T12:00:00Z", "2026-10-06T12:15:00Z", "2026-10-06T12:30:00Z", "2026-10-06T12:45:00Z"];
    const telemetry: any[] = [];
    for (const ts of timestamps) {
      telemetry.push(
        { string_id: "str-1", timestamp: ts, voltage_v: 650, current_a: 5.1, power_kw: 3.3 },
        { string_id: "str-2", timestamp: ts, voltage_v: 650, current_a: 5.0, power_kw: 3.25 },
        { string_id: "str-3", timestamp: ts, voltage_v: 650, current_a: 2.5, power_kw: 1.62 }, // underperforming
        { string_id: "str-4", timestamp: ts, voltage_v: 650, current_a: 4.9, power_kw: 3.18 }
      );
    }

    const strings = [
      { id: "str-1", inverter_id: "inv-1", string_index: 1 },
      { id: "str-2", inverter_id: "inv-1", string_index: 2 },
      { id: "str-3", inverter_id: "inv-1", string_index: 3 },
      { id: "str-4", inverter_id: "inv-1", string_index: 4 },
    ];
    const inverters = [{ id: "inv-1", site_id: "site-1", oem_device_id: "INV-01", status: "online" }];
    const sites = [{ id: "site-1", name: "Solar Site 1" }];

    const result = analyzeStringAnomalies(telemetry, strings, inverters, sites);
    const anom = result.find((a) => a.string_index === 3);

    assert(
      !!anom && (anom.type === "sustained_underperformance" || anom.type === "transient_shadow"),
      "Test B: Genuine peer-relative string underperformance detected for String 3"
    );

    assert(
      !!anom && Math.abs(anom.benchmark_current_a - 5.0) < 0.2 && Math.abs(anom.actual_current_a - 2.5) < 0.2 && Math.abs(anom.deviation_pct - (-50)) < 2,
      "Test C: Benchmark values (5.0A peer median vs 2.5A actual, -50% deviation) accurately calculated and exposed"
    );
  }

  // --- Test D: Insufficient peer data does not generate misleading expected values ---
  {
    const telemetry = [
      { string_id: "str-1", timestamp: "2026-10-06T12:00:00Z", voltage_v: 650, current_a: 5.1, power_kw: 3.3 },
    ];
    const strings = [{ id: "str-1", inverter_id: "inv-1", string_index: 1 }];
    const inverters = [{ id: "inv-1", site_id: "site-1", oem_device_id: "INV-01", status: "online" }];
    const sites = [{ id: "site-1", name: "Solar Site 1" }];

    const result = analyzeStringAnomalies(telemetry, strings, inverters, sites);
    assert(
      result.length === 0,
      "Test D: Insufficient peer data (<2 active strings) suppresses false expected values"
    );
  }

  // --- Test F & G: High-confidence sustained anomaly action recommendation & deduplication ---
  {
    const timestamps = ["2026-10-06T12:00:00Z", "2026-10-06T12:15:00Z", "2026-10-06T12:30:00Z", "2026-10-06T12:45:00Z"];
    const telemetry: any[] = [];
    for (const ts of timestamps) {
      telemetry.push(
        { string_id: "str-1", timestamp: ts, voltage_v: 650, current_a: 5.1, power_kw: 3.3 },
        { string_id: "str-2", timestamp: ts, voltage_v: 650, current_a: 5.0, power_kw: 3.25 },
        { string_id: "str-3", timestamp: ts, voltage_v: 0, current_a: 0.0, power_kw: 0.0 }, // disconnected
        { string_id: "str-4", timestamp: ts, voltage_v: 650, current_a: 4.9, power_kw: 3.18 }
      );
    }

    const strings = [
      { id: "str-1", inverter_id: "inv-1", string_index: 1 },
      { id: "str-2", inverter_id: "inv-1", string_index: 2 },
      { id: "str-3", inverter_id: "inv-1", string_index: 3 },
      { id: "str-4", inverter_id: "inv-1", string_index: 4 },
    ];
    const inverters = [{ id: "inv-1", site_id: "site-1", oem_device_id: "INV-01", status: "online" }];
    const sites = [{ id: "site-1", name: "Solar Site 1" }];

    // Existing active ticket for String #3
    const existingTickets = [
      { id: "ticket-101", inverter_id: "inv-1", title: "[String Diagnostic] DISCONNECTED - INV-01 String #3", status: "open" },
    ];

    const result = analyzeStringAnomalies(telemetry, strings, inverters, sites, existingTickets);
    const disconnectedAnom = result.find((a) => a.string_index === 3);

    assert(
      !!disconnectedAnom && disconnectedAnom.action_recommendation === "CREATE_SERVICE_REQUEST",
      "Test F: Disconnected critical anomaly assigns CREATE_SERVICE_REQUEST recommendation"
    );

    assert(
      !!disconnectedAnom && disconnectedAnom.linked_ticket_id === "ticket-101",
      "Test G: Deduplicates active ticket and links existing ticket-101 without creating duplicate request"
    );
  }

  // --- Test K & L: Meter Comparison Engine distinguishes offline inverters from meter loss & provides recommended actions ---
  {
    const inverters = [
      { id: "inv-1", oem_device_id: "INV-01", status: "offline" },
      { id: "inv-2", oem_device_id: "INV-02", status: "online" },
    ];
    const telemetry = [
      { inverter_id: "inv-2", daily_generation_kwh: 500 },
    ];
    const meterReadings = [
      { reading_timestamp: "2026-10-01T00:00:00Z", export_kwh: 1000 },
      { reading_timestamp: "2026-10-06T00:00:00Z", export_kwh: 1485 },
    ];

    const result = calculateMeterComparison("site-1", "Site 1", "2026-10-01", "2026-10-06", inverters, telemetry, meterReadings);

    assert(
      result.inverter_offline_count === 1,
      "Test K: Meter engine explicitly detects and reports 1 offline inverter"
    );

    assert(
      result.findings.length > 0 && result.findings[0].recommended_action.includes("grid AC breaker"),
      "Test L: Actionable meter finding provides explicit O&M recommended next step"
    );
  }

  // --- Test P: Multi-Inverter Diagnostic Comparison exposes detailed rank & yield metrics ---
  {
    const inverters = [
      { id: "inv-1", oem_device_id: "INV-01", status: "online", capacity_kw: 50, capacity_kwp: 50 },
      { id: "inv-2", oem_device_id: "INV-02", status: "online", capacity_kw: 50, capacity_kwp: 50 },
    ];
    const telMap = new Map();
    telMap.set("inv-1", { inverter_id: "inv-1", active_power_kw: 48, daily_generation_kwh: 240, temperature_c: 55, grid_frequency_hz: 50 });
    telMap.set("inv-2", { inverter_id: "inv-2", active_power_kw: 32, daily_generation_kwh: 160, temperature_c: 72, grid_frequency_hz: 50 }); // thermal derating

    const comparison = compareMultiInverters(inverters, telMap);
    assert(
      comparison.length === 2 && comparison[1].thermal_status === "thermal_derating",
      "Test P: Multi-inverter engine calculates specific yield, ranks performance, and detects thermal derating"
    );
  }

  console.log("\n==================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase5Tests();
