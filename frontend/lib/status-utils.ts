/**
 * Canonical helper functions for calculating site and inverter communication status
 * based on telemetry freshness and alarm states.
 */

export type InverterStatusDisplay = "ONLINE" | "OFFLINE" | "NO GRID" | "STANDBY" | "FAULT";
export type SiteStatusDisplay = "ONLINE" | "OFFLINE" | "PARTIALLY ONLINE";

export function parseUtcDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  let iso = dateStr.trim();
  if (iso.includes(" ") && !iso.includes("T")) {
    iso = iso.replace(" ", "T");
  }
  if (!iso.endsWith("Z") && !iso.includes("+") && !iso.includes("-", 10)) {
    iso += "Z";
  }
  const parsed = new Date(iso);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function getInverterStatus(
  inverter: {
    status?: string;
    last_seen_at?: string | null;
  },
  latestTelemetry?: string | { timestamp?: string; last_update?: string; online_status?: boolean; ac_power_kw?: number; dc_power_kw?: number },
  hasActiveGenerationToday?: boolean
): InverterStatusDisplay {
  let latestTelemetryTimestamp: string | undefined;
  let isTelemetryOnline: boolean | undefined;
  let telemetryAcPower: number | undefined;

  if (typeof latestTelemetry === "string") {
    latestTelemetryTimestamp = latestTelemetry;
  } else if (latestTelemetry && typeof latestTelemetry === "object") {
    latestTelemetryTimestamp = latestTelemetry.timestamp || latestTelemetry.last_update;
    if (typeof latestTelemetry.online_status === "boolean") {
      isTelemetryOnline = latestTelemetry.online_status;
    }
    if (latestTelemetry.ac_power_kw !== undefined && latestTelemetry.ac_power_kw !== null) {
      telemetryAcPower = Number(latestTelemetry.ac_power_kw);
    }
  }

  let lastSeenStr = inverter.last_seen_at || undefined;
  
  if (latestTelemetryTimestamp && lastSeenStr) {
    const t1 = parseUtcDate(lastSeenStr)?.getTime() || 0;
    const t2 = parseUtcDate(latestTelemetryTimestamp)?.getTime() || 0;
    if (t2 > t1) {
      lastSeenStr = latestTelemetryTimestamp;
    }
  }

  const lastSeen = parseUtcDate(lastSeenStr);
  if (!lastSeen) {
    if (hasActiveGenerationToday && inverter.status?.toLowerCase() === "online") {
      return "ONLINE";
    }
    return "OFFLINE";
  }

  const now = new Date();
  const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);

  // Solar diurnal awareness: In India (Asia/Kolkata UTC+5:30), solar arrays shut down after sunset (~18:00 IST)
  // and resume at sunrise (~06:00 IST). Inverters that communicated normally through today's daylight
  // hours enter healthy STANDBY / SLEEP mode during night hours, not communication failure.
  const istHours = (now.getUTCHours() + 5.5 + now.getUTCMinutes() / 60) % 24;
  const isNighttime = istHours >= 18.0 || istHours < 6.0;
  const lastSeenIstHours = (lastSeen.getUTCHours() + 5.5 + lastSeen.getUTCMinutes() / 60) % 24;

  // 1. Long-term offline or multi-day communication failure:
  // If no communication for > 14 hours, it missed today's entire daylight generation cycle
  // and is genuinely disconnected/offline regardless of day or night.
  if (diffMinutes >= 14 * 60) {
    return "OFFLINE";
  }

  // 2. Explicit OEM / database status checks:
  const dbStatus = inverter.status?.toLowerCase();
  if (dbStatus === "offline" || dbStatus === "disconnected" || dbStatus === "comm_error") {
    if (isNighttime && diffMinutes < 14 * 60 && lastSeenIstHours >= 17.0) {
      return "STANDBY";
    }
    return "OFFLINE";
  }
  if (isTelemetryOnline === false && diffMinutes > 30) {
    if (isNighttime && diffMinutes < 14 * 60 && lastSeenIstHours >= 17.0) {
      return "STANDBY";
    }
    return "OFFLINE";
  }
  if (dbStatus === "fault") {
    return "FAULT";
  }
  if (dbStatus === "no grid" || dbStatus === "no_grid") {
    return "NO GRID";
  }

  // 3. Solar diurnal cycle: During night hours (18:00 IST to 06:00 IST):
  // An inverter is in healthy nighttime STANDBY only if it operated through the end of today's daylight generation cycle (until after 17:00 IST).
  // If it stopped communicating before 17:00 IST during active daytime, it suffered a daytime outage and remains OFFLINE.
  if (isNighttime) {
    if (lastSeenIstHours < 17.0 && diffMinutes > 45) {
      return "OFFLINE";
    }
    return "STANDBY";
  }

  // 4. Daylight hours (06:00 to 18:00 IST):
  // Freshness threshold accounting for OEM datalogger batch upload intervals (typically 5-15 mins):
  // If no polled communication has been received for > 45 minutes during active daylight hours,
  // the datalogger is unreachable / offline. Stale power from previous hours cannot override this.
  if (diffMinutes > 45) {
    return "OFFLINE";
  }

  // Within fresh communication window (diffMinutes <= 45):
  // Check active generation
  if ((telemetryAcPower !== undefined && telemetryAcPower > 0.05) ||
      (typeof latestTelemetry === "object" && latestTelemetry && ((Number(latestTelemetry.ac_power_kw) || 0) > 0.05 || (Number(latestTelemetry.dc_power_kw) || 0) > 0.05))) {
    return "ONLINE";
  }

  if (isTelemetryOnline === true || dbStatus === "online" || dbStatus === "normal") {
    return "ONLINE";
  }

  return "STANDBY";
}

export function getSiteStatus(
  inverters: Array<{ id?: string; status?: string; last_seen_at?: string | null }>,
  latestTelemetryMap?: Map<string, any>, // inverter_id -> timestamp string or telemetry object
  hasActiveGenerationToday?: boolean,
  serviceTier?: string
): SiteStatusDisplay {
  if (serviceTier === "cleaning_only") {
    return "ONLINE"; // Cleaning-only sites do not have inverters or telemetry and must not generate offline alerts
  }

  if (!inverters || inverters.length === 0) {
    return "ONLINE";
  }

  let onlineCount = 0;
  let offlineCount = 0;

  for (const inv of inverters) {
    let telInput: any = undefined;
    if (latestTelemetryMap && inv.id) {
      const val = latestTelemetryMap.get(inv.id);
      if (typeof val === "string") {
        telInput = val;
      } else if (val && typeof val === "object") {
        telInput = val;
      }
    }
    const invStatus = getInverterStatus(inv, telInput, hasActiveGenerationToday);

    if (invStatus === "OFFLINE") {
      offlineCount++;
    } else {
      onlineCount++;
    }
  }

  if (onlineCount === 0) {
    return "OFFLINE";
  }
  if (offlineCount > 0) {
    return "PARTIALLY ONLINE";
  }
  return "ONLINE";
}
