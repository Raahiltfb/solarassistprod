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
  latestTelemetry?: string | { timestamp?: string; last_update?: string; online_status?: boolean },
  hasActiveGenerationToday?: boolean
): InverterStatusDisplay {
  let latestTelemetryTimestamp: string | undefined;
  let isTelemetryOnline: boolean | undefined;

  if (typeof latestTelemetry === "string") {
    latestTelemetryTimestamp = latestTelemetry;
  } else if (latestTelemetry && typeof latestTelemetry === "object") {
    latestTelemetryTimestamp = latestTelemetry.timestamp || latestTelemetry.last_update;
    if (typeof latestTelemetry.online_status === "boolean") {
      isTelemetryOnline = latestTelemetry.online_status;
    }
  }

  let lastSeenStr = inverter.last_seen_at || undefined;
  
  if (latestTelemetryTimestamp) {
    const t1 = parseUtcDate(lastSeenStr)?.getTime() || 0;
    const t2 = parseUtcDate(latestTelemetryTimestamp)?.getTime() || 0;
    if (t2 > t1) {
      lastSeenStr = latestTelemetryTimestamp;
    }
  }

  const lastSeen = parseUtcDate(lastSeenStr);
  if (!lastSeen) {
    if (hasActiveGenerationToday) return "ONLINE";
    return "OFFLINE";
  }

  const now = new Date();
  const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);

  // If OEM telemetry explicitly reports offline / disconnected state and data is beyond 20 mins
  if (isTelemetryOnline === false && diffMinutes > 20 && !hasActiveGenerationToday) {
    return "OFFLINE";
  }

  const dbStatus = inverter.status?.toLowerCase();
  if (dbStatus === "offline" || dbStatus === "comm_error" || dbStatus === "disconnected") {
    // If database explicitly recorded an offline/communication error and there is no active generation
    if (!hasActiveGenerationToday) {
      return "OFFLINE";
    }
  }

  if (dbStatus === "fault") {
    return "FAULT";
  }
  if (dbStatus === "standby") {
    return "STANDBY";
  }
  if (dbStatus === "no grid" || dbStatus === "no_grid") {
    return "NO GRID";
  }

  // Stale beyond 60 minutes threshold (4 missed 15-min sync intervals) during daylight
  if (diffMinutes > 60) {
    if (hasActiveGenerationToday && diffMinutes < 14 * 60) {
      return "ONLINE";
    }
    // Solar diurnal awareness: In India (Asia/Kolkata), solar arrays shut down after sunset (~18:30 IST)
    // and resume at sunrise (~06:00 IST). Inverters that communicated normally during today's daylight
    // hours are in healthy STANDBY / SLEEP mode during night hours, not communication failure.
    const istHours = (now.getUTCHours() + 5.5) % 24;
    const isNighttime = istHours >= 18.5 || istHours < 6.0;
    if (isNighttime && diffMinutes < 14 * 60) {
      return "STANDBY";
    }
    return "OFFLINE";
  }

  return "ONLINE";
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
