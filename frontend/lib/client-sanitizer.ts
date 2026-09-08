/**
 * Client Portal Sanitizer Utility.
 * Ensures all client-facing copy is presentation-focused, OEM-agnostic, and reassuring.
 * Completely strips out raw OEM error codes, string/MPPT metadata, internal SLAs, and technician notes.
 */

export interface ClientInverterStatus {
  badgeText: string;
  badgeVariant: "success" | "warning" | "destructive" | "secondary";
  message: string;
}

export function getSanitizedInverterStatus(
  status: string | undefined,
  serialNumber: string,
  isStale: boolean
): ClientInverterStatus {
  if (isStale || status === "offline") {
    return {
      badgeText: "Attention Needed",
      badgeVariant: "warning",
      message: `Solar Inverter (${serialNumber}) needs attention. SolarAssist is actively investigating this item.`,
    };
  }

  const st = status?.toLowerCase();
  if (st === "fault") {
    return {
      badgeText: "Service Check",
      badgeVariant: "warning",
      message: `Solar Inverter (${serialNumber}) experienced a minor pause. SolarAssist is monitoring performance closely.`,
    };
  }

  if (st === "standby") {
    return {
      badgeText: "Standby",
      badgeVariant: "secondary",
      message: `Solar Inverter (${serialNumber}) is in standby mode (low sunlight or grid sync pause).`,
    };
  }

  return {
    badgeText: "Operating Normally",
    badgeVariant: "success",
    message: `Solar Inverter (${serialNumber}) is running smoothly.`,
  };
}

export interface ClientServiceEvent {
  id: string;
  type: "detected" | "auto_resolved" | "technician_visit";
  title: string;
  description: string;
  timestamp: string;
  photos?: string[];
}

export function sanitizeServiceEvents(
  alerts: any[],
  workOrders: any[],
  cleaningLogs: any[]
): ClientServiceEvent[] {
  const events: ClientServiceEvent[] = [];

  // 1. Sanitized Alerts (Detected or Auto-Resolved)
  for (const a of alerts) {
    const siteName = a.site_name || a.sites?.name || "your solar installation";
    if (a.status === "open") {
      events.push({
        id: `alert-open-${a.id}`,
        type: "detected",
        title: "System Item Under Investigation",
        description: `SolarAssist identified an item at ${siteName}. Our O&M team is taking care of it.`,
        timestamp: a.triggered_at,
      });
    } else if (a.status === "resolved") {
      events.push({
        id: `alert-res-${a.id}`,
        type: "auto_resolved",
        title: "Issue Resolved",
        description: `Performance item at ${siteName} has been resolved and system is operating normally.`,
        timestamp: a.resolved_at || a.triggered_at,
      });
    }
  }

  // 2. Sanitized Work Orders / Dispatches (Technician Visits)
  for (const wo of workOrders) {
    const siteName = wo.sites?.name || "your site";
    if (wo.status === "completed") {
      const photos: string[] = [];
      events.push({
        id: `wo-${wo.id}`,
        type: "technician_visit",
        title: "Technician Visit Completed",
        description: wo.type === "cleaning" 
          ? `SolarAssist technician visited ${siteName} and completed panel cleaning.` 
          : `SolarAssist technician visited ${siteName} and completed routine service.`,
        timestamp: wo.completed_at || wo.created_at,
        photos: photos.length > 0 ? photos : undefined,
      });
    }
  }

  // 3. Cleaning Logs
  for (const cl of cleaningLogs) {
    const siteName = cl.sites?.name || "your site";
    const photos = [cl.before_photo_url, cl.after_photo_url].filter(Boolean) as string[];
    events.push({
      id: `cln-${cl.id}`,
      type: "technician_visit",
      title: "Solar Panel Cleaning Completed",
      description: `Comprehensive solar panel cleaning completed at ${siteName} to maximize output.`,
      timestamp: cl.performed_at,
      photos: photos.length > 0 ? photos : undefined,
    });
  }

  // Sort newest first
  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/**
 * Formats financial savings strictly if grid_tariff_inr_per_kwh is configured (non-null).
 * Returns null if no tariff is set so the UI displays "Not configured".
 */
export function calculateFinancialSavings(
  totalKwh: number,
  tariffInrPerKwh: number | null | undefined
): { formatted: string; amount: number } | null {
  if (tariffInrPerKwh === null || tariffInrPerKwh === undefined || isNaN(Number(tariffInrPerKwh))) {
    return null;
  }

  const rate = Number(tariffInrPerKwh);
  const amount = totalKwh * rate;

  return {
    amount,
    formatted: `₹${Math.round(amount).toLocaleString("en-IN")}`,
  };
}
