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
  latestTelemetryTimestamp?: string,
  hasActiveGenerationToday?: boolean
): InverterStatusDisplay {
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

  // Stale beyond 60 minutes threshold (4 missed 15-min sync intervals) -> check diurnal context before marking OFFLINE
  if (diffMinutes > 60) {
    if (hasActiveGenerationToday && diffMinutes < 6 * 60) {
      return "ONLINE";
    }
    // Solar diurnal awareness: In India (Asia/Kolkata), solar arrays shut down after sunset (~18:00 IST)
    // and resume at sunrise (~06:00 IST). Inverters that communicated normally during today's daylight
    // hours are in healthy STANDBY / SLEEP mode during night hours, not communication failure.
    const istHours = (now.getUTCHours() + 5.5) % 24;
    const isNighttime = istHours >= 18.0 || istHours < 6.0;
    if (isNighttime && diffMinutes < 14 * 60) {
      return "STANDBY";
    }
    return "OFFLINE";
  }

  const dbStatus = inverter.status?.toLowerCase();
  if (dbStatus === "fault") {
    return "FAULT";
  }
  if (dbStatus === "standby") {
    return "STANDBY";
  }
  if (dbStatus === "no grid" || dbStatus === "no_grid") {
    return "NO GRID";
  }
  return "ONLINE";
}

export function getSiteStatus(
  inverters: Array<{ id?: string; status?: string; last_seen_at?: string | null }>,
  latestTelemetryMap?: Map<string, any>, // inverter_id -> timestamp string or telemetry object
  hasActiveGenerationToday?: boolean
): SiteStatusDisplay {
  if (!inverters || inverters.length === 0) {
    return "ONLINE";
  }

  let onlineCount = 0;
  let offlineCount = 0;

  for (const inv of inverters) {
    let latestTimestamp: string | undefined;
    if (latestTelemetryMap && inv.id) {
      const val = latestTelemetryMap.get(inv.id);
      if (typeof val === "string") {
        latestTimestamp = val;
      } else if (val && typeof val === "object") {
        latestTimestamp = val.timestamp || val.last_update;
      }
    }
    const invStatus = getInverterStatus(inv, latestTimestamp, hasActiveGenerationToday);

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
