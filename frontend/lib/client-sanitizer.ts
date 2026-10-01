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
  safety_photo_url?: string | null;
  before_photo_url?: string | null;
  after_photo_url?: string | null;
  damage_photo_url?: string | null;
  photos?: string[];
  actionable?: "cleaning_ack" | "cleaning_schedule_ack";
  actionableId?: string;
  actionableStatus?: "pending" | "completed";
  actionableContext?: any;
}

export function getMacroTechnicalDescription(alert: any, siteName: string): { title: string; description: string } {
  const codeUpper = (alert.code || alert.alarm_code || "").toUpperCase();
  const titleUpper = (alert.title || "").toUpperCase();

  if (codeUpper.includes("SOLIS_ERR_01") || titleUpper.includes("SHUTDOWN") || titleUpper.includes("ISOLATION")) {
    return {
      title: "Inverter Safety Inspection Underway",
      description: `Inverter isolation resistance boundary reached at ${siteName}. SolarAssist automated O&M system has safely paused the unit and dispatched an engineer for physical inspection.`,
    };
  }

  if (codeUpper.includes("SUNGROW_STR") || titleUpper.includes("STRING") || titleUpper.includes("UNDERPERFORM")) {
    return {
      title: "String Performance Optimization Scheduled",
      description: `String voltage variation detected at ${siteName}. SolarAssist team has scheduled routine maintenance to ensure full daily generation.`,
    };
  }

  if (codeUpper.includes("GRID") || titleUpper.includes("GRID")) {
    return {
      title: "External Grid Outage Monitored",
      description: `External DISCOM grid feeder power is currently unavailable at ${siteName}. SolarAssist is monitoring grid restoration.`,
    };
  }

  if (codeUpper.includes("RECURRING") || titleUpper.includes("RECURRING") || titleUpper.includes("OVER-TEMPERATURE")) {
    return {
      title: "Thermal Inspection & Escalation",
      description: `Inverter operating temperature has exceeded its normal range at ${siteName}. Escalated for technical inspection.`,
    };
  }

  return {
    title: "System Item Under Investigation",
    description: `SolarAssist identified an operational item at ${siteName}. Our O&M team is taking care of it.`,
  };
}

export function sanitizeServiceEvents(
  alerts: any[],
  workOrders: any[],
  cleaningLogs: any[]
): ClientServiceEvent[] {
  const events: ClientServiceEvent[] = [];

  // 1. Sanitized Alerts (Detected or Auto-Resolved with Macro-Technical Descriptions)
  for (const a of alerts) {
    const siteName = a.site_name || a.sites?.name || "your solar installation";
    if (a.status === "open") {
      const macro = getMacroTechnicalDescription(a, siteName);
      events.push({
        id: `alert-open-${a.id}`,
        type: "detected",
        title: macro.title,
        description: macro.description,
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
      if (wo.tickets?.before_photo_url) photos.push(wo.tickets.before_photo_url);
      if (wo.tickets?.after_photo_url) photos.push(wo.tickets.after_photo_url);

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
    } else if (wo.status !== "cancelled") {
      const isCleaning = wo.type === "cleaning";

      // 24-Hour Notification Eligibility Rule:
      // Client only receives active acknowledgement prompt when scheduled cleaning is within 24 hours
      const nowTime = Date.now();
      const scheduledTime = wo.scheduled_date ? new Date(wo.scheduled_date).getTime() : nowTime;
      const hoursUntilScheduled = (scheduledTime - nowTime) / (1000 * 60 * 60);
      const isEligibleForPrompt = isCleaning && hoursUntilScheduled <= 24 && hoursUntilScheduled >= -24;

      events.push({
        id: `wo-active-${wo.id}`,
        type: "technician_visit",
        title: isCleaning ? "Solar Panel Cleaning Scheduled" : "Technician Visit Dispatched",
        description: isCleaning
          ? `SolarAssist has scheduled a routine solar panel cleaning for ${siteName}.`
          : `SolarAssist automated O&M system has dispatched an engineer to ${siteName}. (Job #${wo.id.slice(0, 8)})`,
        timestamp: wo.scheduled_date || wo.created_at,
        actionable: isEligibleForPrompt ? "cleaning_schedule_ack" : undefined,
        actionableId: isEligibleForPrompt ? wo.id : undefined,
        actionableStatus: isEligibleForPrompt ? (wo.client_acknowledged_at ? "completed" : "pending") : undefined,
        actionableContext: isCleaning ? {
          scheduled_date: wo.scheduled_date
        } : undefined
      });
    }
  }

  // 3. Cleaning Logs
  for (const cl of cleaningLogs) {
    const siteName = cl.sites?.name || "your site";
    const photos = [cl.safety_photo_url, cl.before_photo_url, cl.after_photo_url, cl.damage_photo_url].filter(Boolean) as string[];
    let desc = `Comprehensive solar panel cleaning completed at ${siteName} to maximize output.`;
    if (cl.damage_observed) {
      desc += ` Damage Observation recorded: ${cl.damage_type || 'unspecified issue'}.`;
    }
    events.push({
      id: `cln-${cl.id}`,
      type: "technician_visit",
      title: "Solar Panel Cleaning Completed",
      description: desc,
      timestamp: cl.performed_at,
      safety_photo_url: cl.safety_photo_url || null,
      before_photo_url: cl.before_photo_url || null,
      after_photo_url: cl.after_photo_url || null,
      damage_photo_url: (cl.damage_observed || cl.damage_photo_url) ? (cl.damage_photo_url || null) : null,
      photos: photos.length > 0 ? photos : undefined,
      actionable: "cleaning_ack",
      actionableId: cl.id,
      actionableStatus: (cl.client_acknowledged_at || cl.client_acknowledged) ? "completed" : "pending",
      actionableContext: {
        damage_observed: cl.damage_observed,
        damage_type: cl.damage_type,
        remarks: cl.remarks
      }
    });
  }

  // Sort upcoming events chronologically ascending (nearest upcoming first), past events descending
  return events.sort((a, b) => {
    const now = Date.now();
    const tA = new Date(a.timestamp).getTime();
    const tB = new Date(b.timestamp).getTime();
    const isFutureA = tA > now;
    const isFutureB = tB > now;

    if (isFutureA && isFutureB) return tA - tB; // Nearest upcoming first
    if (isFutureA) return -1;
    if (isFutureB) return 1;
    return tB - tA; // Past events newest first
  });
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
