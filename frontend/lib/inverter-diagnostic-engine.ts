import { Inverter } from "./types";

export interface InverterStringDetail {
  string_id: string;
  string_index: number;
  current_a: number;
  voltage_v: number;
  power_kw: number;
  status: "ok" | "underperforming" | "disconnected" | "voltage_droop";
}

export interface InverterComparisonResult {
  inverter_id: string;
  oem_device_id: string;
  serial_number: string;
  oem: string;
  model: string;
  capacity_kw: number;
  ac_power_kw: number;
  dc_power_kw: number;
  today_generation_kwh: number;
  specific_yield_kwh_kwp: number;
  site_median_yield: number;
  yield_deviation_pct: number;
  efficiency_pct: number;
  temperature_c: number;
  thermal_status: "normal" | "warning" | "thermal_derating";
  clipping_status: "none" | "active_clipping";
  alarm_state: string;
  communication_state: "fresh" | "delayed" | "offline";
  anomaly_count: number;
  performance_rank: number;
  health_score: number; // 0 - 100
  primary_issue_description: string;
  recommended_action: string;
  string_breakdown: InverterStringDetail[];
  last_telemetry_time: string | null;
}

/**
 * Multi-Inverter Diagnostic Comparison Engine:
 * Evaluates inverter conversion efficiency, thermal clipping, specific yield, and relative performance ranking across a site.
 */
export const compareMultiInverters = compareInvertersDiagnostic;
export const analyzeInverterDiagnostics = compareInvertersDiagnostic;

export function compareInvertersDiagnostic(
  inverters: any[],
  latestTelemetryMap: Map<string, any>,
  strings: any[] = [],
  stringTelemetryMap: Map<string, any> = new Map(),
  activeAlerts: any[] = []
): InverterComparisonResult[] {
  if (!inverters || inverters.length === 0) return [];

  // Group strings by inverter_id
  const invStringsMap = new Map<string, any[]>();
  for (const s of strings) {
    const list = invStringsMap.get(s.inverter_id) || [];
    list.push(s);
    invStringsMap.set(s.inverter_id, list);
  }

  // Group active alerts by inverter_id
  const invAlertsMap = new Map<string, any[]>();
  for (const a of activeAlerts) {
    if (a.inverter_id && a.status === "open") {
      const list = invAlertsMap.get(a.inverter_id) || [];
      list.push(a);
      invAlertsMap.set(a.inverter_id, list);
    }
  }

  const rawResults: Array<{
    inv: any;
    telemetry: any;
    specYield: number;
    efficiency: number;
    acPower: number;
    dcPower: number;
    todayGen: number;
    temp: number;
    stringBreakdown: InverterStringDetail[];
    anomalyCount: number;
    commState: "fresh" | "delayed" | "offline";
  }> = [];

  for (const inv of inverters) {
    const tel = latestTelemetryMap.get(inv.id) || {};
    const capKw = Number(inv.capacity_kw || 0);
    const todayGen = Number(tel.daily_generation_kwh || tel.energy_kwh || 0);
    const specYield = capKw > 0 ? todayGen / capKw : 0;

    const acPower = Number(tel.ac_power_kw || 0);
    const dcPower = Number(tel.dc_power_kw || 0);
    let efficiency = Number(tel.efficiency_pct || 0);

    if ((efficiency <= 0 || efficiency > 100) && dcPower > 0 && acPower > 0) {
      efficiency = Math.min(99.5, Math.round((acPower / dcPower) * 1000) / 10);
    } else if (efficiency <= 0) {
      efficiency = acPower > 0 ? 98.2 : 0;
    }

    const temp = Number(tel.temperature_c || 42);

    // Communication state check
    let commState: "fresh" | "delayed" | "offline" = "fresh";
    if (!tel.timestamp || inv.status === "offline") {
      commState = "offline";
    } else {
      const diffMins = (Date.now() - new Date(tel.timestamp).getTime()) / 60000;
      if (diffMins > 60) commState = "offline";
      else if (diffMins > 20) commState = "delayed";
    }

    // Process string breakdown
    const invStrList = invStringsMap.get(inv.id) || [];
    let anomalyCount = 0;
    const stringBreakdown: InverterStringDetail[] = [];

    invStrList.sort((a, b) => Number(a.string_index) - Number(b.string_index)).forEach((str) => {
      const st = stringTelemetryMap.get(str.id) || {};
      const curr = Number(st.current_a || 0);
      const volt = Number(st.voltage_v || 0);
      const pow = Number(st.power_kw || (curr * volt) / 1000.0);

      let strStatus: "ok" | "underperforming" | "disconnected" | "voltage_droop" = "ok";
      if (curr === 0 && acPower > 1.0) {
        strStatus = "disconnected";
        anomalyCount++;
      } else if (curr > 0 && curr < 2.0 && acPower > 5.0) {
        strStatus = "underperforming";
        anomalyCount++;
      } else if (volt > 0 && volt < 150) {
        strStatus = "voltage_droop";
        anomalyCount++;
      }

      stringBreakdown.push({
        string_id: str.id,
        string_index: str.string_index,
        current_a: curr,
        voltage_v: volt,
        power_kw: Math.round(pow * 100) / 100,
        status: strStatus,
      });
    });

    rawResults.push({
      inv,
      telemetry: tel,
      specYield,
      efficiency,
      acPower,
      dcPower,
      todayGen,
      temp,
      stringBreakdown,
      anomalyCount,
      commState,
    });
  }

  // Calculate site median specific yield
  const validYields = rawResults.map((r) => r.specYield).filter((y) => y > 0);
  const sortedYields = [...validYields].sort((a, b) => a - b);
  const siteMedianYield = sortedYields.length > 0
    ? sortedYields[Math.floor(sortedYields.length / 2)]
    : 0;

  // Calculate ranking by specific yield descending
  const sortedByYield = [...rawResults].sort((a, b) => b.specYield - a.specYield);
  const rankMap = new Map<string, number>();
  sortedByYield.forEach((r, idx) => rankMap.set(r.inv.id, idx + 1));

  return rawResults.map((r) => {
    const inv = r.inv;
    const capKw = Number(inv.capacity_kw || 0);
    const devPct = siteMedianYield > 0
      ? Math.round(((r.specYield - siteMedianYield) / siteMedianYield) * 1000) / 10
      : 0;

    // Thermal Derating: Temp > 65C while operating near capacity
    let thermalStatus: "normal" | "warning" | "thermal_derating" = "normal";
    if (r.temp > 68) thermalStatus = "thermal_derating";
    else if (r.temp > 60) thermalStatus = "warning";

    // Power Clipping: AC Power >= 0.98 * Capacity KW
    const isClipping = r.acPower >= 0.98 * capKw && capKw > 0;
    const clippingStatus: "none" | "active_clipping" = isClipping ? "active_clipping" : "none";

    // Active Alarms Text
    const invAlerts = invAlertsMap.get(inv.id) || [];
    const alarmState = invAlerts.length > 0
      ? invAlerts.map((a) => a.title).join(", ")
      : inv.status === "offline"
      ? "Inverter Offline (Grid Loss or Trip)"
      : "None";

    // Calculate Inverter Health Score (0 - 100)
    let healthScore = 100;
    if (r.commState === "offline") healthScore -= 50;
    if (inv.status === "fault") healthScore -= 75;
    if (thermalStatus === "thermal_derating") healthScore -= 20;
    if (r.anomalyCount > 0) healthScore -= r.anomalyCount * 15;
    if (devPct < -15) healthScore -= 20;
    healthScore = Math.max(0, Math.min(100, healthScore));

    // Primary issue diagnosis & recommendation
    let primaryIssue = "Optimal inverter operation";
    let recommendedAction = "No field intervention required. Inverter operating within normal parameters.";

    if (r.commState === "offline") {
      primaryIssue = "Inverter offline / Communication loss";
      recommendedAction = "Inspect AC grid supply breaker and Solis datalogger stick connectivity.";
    } else if (thermalStatus === "thermal_derating") {
      primaryIssue = `Thermal derating detected (${r.temp}°C internal temp)`;
      recommendedAction = "Clean heatsink cooling fins and verify inverter enclosure ventilation fan operation.";
    } else if (r.anomalyCount > 0) {
      primaryIssue = `${r.anomalyCount} string anomaly channel(s) detected`;
      recommendedAction = "Inspect string fuses and MC4 connectors for underperforming channels.";
    } else if (devPct < -15) {
      primaryIssue = `Specific yield is ${Math.abs(devPct)}% below site median`;
      recommendedAction = "Check array soiling, shading from rooftop structures, or blown string fuses.";
    }

    return {
      inverter_id: inv.id,
      oem_device_id: inv.oem_device_id || inv.serial_number || "Inverter",
      serial_number: inv.serial_number || "—",
      oem: inv.oem || "Solis",
      model: inv.model || "Standard",
      capacity_kw: capKw,
      ac_power_kw: r.acPower,
      dc_power_kw: r.dcPower || r.acPower / 0.98,
      today_generation_kwh: r.todayGen,
      specific_yield_kwh_kwp: Math.round(r.specYield * 100) / 100,
      site_median_yield: Math.round(siteMedianYield * 100) / 100,
      yield_deviation_pct: devPct,
      efficiency_pct: r.efficiency,
      temperature_c: r.temp,
      thermal_status: thermalStatus,
      clipping_status: clippingStatus,
      alarm_state: alarmState,
      communication_state: r.commState,
      anomaly_count: r.anomalyCount,
      performance_rank: rankMap.get(inv.id) || 1,
      health_score: healthScore,
      primary_issue_description: primaryIssue,
      recommended_action: recommendedAction,
      string_breakdown: r.stringBreakdown,
      last_telemetry_time: r.telemetry?.timestamp || null,
    };
  });
}
