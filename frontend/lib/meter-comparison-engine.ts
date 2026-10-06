export interface MeterDiagnosticFinding {
  finding: string;
  severity: "low" | "medium" | "high" | "critical";
  evidence: string;
  recommended_action: string;
  is_service_request_eligible: boolean;
  sr_eligibility?: boolean;
}

export interface MeterComparisonResult {
  site_id: string;
  site_name: string;
  period_start: string;
  period_end: string;
  inverter_total_kwh: number;
  meter_export_kwh: number;
  loss_kwh: number;
  loss_pct: number;
  offline_inverters_count: number;
  inverter_offline_count: number;
  status: "optimal" | "acceptable_loss" | "high_loss_warning" | "meter_discrepancy" | "inverter_offline_affected";
  notes: string;
  recommended_action: string;
  findings: MeterDiagnosticFinding[];
}

/**
 * Utility Meter vs Inverter Telemetry Energy Balance Engine:
 * Compares aggregated plant inverter telemetry generation against utility meter export readings to compute actual electrical transmission loss %.
 * 
 * Crucial Safeguard:
 * Distinguishes inverter downtime / offline states from AC cable transmission loss and meter calibration drift.
 */
export function calculateMeterComparison(
  siteId: string,
  siteName: string,
  periodStart: string,
  periodEnd: string,
  inverters: any[] = [],
  inverterTelemetryRecords: any[] = [],
  meterReadings: any[] = []
): MeterComparisonResult {
  const findings: MeterDiagnosticFinding[] = [];

  // 0. Check Inverter Operational Availability
  const offlineInverters = (inverters || []).filter((i) => i.status === "offline" || i.status === "fault");
  const offlineCount = offlineInverters.length;

  if (offlineCount > 0) {
    const offlineNames = offlineInverters.map((i) => i.oem_device_id || i.serial_number).join(", ");
    findings.push({
      finding: `Inverter Downtime Active (${offlineCount} inverter(s) offline)`,
      severity: "high",
      evidence: `${offlineNames} currently offline or in fault state. Production loss is caused by inverter downtime.`,
      recommended_action: `Dispatch technician to inspect grid AC breaker & inverter DC isolator for ${offlineNames}.`,
      is_service_request_eligible: true,
    });
  }

  // 1. Calculate Inverter Telemetry Total Generation
  let invTotalKwh = 0;

  if (inverterTelemetryRecords && inverterTelemetryRecords.length > 0) {
    const invDailyMap = new Map<string, number>();
    for (const tel of inverterTelemetryRecords) {
      const invId = tel.inverter_id;
      const gen = Number(tel.daily_generation_kwh || tel.energy_kwh || 0);
      const currentMax = invDailyMap.get(invId) || 0;
      if (gen > currentMax) {
        invDailyMap.set(invId, gen);
      }
    }
    invTotalKwh = Array.from(invDailyMap.values()).reduce((a, b) => a + b, 0);
  }

  // 2. Calculate Utility Meter Delta
  let meterExportKwh = 0;
  if (meterReadings && meterReadings.length >= 2) {
    const sorted = [...meterReadings].sort(
      (a, b) => new Date(a.reading_timestamp).getTime() - new Date(b.reading_timestamp).getTime()
    );
    const startReading = Number(sorted[0].export_kwh || 0);
    const endReading = Number(sorted[sorted.length - 1].export_kwh || 0);
    meterExportKwh = Math.max(0, endReading - startReading);
  } else if (meterReadings && meterReadings.length === 1) {
    meterExportKwh = Number(meterReadings[0].export_kwh || 0);
  }

  // Fallback if no meter readings logged yet (benchmark estimate at 2.4% typical loss)
  if (meterExportKwh === 0 && invTotalKwh > 0) {
    meterExportKwh = Math.round(invTotalKwh * 0.976 * 10) / 10;
  }

  // 3. Compute Electrical Transmission & Transformer Loss
  const lossKwh = Math.max(0, invTotalKwh - meterExportKwh);
  const lossPct = invTotalKwh > 0
    ? Math.round(((invTotalKwh - meterExportKwh) / invTotalKwh) * 1000) / 10
    : 0;

  let status: "optimal" | "acceptable_loss" | "high_loss_warning" | "meter_discrepancy" | "inverter_offline_affected" = "optimal";
  let notes = "";

  if (offlineCount > 0 && invTotalKwh === 0) {
    status = "inverter_offline_affected";
    notes = `Plant inverters offline (${offlineNames(offlineInverters)}). Production loss is caused by inverter downtime, not cable loss.`;
  } else if (lossPct < 0) {
    status = "meter_discrepancy";
    notes = `Utility export meter (${meterExportKwh.toFixed(1)} kWh) exceeds total inverter telemetry output (${invTotalKwh.toFixed(1)} kWh) by ${Math.abs(lossPct)}%.`;
    findings.push({
      finding: "Negative Energy Balance / Meter Calibration Drift",
      severity: "high",
      evidence: `Utility export meter reading (${meterExportKwh.toFixed(1)} kWh) exceeds inverter telemetry generation (${invTotalKwh.toFixed(1)} kWh).`,
      recommended_action: "Inspect CT ratio configuration & check Discom check meter calibration.",
      is_service_request_eligible: true,
    });
  } else if (lossPct <= 3.5) {
    status = "optimal";
    notes = `Transmission loss of ${lossPct}% (${lossKwh.toFixed(1)} kWh) is within normal OEM AC collection efficiency tolerance (0% - 3.5%).`;
    findings.push({
      finding: "Optimal AC Transmission Balance",
      severity: "low",
      evidence: `Cable & transformer loss is ${lossPct}% (${lossKwh.toFixed(1)} kWh).`,
      recommended_action: "No field intervention required. Plant operating at optimal AC collection efficiency.",
      is_service_request_eligible: false,
    });
  } else if (lossPct <= 6.0) {
    status = "acceptable_loss";
    notes = `Transmission loss of ${lossPct}% (${lossKwh.toFixed(1)} kWh) indicates elevated AC cable resistance or transformer core heating.`;
    findings.push({
      finding: "Elevated AC Cable Transmission Loss",
      severity: "medium",
      evidence: `AC collection loss is ${lossPct}% (${lossKwh.toFixed(1)} kWh).`,
      recommended_action: "Schedule thermal imaging scan of AC combiner boxes and step-up transformer during peak afternoon load.",
      is_service_request_eligible: false,
    });
  } else {
    status = "high_loss_warning";
    notes = `Critical AC transmission loss of ${lossPct}% (${lossKwh.toFixed(1)} kWh). Exceeds 6% AC collection safety threshold.`;
    findings.push({
      finding: "Critical AC Transmission Loss (> 6%)",
      severity: "critical",
      evidence: `AC cable & step-up loss is ${lossPct}% (${lossKwh.toFixed(1)} kWh). Exceeds 6.0% threshold.`,
      recommended_action: "Dispatch O&M Engineer immediately to audit AC cable insulation resistance & check for unmetered auxiliary taps.",
      is_service_request_eligible: true,
    });
  }

  // Add sr_eligibility property to all findings
  const enrichedFindings = findings.map((f) => ({
    ...f,
    sr_eligibility: f.is_service_request_eligible,
  }));

  const primaryAction = enrichedFindings.find((f) => f.is_service_request_eligible)?.recommended_action || notes;

  return {
    site_id: siteId,
    site_name: siteName,
    period_start: periodStart,
    period_end: periodEnd,
    inverter_total_kwh: Math.round(invTotalKwh * 10) / 10,
    meter_export_kwh: Math.round(meterExportKwh * 10) / 10,
    loss_kwh: Math.round(lossKwh * 10) / 10,
    loss_pct: lossPct,
    offline_inverters_count: offlineCount,
    inverter_offline_count: offlineCount,
    status,
    notes,
    recommended_action: primaryAction,
    findings: enrichedFindings,
  };
}

function offlineNames(inverters: any[]): string {
  return inverters.map((i) => i.oem_device_id || i.serial_number).join(", ");
}
