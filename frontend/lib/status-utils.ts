/**
 * Canonical helper functions for calculating site and inverter communication status
 * based on telemetry freshness and alarm states.
 */

export type InverterStatusDisplay = "ONLINE" | "OFFLINE" | "NO GRID" | "STANDBY" | "FAULT";
export type SiteStatusDisplay = "ONLINE" | "OFFLINE" | "PARTIALLY ONLINE";

export function getInverterStatus(
  inverter: {
    status?: string;
    last_seen_at?: string | null;
  },
  latestTelemetryTimestamp?: string
): InverterStatusDisplay {
  let lastSeenStr = inverter.last_seen_at || undefined;
  if (!lastSeenStr || (latestTelemetryTimestamp && new Date(latestTelemetryTimestamp) > new Date(lastSeenStr))) {
    lastSeenStr = latestTelemetryTimestamp;
  }

  if (!lastSeenStr) {
    return "OFFLINE";
  }

  const lastSeen = new Date(lastSeenStr);
  const now = new Date();
  const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);

  // Stale beyond 30 minutes threshold -> OFFLINE
  if (diffMinutes > 30) {
    return "OFFLINE";
  }

  const dbStatus = inverter.status?.toLowerCase();
  if (dbStatus === "fault") {
    return "NO GRID";
  }
  if (dbStatus === "standby") {
    return "STANDBY";
  }
  return "ONLINE";
}

export function getSiteStatus(
  inverters: Array<{ status?: string; last_seen_at?: string | null }>,
  latestTelemetryMap?: Map<string, string> // inverter_id -> timestamp
): SiteStatusDisplay {
  if (inverters.length === 0) {
    return "OFFLINE";
  }

  let onlineCount = 0;
  let offlineCount = 0;

  for (const inv of inverters) {
    const latestTimestamp = latestTelemetryMap?.get((inv as any).id);
    const invStatus = getInverterStatus(inv, latestTimestamp);

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
