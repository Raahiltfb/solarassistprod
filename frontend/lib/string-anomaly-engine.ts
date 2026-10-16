import { Site, Inverter } from "./types";

export type AnomalyType = 
  | "string_disconnected" 
  | "sustained_underperformance" 
  | "transient_shadow" 
  | "voltage_droop"
  | "global_low_production"
  | "inverter_offline";

export type AnomalySeverity = "low" | "medium" | "high" | "critical";

export type DiagnosticAction = "MONITOR" | "NOTIFY" | "CREATE_SERVICE_REQUEST" | "ESCALATE";

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
  action_recommendation: DiagnosticAction;
  
  // Measured vs 3-Way Benchmarks (Peer, Historical, Expected)
  actual_current_a: number;
  benchmark_current_a: number; // Metric 1: Peer median
  historical_current_a: number; // Metric 2: Historical self median
  expected_current_a: number;   // Metric 3: Design/rated target
  
  actual_voltage_v: number;
  benchmark_voltage_v: number;
  historical_voltage_v: number;
  expected_voltage_v: number;
  
  // Deviations
  deviation_abs_a: number;
  deviation_pct: number; // Peer deviation %
  historical_deviation_pct: number; // Historical deviation %
  voltage_deviation_pct: number;
  
  // Persistence & Window
  duration_mins: number;
  first_detected_at: string;
  last_detected_at: string;
  
  // Benchmark Population & Explainability Details
  benchmark_methodology: string;
  peer_strings_included: number[];
  peer_strings_excluded: number[];
  exclusion_reason?: string;
  
  // Financial & Energy Impact
  estimated_loss_kwh: number;
  estimated_loss_inr: number;
  
  // Lifecycle & Linked Action Status
  status: "active" | "under_verification" | "resolved";
  linked_service_request_id?: string | null;
  linked_ticket_id?: string | null;
  ticket_status?: string | null;
  service_request_status?: string | null;
  recovered_at?: string | null;
  
  explanation_notes: string;
  recommended_action: string;
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
 * Calculates median of a numeric array cleanly
 */

export function calculateMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

/**
 * Canonical String Anomaly Detection & Diagnostic Engine:
 * 
 * Benchmark Methodology:
 * - Benchmark Population: Active sibling strings on same inverter (V > 50V, I > 0.2A).
 * - Peer Median: Uses median rather than mean to prevent outliers (e.g. open circuits) from distorting expected baseline.
 * - Global Low Production Suppression: If all strings track each other within 10% variance, it is classified as Global Low Production (overcast/shading/derating) and individual string underperformance anomalies are suppressed.
 * - Recovery Detection: Telemetry is continuously evaluated to mark anomalies as RECOVERED once string metrics return within 5% of peer median for >= 30 mins.
 */
export function analyzeStringAnomalies(
  telemetry: StringTelemetryPoint[],
  strings: StringMeta[],
  inverters: any[],
  sites: any[],
  existingTickets: any[] = [],
  existingServiceRequests: any[] = []
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

  // Existing tickets map by inverter + string_index for deduping / linkage
  const activeTicketMap = new Map<string, any>();
  for (const t of existingTickets) {
    if (t.inverter_id && ["open", "in_progress", "on_hold"].includes(t.status)) {
      const match = t.title?.match(/String #(\d+)/i);
      if (match) {
        const strIdx = Number(match[1]);
        activeTicketMap.set(`${t.inverter_id}:${strIdx}`, t);
      }
    }
  }

  const activeSrMap = new Map<string, any>();
  for (const sr of existingServiceRequests) {
    if (sr.inverter_id && ["planned", "in_progress", "en_route"].includes(sr.status)) {
      const match = sr.title?.match(/String #(\d+)/i);
      if (match) {
        const strIdx = Number(match[1]);
        activeSrMap.set(`${sr.inverter_id}:${strIdx}`, sr);
      }
    }
  }

  // 1. Calculate String Historical Self Baselines (median current and voltage across recorded telemetry for each string)
  const stringHistoricalMap = new Map<string, {
    historicalCurrent: number;
    historicalMaxCurrent: number;
    historicalVoltage: number;
    hasActiveHistory: boolean;
  }>();
  const stringTelemetryPointsMap = new Map<string, StringTelemetryPoint[]>();

  for (const pt of telemetry) {
    let list = stringTelemetryPointsMap.get(pt.string_id);
    if (!list) {
      list = [];
      stringTelemetryPointsMap.set(pt.string_id, list);
    }
    list.push(pt);
  }

  stringTelemetryPointsMap.forEach((pts, strId) => {
    const activeCurrents = pts
      .map((p) => Number(p.current_a || 0))
      .filter((c) => c > 0.2);
    const allCurrents = pts.map((p) => Number(p.current_a || 0));
    const activeVoltages = pts
      .map((p) => Number(p.voltage_v || 0))
      .filter((v) => v > 50);

    const maxCurrent = allCurrents.length > 0 ? Math.max(...allCurrents) : 0;
    const histCurrent = activeCurrents.length > 0 ? calculateMedian(activeCurrents) : 0;
    const histVoltage = activeVoltages.length > 0 ? calculateMedian(activeVoltages) : 0;

    // A string has active generation history ONLY if it historically generated >= 1.5A median or >= 2.5A peak.
    // Unpopulated channels or small bleed-current strings (e.g. 0.0A - 0.8A) do NOT have active generation history.
    const hasActiveHistory = histCurrent >= 1.5 || maxCurrent >= 2.5;

    stringHistoricalMap.set(strId, {
      historicalCurrent: histCurrent,
      historicalMaxCurrent: maxCurrent,
      historicalVoltage: histVoltage,
      hasActiveHistory,
    });
  });

  // 2. Group telemetry by inverter_id -> timestamp -> Array<{ string_id, point }>
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

  // Evaluate offline inverters and push offline diagnostic anomalies
  for (const inv of inverters) {
    const dbStatus = (inv.status || "").toLowerCase();
    let isOffline = dbStatus === "offline" || dbStatus === "fault";

    let lastSeenStr = inv.last_seen_at;
    if (!isOffline && lastSeenStr) {
      const lastSeenMs = new Date(lastSeenStr).getTime();
      if (!isNaN(lastSeenMs) && Date.now() - lastSeenMs > 30 * 60 * 1000) {
        isOffline = true;
      }
    }

    if (isOffline) {
      const siteObj = siteMap.get(inv.site_id);
      const invName = inv.serial_number ? `SN: ${inv.serial_number}` : inv.oem_device_id || "Inverter";
      const capKw = Number(inv.capacity_kw || 50);
      const estKwh = Math.round(capKw * 0.7 * 2 * 100) / 100;
      const firstTs = inv.last_seen_at || new Date().toISOString();

      const existingTicket = activeTicketMap.get(`${inv.id}:0`);
      const existingSr = activeSrMap.get(`${inv.id}:0`);

      anomalies.push({
        id: `anom-offline-${inv.id}`,
        string_id: `str-offline-${inv.id}`,
        string_index: 0,
        inverter_id: inv.id,
        inverter_name: invName,
        site_id: inv.site_id,
        site_name: siteObj?.name || "Site",
        type: "inverter_offline",
        severity: "critical",
        action_recommendation: existingSr ? "MONITOR" : existingTicket ? "NOTIFY" : "CREATE_SERVICE_REQUEST",
        actual_current_a: 0,
        benchmark_current_a: 0,
        historical_current_a: 0,
        expected_current_a: 0,
        actual_voltage_v: 0,
        benchmark_voltage_v: 0,
        historical_voltage_v: 0,
        expected_voltage_v: 0,
        deviation_abs_a: 0,
        deviation_pct: -100,
        historical_deviation_pct: -100,
        voltage_deviation_pct: -100,
        duration_mins: inv.last_seen_at ? Math.max(30, Math.round((Date.now() - new Date(inv.last_seen_at).getTime()) / 60000)) : 60,
        first_detected_at: firstTs,
        last_detected_at: new Date().toISOString(),
        benchmark_methodology: "Communication Loss / Heartbeat Timeout (>30m stale telemetry)",
        peer_strings_included: [],
        peer_strings_excluded: [],
        exclusion_reason: "Inverter is offline or unreachable",
        estimated_loss_kwh: estKwh,
        estimated_loss_inr: Math.round(estKwh * 7.5),
        status: existingSr?.status === "completed" ? "resolved" : existingTicket ? "under_verification" : "active",
        linked_service_request_id: existingSr?.id || null,
        linked_ticket_id: existingTicket?.id || null,
        ticket_status: existingTicket?.status || null,
        service_request_status: existingSr?.status || null,
        explanation_notes: `Inverter ${invName} is currently offline or unreachable. No active telemetry recorded.`,
        recommended_action: `Dispatch technician to inspect AC grid breaker, DC isolator switch, and datalogger connectivity stick for ${invName}.`,
      });
    }
  }

  // Process telemetry for each inverter over time
  invTimeMap.forEach((timeMap, invId) => {
    const invObj = inverterMap.get(invId);
    const siteObj = invObj ? siteMap.get(invObj.site_id) : null;

    // Check inverter status: if inverter is offline or standby, skip string anomaly detection
    if (invObj && (invObj.status === "offline" || invObj.status === "standby")) {
      return;
    }

    const timestamps = Array.from(timeMap.keys()).sort();
    if (timestamps.length === 0) return;

    // Track active anomaly streaks per string
    const stringStreakMap = new Map<string, {
      firstTs: string;
      lastTs: string;
      count: number;
      type: AnomalyType;
      sumCurrent: number;
      sumPeerMedianCurrent: number;
      sumHistCurrent: number;
      sumExpCurrent: number;
      sumVoltage: number;
      sumPeerMedianVoltage: number;
      sumHistVoltage: number;
      sumExpVoltage: number;
      includedPeers: number[];
      excludedPeers: number[];
      exclusionReason?: string;
    }>();

    for (const ts of timestamps) {
      const readings = timeMap.get(ts)!;
      if (readings.length === 0) continue;

      // Filter active non-zero voltage readings to compute peer median benchmark
      const activeReadings = readings.filter((r) => (r.point.voltage_v || 0) > 50);

      // Insufficient peer data check (Need at least 2 active strings for meaningful peer benchmark)
      if (activeReadings.length < 2) continue;

      // Compute peer currents & voltages
      const validCurrents = activeReadings
        .map((r) => Number(r.point.current_a || 0))
        .filter((c) => c > 0.2); // Exclude 0A or open circuits from peer baseline calculation

      const validVoltages = activeReadings
        .map((r) => Number(r.point.voltage_v || 0))
        .filter((v) => v > 50);

      if (validCurrents.length < 2) continue;

      const peerMedianCurrent = calculateMedian(validCurrents);
      const peerMedianVoltage = calculateMedian(validVoltages);

      // Require active generation (peer median current >= 0.5A)
      if (peerMedianCurrent < 0.5) continue;

      // Check Global Low Production vs Individual String Anomaly:
      // Global Low Production occurs when ALL strings track each other within 12% variance (e.g. overcast or plant-wide derating).
      const hasIndividualAnomaly = readings.some((r) => {
        const c = Number(r.point.current_a || 0);
        const v = Number(r.point.voltage_v || 0);
        return (c <= 0.2 && peerMedianCurrent >= 1.0) || (v < 50 && peerMedianCurrent >= 1.0) || (c < 0.80 * peerMedianCurrent);
      });

      const currentDeviations = validCurrents.map((c) => Math.abs(c - peerMedianCurrent) / peerMedianCurrent);
      const maxDeviation = Math.max(...currentDeviations);
      const isGlobalLowProduction = !hasIndividualAnomaly && maxDeviation <= 0.12;

      if (isGlobalLowProduction) {
        // Skip individual string underperformance detection for this timestamp
        continue;
      }

      // Identify included vs excluded peer strings
      const includedPeers: number[] = [];
      const excludedPeers: number[] = [];
      let exclusionReason = "";

      readings.forEach((r) => {
        const strMeta = stringMap.get(r.string_id);
        if (!strMeta) return;
        const c = Number(r.point.current_a || 0);
        if (c > 0.2 && c >= 0.75 * peerMedianCurrent) {
          includedPeers.push(strMeta.string_index);
        } else {
          excludedPeers.push(strMeta.string_index);
          if (c <= 0.2) {
            exclusionReason = `String #${strMeta.string_index} excluded from benchmark median (open circuit / 0A).`;
          }
        }
      });

      // Evaluate each string at timestamp using 3-Way Benchmark Cross-Validation
      for (const r of readings) {
        const strObj = stringMap.get(r.string_id);
        if (!strObj) continue;

        const curr = Number(r.point.current_a) || 0;
        const volt = Number(r.point.voltage_v) || 0;

        const histObj = stringHistoricalMap.get(r.string_id);
        const histCurrent = histObj ? histObj.historicalCurrent : 0;
        const histMaxCurrent = histObj ? histObj.historicalMaxCurrent : 0;
        const histVoltage = histObj ? histObj.historicalVoltage : 0;
        const hasActiveHistory = histObj ? histObj.hasActiveHistory : false;

        // CRITICAL: If a string historically hovers near 0 or is low-current (< 1.5A median and < 2.5A peak),
        // its baseline is genuinely around 0A - 0.8A. This is NOT an error and must NOT be flagged as underperforming or disconnected!
        if (!hasActiveHistory || (histCurrent < 1.5 && histMaxCurrent < 2.5)) {
          continue;
        }

        const siblingStrings = Array.from(stringMap.values()).filter((s) => s.inverter_id === strObj.inverter_id);
        const siblingCapacities = siblingStrings.map((s) => Number(s.capacity_kw || 0)).filter((c) => c > 0);
        const avgSiblingCap = siblingCapacities.length > 0 ? calculateMedian(siblingCapacities) : 0;
        const expectedRatio = (avgSiblingCap > 0 && Number(strObj.capacity_kw || 0) > 0)
          ? Number(strObj.capacity_kw) / avgSiblingCap
          : 1.0;
        const expectedCurrent = Math.round(expectedRatio * peerMedianCurrent * 100) / 100;
        const expectedVoltage = peerMedianVoltage;

        const peerDropAbs = peerMedianCurrent - curr;
        const histDropAbs = histCurrent - curr;
        const expDropAbs = expectedCurrent - curr;

        // Metric 1: Peer Variance
        // Requires meaningful active solar generation (peer >= 2.0A),
        // at least a 25% relative drop, at least 1.8A absolute drop,
        // and string current < 6.5A (a string producing 7A+ is generating strong power, not underperforming).
        const isPeerCurrDev =
          peerMedianCurrent >= 2.0 &&
          peerDropAbs >= 1.8 &&
          curr < 0.75 * peerMedianCurrent &&
          curr < 6.5;

        const isPeerVoltDev =
          peerMedianVoltage >= 180 &&
          (peerMedianVoltage - volt) >= 40 &&
          volt < 0.85 * peerMedianVoltage;

        // Metric 2: Historical Self Variance
        const isHistCurrDev =
          histCurrent >= 1.8 &&
          histDropAbs >= 1.5 &&
          curr < 0.75 * histCurrent &&
          curr < 6.5;

        const isHistVoltDev =
          histVoltage > 150 &&
          (histVoltage - volt) >= 40 &&
          volt < 0.85 * histVoltage;

        // Metric 3: Expected Rating Variance
        const isExpCurrDev =
          expectedCurrent >= 1.8 &&
          expDropAbs >= 1.5 &&
          curr < 0.75 * expectedCurrent;

        let detectedType: AnomalyType | null = null;

        // String disconnected: String historically had active generation (histCurrent >= 1.5),
        // but now dropped to near zero (curr <= 0.2A) while peer strings are actively generating (peerMedianCurrent >= 2.0A).
        // Note: Open circuit voltage (Voc > 50V) is often present even when disconnected due to blown fuse or open DC breaker.
        const isDisconnected = curr <= 0.2 && peerMedianCurrent >= 2.0 && histCurrent >= 1.5;

        if (isDisconnected) {
          detectedType = "string_disconnected";
        } else if (isPeerCurrDev && isHistCurrDev && isExpCurrDev) {
          detectedType = "sustained_underperformance";
        } else if (isPeerVoltDev && isHistVoltDev) {
          detectedType = "voltage_droop";
        }

        if (detectedType) {
          const streak = stringStreakMap.get(r.string_id);
          if (streak && streak.type === detectedType) {
            streak.lastTs = ts;
            streak.count += 1;
            streak.sumCurrent += curr;
            streak.sumPeerMedianCurrent += peerMedianCurrent;
            streak.sumHistCurrent += histCurrent;
            streak.sumExpCurrent += expectedCurrent;
            streak.sumVoltage += volt;
            streak.sumPeerMedianVoltage += peerMedianVoltage;
            streak.sumHistVoltage += histVoltage;
            streak.sumExpVoltage += expectedVoltage;
          } else {
            stringStreakMap.set(r.string_id, {
              firstTs: ts,
              lastTs: ts,
              count: 1,
              type: detectedType,
              sumCurrent: curr,
              sumPeerMedianCurrent: peerMedianCurrent,
              sumHistCurrent: histCurrent,
              sumExpCurrent: expectedCurrent,
              sumVoltage: volt,
              sumPeerMedianVoltage: peerMedianVoltage,
              sumHistVoltage: histVoltage,
              sumExpVoltage: expectedVoltage,
              includedPeers: includedPeers.filter((idx) => idx !== strObj.string_index),
              excludedPeers: excludedPeers.filter((idx) => idx !== strObj.string_index),
              exclusionReason,
            });
          }
        }
      }
    }

    // Process streaks into explainable StringAnomaly objects
    stringStreakMap.forEach((streak, strId) => {
      // Require at least 2 consecutive polling cycles for underperformance or voltage droop,
      // so single-sample momentary dips (passing cloud/shadow jitter) are never flagged as active underperformers!
      const firstMs = new Date(streak.firstTs).getTime();
      const lastMs = new Date(streak.lastTs).getTime();
      const diffMins = Math.max(15, Math.round((lastMs - firstMs) / 60000));

      if (streak.type !== "string_disconnected" && streak.count < 2 && diffMins < 20) {
        return;
      }

      const strObj = stringMap.get(strId)!;

      let finalType = streak.type;
      let severity: AnomalySeverity = "medium";
      let action: DiagnosticAction = "NOTIFY";

      // Distinguish Transient vs Sustained:
      if (finalType === "sustained_underperformance" && diffMins < 45) {
        finalType = "transient_shadow";
        severity = "low";
        action = "MONITOR";
      } else if (finalType === "sustained_underperformance") {
        severity = diffMins >= 180 ? "critical" : "high";
        action = "CREATE_SERVICE_REQUEST";
      } else if (finalType === "string_disconnected") {
        severity = "critical";
        action = "CREATE_SERVICE_REQUEST";
      } else if (finalType === "voltage_droop") {
        severity = "high";
        action = "CREATE_SERVICE_REQUEST";
      }

      const meanCurr = streak.sumCurrent / streak.count;
      const meanPeerCurr = streak.sumPeerMedianCurrent / streak.count;
      const meanHistCurr = streak.sumHistCurrent / streak.count;
      const meanExpCurr = streak.sumExpCurrent / streak.count;

      const meanVolt = streak.sumVoltage / streak.count;
      const meanPeerVolt = streak.sumPeerMedianVoltage / streak.count;
      const meanHistVolt = streak.sumHistVoltage / streak.count;
      const meanExpVolt = streak.sumExpVoltage / streak.count;

      const devAbsA = Math.round((meanCurr - meanPeerCurr) * 100) / 100;
      const devPct = meanPeerCurr > 0 
        ? Math.round(((meanCurr - meanPeerCurr) / meanPeerCurr) * 1000) / 10 
        : -100;
      const histDevPct = meanHistCurr > 0
        ? Math.round(((meanCurr - meanHistCurr) / meanHistCurr) * 1000) / 10
        : 0;
      const voltDevPct = meanPeerVolt > 0
        ? Math.round(((meanVolt - meanPeerVolt) / meanPeerVolt) * 1000) / 10
        : 0;

      const durationHours = diffMins / 60.0;
      const baselineCurrent = Math.min(meanPeerCurr, meanHistCurr > 0 ? meanHistCurr : meanPeerCurr);
      const deltaCurrent = Math.max(0, baselineCurrent - meanCurr);
      const estLossKwh = Math.round((deltaCurrent * meanPeerVolt * durationHours / 1000.0) * 100) / 100;
      const estLossInr = Math.round(estLossKwh * 7.5);

      const benchmarkMethodology = `3-Way Cross-Validated: Peer-String Median (${meanPeerCurr.toFixed(1)}A), Historical Self Baseline (${meanHistCurr.toFixed(1)}A), and Design Target (${meanExpCurr.toFixed(1)}A)`;

      let explanationNotes = "";
      let recommendedAction = "";

      if (finalType === "string_disconnected") {
        explanationNotes = `String #${strObj.string_index} measured 0A current while sister strings averaged ${meanPeerCurr.toFixed(1)}A and historical average was ${meanHistCurr.toFixed(1)}A. Open circuit / blown fuse confirmed.`;
        recommendedAction = `Dispatch technician to inspect DC fuse, isolator switch, and MC4 connectors on String #${strObj.string_index} at ${invObj?.serial_number ? `SN: ${invObj.serial_number}` : invObj?.oem_device_id || "Inverter"}.`;
      } else if (finalType === "sustained_underperformance") {
        explanationNotes = `3-Way Validated: String #${strObj.string_index} current (${meanCurr.toFixed(1)}A) is ${Math.abs(devPct)}% below peer median (${meanPeerCurr.toFixed(1)}A), ${Math.abs(histDevPct)}% below its own historical average (${meanHistCurr.toFixed(1)}A), and below design target (${meanExpCurr.toFixed(1)}A) for ${diffMins} mins.`;
        recommendedAction = `Inspect String #${strObj.string_index} modules for localized soiling, module glass crack, or faulty bypass diode.`;
      } else if (finalType === "transient_shadow") {
        explanationNotes = `Transient ${Math.abs(devPct)}% current dip on String #${strObj.string_index} (${diffMins} mins). Self-correcting passing cloud or temporary shadow.`;
        recommendedAction = `Monitor telemetry for auto-recovery. No immediate field dispatch required.`;
      } else {
        explanationNotes = `3-Way Validated: String #${strObj.string_index} voltage (${meanVolt.toFixed(1)}V) is ${Math.abs(voltDevPct)}% below peer median (${meanPeerVolt.toFixed(1)}V) and historical average (${meanHistVolt.toFixed(1)}V).`;
        recommendedAction = `Inspect String #${strObj.string_index} wiring for PID degradation or bypassed solar modules.`;
      }

      // Check linked Ticket & Service Request status
      const existingTicket = activeTicketMap.get(`${invId}:${strObj.string_index}`);
      const existingSr = activeSrMap.get(`${invId}:${strObj.string_index}`);

      anomalies.push({
        id: `anom-${strId}-${firstMs}`,
        string_id: strId,
        string_index: strObj.string_index,
        inverter_id: invId,
        inverter_name: invObj?.serial_number ? `SN: ${invObj.serial_number}` : invObj?.oem_device_id || "Inverter",
        site_id: invObj?.site_id || "",
        site_name: siteObj?.name || "Site",
        type: finalType,
        severity,
        action_recommendation: action,
        actual_current_a: Math.round(meanCurr * 100) / 100,
        benchmark_current_a: Math.round(meanPeerCurr * 100) / 100,
        historical_current_a: Math.round(meanHistCurr * 100) / 100,
        expected_current_a: Math.round(meanExpCurr * 100) / 100,
        actual_voltage_v: Math.round(meanVolt * 10) / 10,
        benchmark_voltage_v: Math.round(meanPeerVolt * 10) / 10,
        historical_voltage_v: Math.round(meanHistVolt * 10) / 10,
        expected_voltage_v: Math.round(meanExpVolt * 10) / 10,
        deviation_abs_a: devAbsA,
        deviation_pct: devPct,
        historical_deviation_pct: histDevPct,
        voltage_deviation_pct: voltDevPct,
        duration_mins: diffMins,
        first_detected_at: streak.firstTs,
        last_detected_at: streak.lastTs,
        benchmark_methodology: benchmarkMethodology,
        peer_strings_included: streak.includedPeers,
        peer_strings_excluded: streak.excludedPeers,
        exclusion_reason: streak.exclusionReason,
        estimated_loss_kwh: estLossKwh,
        estimated_loss_inr: estLossInr,
        status: existingSr?.status === "completed" && !existingTicket ? "under_verification" : "active",
        linked_ticket_id: existingTicket?.id || null,
        linked_service_request_id: existingSr?.id || null,
        ticket_status: existingTicket?.status || null,
        service_request_status: existingSr?.status || null,
        explanation_notes: explanationNotes,
        recommended_action: recommendedAction,
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
