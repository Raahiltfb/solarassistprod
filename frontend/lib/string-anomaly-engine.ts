import { Site, Inverter } from "./types";

export type AnomalyType = 
  | "string_disconnected" 
  | "sustained_underperformance" 
  | "transient_shadow" 
  | "voltage_droop";

export type AnomalySeverity = "low" | "medium" | "high" | "critical";

export interface StringAnomaly {
  id: string;
  string_id: string;
  string_index: number;
  inverter_id: string;
  inverter_name: string;
  site_id: string;
  site_name: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  current_a: number;
  expected_current_a: number;
  voltage_v: number;
  expected_voltage_v: number;
  deviation_pct: number;
  duration_mins: number;
  first_detected_at: string;
  last_detected_at: string;
  estimated_loss_kwh: number;
  estimated_loss_inr: number;
  recommendation: string;
}

export interface StringTelemetryPoint {
  id?: string;
  string_id: string;
  timestamp: string;
  voltage_v: number | null;
  current_a: number | null;
  power_kw: number | null;
  status?: string | null;
}

export interface StringMeta {
  id: string;
  inverter_id: string;
  string_index: number;
  capacity_kw?: number;
  modules_count?: number;
  status?: string;
}

/**
 * String Anomaly Detection Engine:
 * Analyzes multi-string telemetry streams to detect sustained underperformance vs transient shading vs disconnected strings.
 */
export function analyzeStringAnomalies(
  telemetry: StringTelemetryPoint[],
  strings: StringMeta[],
  inverters: any[],
  sites: any[]
): StringAnomaly[] {
  const anomalies: StringAnomaly[] = [];
  if (!telemetry || telemetry.length === 0 || !strings || strings.length === 0) {
    return anomalies;
  }

  // Lookup maps
  const stringMap = new Map<string, StringMeta>();
  strings.forEach((s) => stringMap.set(s.id, s));

  const inverterMap = new Map<string, any>();
  inverters.forEach((i) => inverterMap.set(i.id, i));

  const siteMap = new Map<string, any>();
  sites.forEach((s) => siteMap.set(s.id, s));

  // Group telemetry by inverter_id -> timestamp -> Array<{ string_id, point }>
  const invTimeMap = new Map<string, Map<string, Array<{ string_id: string; point: StringTelemetryPoint }>>>();

  for (const pt of telemetry) {
    const strObj = stringMap.get(pt.string_id);
    if (!strObj) continue;

    let timeMap = invTimeMap.get(strObj.inverter_id);
    if (!timeMap) {
      timeMap = new Map();
      invTimeMap.set(strObj.inverter_id, timeMap);
    }

    let list = timeMap.get(pt.timestamp);
    if (!list) {
      list = [];
      timeMap.set(pt.timestamp, list);
    }

    list.push({ string_id: pt.string_id, point: pt });
  }

  // Analyze each inverter's string readings over time
  invTimeMap.forEach((timeMap, invId) => {
    const invObj = inverterMap.get(invId);
    const siteObj = invObj ? siteMap.get(invObj.site_id) : null;

    // Track string anomaly streaks across timestamps
    const stringAnomStreak = new Map<string, {
      firstTs: string;
      lastTs: string;
      count: number;
      type: AnomalyType;
      sumCurrent: number;
      sumExpectedCurrent: number;
      sumVoltage: number;
      sumExpectedVoltage: number;
    }>();

    // Sort timestamps ascending
    const timestamps = Array.from(timeMap.keys()).sort();

    for (const ts of timestamps) {
      const readings = timeMap.get(ts)!;
      if (readings.length === 0) continue;

      // Filter active non-zero voltage readings to compute sister string benchmark
      const activeReadings = readings.filter((r) => (r.point.voltage_v || 0) > 50);
      if (activeReadings.length === 0) continue;

      const totalCurrent = activeReadings.reduce((sum, r) => sum + (Number(r.point.current_a) || 0), 0);
      const avgCurrent = totalCurrent / activeReadings.length;

      const totalVoltage = activeReadings.reduce((sum, r) => sum + (Number(r.point.voltage_v) || 0), 0);
      const avgVoltage = totalVoltage / activeReadings.length;

      // Only perform anomaly detection during active generation hours (avgCurrent > 0.5A)
      if (avgCurrent < 0.5) continue;

      for (const r of readings) {
        const strObj = stringMap.get(r.string_id);
        if (!strObj) continue;

        const curr = Number(r.point.current_a) || 0;
        const volt = Number(r.point.voltage_v) || 0;

        let detectedType: AnomalyType | null = null;

        if (curr === 0 && avgCurrent >= 2.0 && volt < 50) {
          detectedType = "string_disconnected";
        } else if (curr < 0.70 * avgCurrent && avgCurrent >= 1.5) {
          detectedType = "sustained_underperformance";
        } else if (volt < 0.85 * avgVoltage && avgVoltage >= 200) {
          detectedType = "voltage_droop";
        }

        if (detectedType) {
          const streak = stringAnomStreak.get(r.string_id);
          if (streak && streak.type === detectedType) {
            streak.lastTs = ts;
            streak.count += 1;
            streak.sumCurrent += curr;
            streak.sumExpectedCurrent += avgCurrent;
            streak.sumVoltage += volt;
            streak.sumExpectedVoltage += avgVoltage;
          } else {
            stringAnomStreak.set(r.string_id, {
              firstTs: ts,
              lastTs: ts,
              count: 1,
              type: detectedType,
              sumCurrent: curr,
              sumExpectedCurrent: avgCurrent,
              sumVoltage: volt,
              sumExpectedVoltage: avgVoltage,
            });
          }
        }
      }
    }

    // Process streaks into distinct string anomalies
    stringAnomStreak.forEach((streak, strId) => {
      const strObj = stringMap.get(strId)!;
      const firstMs = new Date(streak.firstTs).getTime();
      const lastMs = new Date(streak.lastTs).getTime();
      const diffMins = Math.max(15, Math.round((lastMs - firstMs) / 60000));

      let finalType = streak.type;
      let severity: AnomalySeverity = "medium";

      // Distinguish Transient vs Sustained:
      if (finalType === "sustained_underperformance" && diffMins < 45) {
        finalType = "transient_shadow";
        severity = "low";
      } else if (finalType === "sustained_underperformance") {
        severity = diffMins >= 180 ? "critical" : "high";
      } else if (finalType === "string_disconnected") {
        severity = "critical";
      } else if (finalType === "voltage_droop") {
        severity = "high";
      }

      const meanCurr = streak.sumCurrent / streak.count;
      const meanExpCurr = streak.sumExpectedCurrent / streak.count;
      const meanVolt = streak.sumVoltage / streak.count;
      const meanExpVolt = streak.sumExpectedVoltage / streak.count;

      const devPct = meanExpCurr > 0 
        ? Math.round(((meanCurr - meanExpCurr) / meanExpCurr) * 100) 
        : -100;

      const durationHours = diffMins / 60.0;
      const deltaCurrent = Math.max(0, meanExpCurr - meanCurr);
      const estLossKwh = Math.round((deltaCurrent * meanExpVolt * durationHours / 1000.0) * 100) / 100;
      const estLossInr = Math.round(estLossKwh * 7.5);

      let recommendation = "";
      if (finalType === "string_disconnected") {
        recommendation = `String #${strObj.string_index} is completely open circuit / 0A. Inspect DC fuse & MC4 connector at inverter ${invObj?.oem_device_id || "inverter"}.`;
      } else if (finalType === "sustained_underperformance") {
        recommendation = `Sustained ${Math.abs(devPct)}% underperformance on String #${strObj.string_index}. Check module soiling, glass hotspot, or broken string bypass diode.`;
      } else if (finalType === "transient_shadow") {
        recommendation = `Transient shadow / cloud dip detected on String #${strObj.string_index} (${diffMins} mins). Monitor for self-recovery.`;
      } else {
        recommendation = `Voltage droop (${Math.round(meanVolt)}V vs ${Math.round(meanExpVolt)}V expected) on String #${strObj.string_index}. Check PID or string module mismatch.`;
      }

      anomalies.push({
        id: `anom-${strId}-${firstMs}`,
        string_id: strId,
        string_index: strObj.string_index,
        inverter_id: invId,
        inverter_name: invObj?.oem_device_id || "Inverter",
        site_id: invObj?.site_id || "",
        site_name: siteObj?.name || "Site",
        type: finalType,
        severity,
        current_a: Math.round(meanCurr * 100) / 100,
        expected_current_a: Math.round(meanExpCurr * 100) / 100,
        voltage_v: Math.round(meanVolt * 10) / 10,
        expected_voltage_v: Math.round(meanExpVolt * 10) / 10,
        deviation_pct: devPct,
        duration_mins: diffMins,
        first_detected_at: streak.firstTs,
        last_detected_at: streak.lastTs,
        estimated_loss_kwh: estLossKwh,
        estimated_loss_inr: estLossInr,
        recommendation,
      });
    });
  });

  // Sort anomalies by severity rank then estimated loss descending
  const severityRank: Record<AnomalySeverity, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  anomalies.sort((a, b) => {
    if (severityRank[b.severity] !== severityRank[a.severity]) {
      return severityRank[b.severity] - severityRank[a.severity];
    }
    return b.estimated_loss_kwh - a.estimated_loss_kwh;
  });

  return anomalies;
}
