/**
 * Client Portal Sanitizer Utility.
 * Ensures all client-facing copy is presentation-focused, OEM-agnostic, and reassuring.
 * Completely strips out raw OEM error codes, string/MPPT metadata, internal SLAs, and technician phone numbers.
 * Reflects Phase 6 Telemetry Verification lifecycle transparently.
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
      message: `Solar Inverter (${serialNumber}) experienced a minor operational pause. SolarAssist is monitoring performance closely.`,
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
  type: "detected" | "auto_resolved" | "technician_visit" | "verifying" | "reopened";
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
  verificationStatus?: string | null;
  technicianFindings?: string | null;
}

export interface ClientServiceRequest {
  id: string;
  ticketNumber: string;
  siteName: string;
  title: string;
  macroCategory: "Inverter Service" | "String Optimization" | "Connectivity & Gateway" | "Panel Maintenance" | "Grid Outage";
  status: "reported" | "dispatched" | "on_site" | "verifying" | "resolved" | "follow_up";
  statusLabel: string;
  statusBadgeVariant: "default" | "success" | "warning" | "secondary" | "destructive";
  explanation: string;
  technicianFindings?: string | null;
  preRepairMetric?: string | null;
  postRepairMetric?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  beforePhotoUrl?: string | null;
  afterPhotoUrl?: string | null;
}

export function getMacroTechnicalDescription(alertOrTitle: any, siteName: string): { title: string; description: string; category: ClientServiceRequest["macroCategory"] } {
  const codeUpper = (typeof alertOrTitle === "string" ? alertOrTitle : (alertOrTitle.code || alertOrTitle.alarm_code || "")).toUpperCase();
  const titleUpper = (typeof alertOrTitle === "string" ? alertOrTitle : (alertOrTitle.title || "")).toUpperCase();

  // 1. Inverter Safety / Isolation / Shutdown
  if (codeUpper.includes("SOLIS_ERR_01") || titleUpper.includes("SHUTDOWN") || titleUpper.includes("ISOLATION") || titleUpper.includes("INVERTER FAULT")) {
    return {
      title: "Inverter Safety Inspection Underway",
      description: `Inverter operating parameter variation reached safety boundary at ${siteName}. SolarAssist automated O&M system has safely paused the unit and scheduled technical inspection.`,
      category: "Inverter Service",
    };
  }

  // 2. String Anomaly / DC Underperformance (Phase 5)
  if (codeUpper.includes("STR") || titleUpper.includes("STRING") || titleUpper.includes("UNDERPERFORM") || titleUpper.includes("VARIANCE")) {
    return {
      title: "String Performance Optimization Scheduled",
      description: `String voltage or current variance detected across PV circuits at ${siteName}. SolarAssist has scheduled circuit inspection to maximize daily generation.`,
      category: "String Optimization",
    };
  }

  // 3. Connectivity / Gateway Offline
  if (titleUpper.includes("INTERNET") || titleUpper.includes("WIFI") || titleUpper.includes("GATEWAY") || titleUpper.includes("DISCONNECTED") || codeUpper.includes("COMMUNICATION")) {
    return {
      title: "Data Gateway Connectivity Supervised",
      description: `Site data gateway communication pause detected at ${siteName}. Inverters continue generating solar electricity normally; SolarAssist is checking local network link.`,
      category: "Connectivity & Gateway",
    };
  }

  // 4. Grid feeder outage
  if (codeUpper.includes("GRID") || titleUpper.includes("GRID") || titleUpper.includes("DISCOM") || titleUpper.includes("BLACKOUT")) {
    return {
      title: "External Utility Grid Outage Monitored",
      description: `External electricity board (DISCOM) grid power is currently unavailable at ${siteName}. System will automatically resume export as soon as grid stabilizes.`,
      category: "Grid Outage",
    };
  }

  // 5. Thermal / Temperature
  if (codeUpper.includes("TEMPERATURE") || titleUpper.includes("TEMPERATURE") || titleUpper.includes("THERMAL")) {
    return {
      title: "Equipment Thermal Management Active",
      description: `Inverter enclosure cooling check scheduled at ${siteName} to prevent solar clipping and maintain peak summer yield.`,
      category: "Inverter Service",
    };
  }

  // Default reassuring
  return {
    title: "System Performance Optimization Active",
    description: `SolarAssist identified an operational item at ${siteName}. Our 24/7 O&M team is supervising resolution.`,
    category: "Inverter Service",
  };
}

export function sanitizeServiceEvents(
  alerts: any[] = [],
  workOrders: any[] = [],
  cleaningLogs: any[] = [],
  tickets: any[] = []
): ClientServiceEvent[] {
  const events: ClientServiceEvent[] = [];

  // Index tickets by alert_id or id for verification data lookup
  const ticketMap = new Map<string, any>();
  for (const t of tickets) {
    if (t.id) ticketMap.set(t.id, t);
    if (t.alert_id) ticketMap.set(t.alert_id, t);
  }

  // 1. Sanitized Alerts & Incidents
  for (const a of alerts) {
    const siteName = a.site_name || a.sites?.name || "your solar installation";
    const linkedTicket = ticketMap.get(a.id) || ticketMap.get(a.ticket_id);
    const verStatus = linkedTicket?.verification_status || a.verification_status;
    const isReopened = (linkedTicket?.reopened_count || 0) > 0;

    if (a.status === "open") {
      const macro = getMacroTechnicalDescription(a, siteName);

      if (verStatus === "under_verification") {
        events.push({
          id: `alert-ver-${a.id}`,
          type: "verifying",
          title: "Technician Completed Work • Telemetry Verifying",
          description: `Field technician completed on-site service at ${siteName}. SolarAssist automated telemetry engine is verifying power generation recovery.`,
          timestamp: linkedTicket?.resolved_at || a.triggered_at,
          verificationStatus: "under_verification",
          technicianFindings: linkedTicket?.verification_notes || linkedTicket?.post_repair_metric,
        });
      } else if (verStatus === "verification_failed" || isReopened) {
        events.push({
          id: `alert-reopen-${a.id}`,
          type: "reopened",
          title: "Follow-Up Service Scheduled",
          description: `Telemetry verification detected persistent variance at ${siteName}. SolarAssist has automatically escalated this item for follow-up technician inspection.`,
          timestamp: linkedTicket?.reopened_at || a.triggered_at,
          verificationStatus: "verification_failed",
          technicianFindings: linkedTicket?.pre_repair_metric,
        });
      } else {
        events.push({
          id: `alert-open-${a.id}`,
          type: "detected",
          title: macro.title,
          description: macro.description,
          timestamp: a.triggered_at,
        });
      }
    } else if (a.status === "resolved") {
      const isVerified = verStatus === "verified_recovered";
      events.push({
        id: `alert-res-${a.id}`,
        type: "auto_resolved",
        title: isVerified ? "Issue Resolved & Telemetry Verified" : "Performance Check Resolved",
        description: isVerified
          ? `Operational item at ${siteName} confirmed resolved. Live telemetry verified normal power output and efficiency.`
          : `Operational item at ${siteName} has been resolved and system is operating normally.`,
        timestamp: a.resolved_at || a.triggered_at,
        verificationStatus: verStatus || "verified_recovered",
        technicianFindings: linkedTicket?.post_repair_metric,
      });
    }
  }

  // 2. Sanitized Work Orders / Dispatches
  for (const wo of workOrders) {
    const siteName = wo.sites?.name || "your site";
    const linkedTicket = ticketMap.get(wo.ticket_id) || wo.tickets;
    const verStatus = wo.verification_status || linkedTicket?.verification_status;

    if (wo.status === "completed") {
      const photos: string[] = [];
      const beforePhoto = wo.before_photo_url || linkedTicket?.before_photo_url;
      const afterPhoto = wo.after_photo_url || linkedTicket?.after_photo_url;
      if (beforePhoto) photos.push(beforePhoto);
      if (afterPhoto) photos.push(afterPhoto);

      let title = "Technician Visit Completed";
      let desc = wo.type === "cleaning"
        ? `SolarAssist technician visited ${siteName} and completed panel cleaning.`
        : `SolarAssist technician visited ${siteName} and completed maintenance service.`;

      if (verStatus === "under_verification") {
        title = "Technician Service Completed • Telemetry Verifying";
        desc = `Physical work finished at ${siteName}. Telemetry verification active to confirm solar generation recovery.`;
      } else if (verStatus === "verified_recovered") {
        title = "Service Completed & Telemetry Verified";
        desc = `Technician visit at ${siteName} completed and full generation recovery confirmed by post-repair telemetry.`;
      }

      events.push({
        id: `wo-${wo.id}`,
        type: "technician_visit",
        title,
        description: desc,
        timestamp: wo.completed_at || wo.created_at,
        before_photo_url: beforePhoto || null,
        after_photo_url: afterPhoto || null,
        photos: photos.length > 0 ? photos : undefined,
        verificationStatus: verStatus,
        technicianFindings: linkedTicket?.post_repair_metric || wo.post_repair_metric,
      });
    } else if (wo.status !== "cancelled") {
      const isCleaning = wo.type === "cleaning";
      const nowTime = Date.now();
      const scheduledTime = wo.scheduled_date ? new Date(wo.scheduled_date).getTime() : nowTime;
      const hoursUntilScheduled = (scheduledTime - nowTime) / (1000 * 60 * 60);
      const isEligibleForPrompt = isCleaning && hoursUntilScheduled <= 24 && hoursUntilScheduled >= -24;

      events.push({
        id: `wo-active-${wo.id}`,
        type: "technician_visit",
        title: isCleaning ? "Solar Panel Cleaning Scheduled" : "Technician Visit Dispatched",
        description: isCleaning
          ? `SolarAssist has scheduled routine solar panel cleaning for ${siteName}.`
          : `SolarAssist certified field engineer dispatched to ${siteName} for equipment inspection.`,
        timestamp: wo.scheduled_date || wo.created_at,
        actionable: isEligibleForPrompt ? "cleaning_schedule_ack" : undefined,
        actionableId: isEligibleForPrompt ? wo.id : undefined,
        actionableStatus: isEligibleForPrompt ? (wo.client_acknowledged_at ? "completed" : "pending") : undefined,
        actionableContext: isCleaning ? { scheduled_date: wo.scheduled_date } : undefined,
      });
    }
  }

  // 3. Cleaning Logs
  for (const cl of cleaningLogs) {
    const siteName = cl.sites?.name || "your site";
    const photos = [cl.safety_photo_url, cl.before_photo_url, cl.after_photo_url, cl.damage_photo_url].filter(Boolean) as string[];
    let desc = `Comprehensive solar panel cleaning completed at ${siteName} to maximize output.`;
    if (cl.damage_observed) {
      desc += ` Roof & panel condition note: ${cl.damage_type || 'minor surface observation recorded'}.`;
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
        remarks: cl.remarks,
      },
    });
  }

  // Sort upcoming events chronologically ascending (nearest upcoming first), past events descending
  return events.sort((a, b) => {
    const now = Date.now();
    const tA = new Date(a.timestamp).getTime();
    const tB = new Date(b.timestamp).getTime();
    const isFutureA = tA > now;
    const isFutureB = tB > now;

    if (isFutureA && isFutureB) return tA - tB;
    if (isFutureA) return -1;
    if (isFutureB) return 1;
    return tB - tA;
  });
}

/**
 * Transforms tickets and work orders into structured, transparent client service requests.
 */
export function formatClientServiceRequests(
  tickets: any[] = [],
  workOrders: any[] = [],
  sitesMap: Map<string, any> = new Map()
): ClientServiceRequest[] {
  const requests: ClientServiceRequest[] = [];

  // Map work orders by ticket_id
  const woByTicket = new Map<string, any>();
  for (const wo of workOrders) {
    if (wo.ticket_id) woByTicket.set(wo.ticket_id, wo);
  }

  for (const ticket of tickets) {
    const site = sitesMap.get(ticket.site_id) || ticket.sites;
    const siteName = site?.name || "Solar Installation";
    const linkedWo = woByTicket.get(ticket.id);

    const macro = getMacroTechnicalDescription(ticket.title, siteName);

    // Lifecycle status mapping
    let status: ClientServiceRequest["status"] = "reported";
    let statusLabel = "Detected & Monitored";
    let statusBadgeVariant: ClientServiceRequest["statusBadgeVariant"] = "secondary";
    let explanation = "SolarAssist continuous monitoring detected an operational variance. O&M engineers are supervising.";

    const verStatus = ticket.verification_status || linkedWo?.verification_status;
    const reopened = (ticket.reopened_count || 0) > 0;

    if (ticket.status === "closed" || verStatus === "verified_recovered") {
      status = "resolved";
      statusLabel = "Verified Resolved";
      statusBadgeVariant = "success";
      explanation = ticket.post_repair_metric
        ? `Confirmed resolved. Telemetry verification confirmed: ${ticket.post_repair_metric}`
        : "Operational health confirmed normal. Issue marked resolved following verification.";
    } else if (verStatus === "under_verification") {
      status = "verifying";
      statusLabel = "Telemetry Verifying";
      statusBadgeVariant = "default";
      explanation = "Technician finished physical field intervention. Automated telemetry engine is verifying power recovery baseline.";
    } else if (verStatus === "verification_failed" || reopened) {
      status = "follow_up";
      statusLabel = "Follow-Up Scheduled";
      statusBadgeVariant = "warning";
      explanation = "Post-service telemetry indicated variance persisted. Automatically escalated for follow-up technician visit.";
    } else if (linkedWo?.status === "in_progress") {
      status = "on_site";
      statusLabel = "Technician On Site";
      statusBadgeVariant = "warning";
      explanation = "SolarAssist field technician has checked in on site and is actively conducting inspections.";
    } else if (linkedWo?.status === "scheduled" || linkedWo?.status === "en_route" || ticket.assignee_id) {
      status = "dispatched";
      statusLabel = "Technician Dispatched";
      statusBadgeVariant = "warning";
      explanation = linkedWo?.scheduled_date
        ? `Field technician visit scheduled for ${linkedWo.scheduled_date}.`
        : "Certified field technician assigned and scheduled for site visit.";
    }

    requests.push({
      id: ticket.id,
      ticketNumber: `SR-${ticket.id.slice(0, 8).toUpperCase()}`,
      siteName,
      title: macro.title,
      macroCategory: macro.category,
      status,
      statusLabel,
      statusBadgeVariant,
      explanation,
      technicianFindings: ticket.verification_notes || linkedWo?.remarks || null,
      preRepairMetric: ticket.pre_repair_metric || null,
      postRepairMetric: ticket.post_repair_metric || null,
      createdAt: ticket.created_at,
      updatedAt: linkedWo?.completed_at || ticket.resolved_at || ticket.created_at,
      resolvedAt: ticket.resolved_at,
      beforePhotoUrl: ticket.before_photo_url || linkedWo?.before_photo_url || linkedWo?.tickets?.before_photo_url || null,
      afterPhotoUrl: ticket.after_photo_url || linkedWo?.after_photo_url || linkedWo?.tickets?.after_photo_url || null,
    });
  }

  // Sort: active/open requests first, newest first
  return requests.sort((a, b) => {
    const isClosedA = a.status === "resolved";
    const isClosedB = b.status === "resolved";
    if (isClosedA !== isClosedB) return isClosedA ? 1 : -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/**
 * Formats financial savings strictly if grid_tariff_inr_per_kwh is configured (non-null).
 * Returns null if no tariff is set so the UI displays "Not configured".
 */
export function calculateFinancialSavings(
  totalKwh: number,
  tariffInrPerKwh: number | null | undefined
): { formatted: string; amount: number; rate: number } | null {
  if (tariffInrPerKwh === null || tariffInrPerKwh === undefined || isNaN(Number(tariffInrPerKwh))) {
    return null;
  }

  const rate = Number(tariffInrPerKwh);
  const amount = totalKwh * rate;

  return {
    amount,
    rate,
    formatted: `₹${Math.round(amount).toLocaleString("en-IN")}`,
  };
}
