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
  whatIsGoingOn: string;
  whatSaIsDoing: string;
  technicianFindings?: string | null;
  preRepairMetric?: string | null;
  postRepairMetric?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  beforePhotoUrl?: string | null;
  afterPhotoUrl?: string | null;
}

export interface MacroTechnicalInfo {
  title: string;
  description: string;
  whatIsGoingOn: string;
  whatSaIsDoing: string;
  category: ClientServiceRequest["macroCategory"];
}

export function getMacroTechnicalDescription(
  alertOrTitle: any,
  siteName: string
): MacroTechnicalInfo {
  const codeUpper = (
    typeof alertOrTitle === "string"
      ? alertOrTitle
      : alertOrTitle.code || alertOrTitle.alarm_code || ""
  ).toUpperCase();
  const titleUpper = (
    typeof alertOrTitle === "string"
      ? alertOrTitle
      : alertOrTitle.title || ""
  ).toUpperCase();

  // 1. Inverter Safety / Isolation / Shutdown
  if (
    codeUpper.includes("SOLIS_ERR_01") ||
    codeUpper.includes("1038") ||
    titleUpper.includes("SHUTDOWN") ||
    titleUpper.includes("ISOLATION") ||
    titleUpper.includes("INVERTER FAULT") ||
    titleUpper.includes("POWER-FAULT")
  ) {
    return {
      title: "Inverter Safety Inspection Underway",
      description: `Inverter operating parameter variation reached safety boundary at ${siteName}. SolarAssist automated O&M system has safely paused the unit and scheduled technical inspection.`,
      whatIsGoingOn: `Inverter internal safety sensors detected an abnormal electrical boundary (such as insulation resistance, DC ground leakage, or phase balance) and safely paused the unit.`,
      whatSaIsDoing: `SolarAssist automated O&M system safely paused power feeding, conducted remote diagnostics, and scheduled an on-site technician inspection to verify cables, terminals, and safe restart.`,
      category: "Inverter Service",
    };
  }

  // 2. String Anomaly / DC Underperformance (Phase 5)
  if (
    codeUpper.includes("STRING_PERFORMANCE") ||
    codeUpper.includes("STR") ||
    titleUpper.includes("STRING") ||
    titleUpper.includes("UNDERPERFORM") ||
    titleUpper.includes("VARIANCE")
  ) {
    return {
      title: "String Performance Optimization Scheduled",
      description: `String voltage or current variance detected across PV circuits at ${siteName}. SolarAssist has scheduled circuit inspection to maximize daily generation.`,
      whatIsGoingOn: `Telemetry sensors detected a minor current or voltage variance between parallel solar panel rows (strings), likely caused by localized roof shading, module dust accumulation, or connection resistance.`,
      whatSaIsDoing: `SolarAssist algorithmic performance engine is analyzing daily string IV curves to isolate the affected circuit and has scheduled routine module washing and electrical terminal inspection.`,
      category: "String Optimization",
    };
  }

  // 3. Connectivity / Gateway Offline
  if (
    codeUpper.includes("1D4C2") ||
    codeUpper.includes("COMM") ||
    titleUpper.includes("INTERNET") ||
    titleUpper.includes("WIFI") ||
    titleUpper.includes("GATEWAY") ||
    titleUpper.includes("DISCONNECTED") ||
    titleUpper.includes("COMMUNICATION") ||
    titleUpper.includes("LOSS OF INTERNET")
  ) {
    return {
      title: "Data Gateway Connectivity Supervised",
      description: `Site data gateway communication pause detected at ${siteName}. Inverters continue generating solar electricity normally; SolarAssist is checking local network link.`,
      whatIsGoingOn: `The local communication module (data logger / Wi-Fi dongle) temporarily paused sending telemetry data. Your solar panels and inverters are continuing to generate solar electricity normally.`,
      whatSaIsDoing: `SolarAssist automated systems are running diagnostic ping retries and supervising network re-establishment. All solar generation figures are buffered safely in equipment memory and will automatically sync once connectivity resumes.`,
      category: "Connectivity & Gateway",
    };
  }

  // 4. Grid feeder outage & fluctuations (1015 OV-G-F, 1011/1010 OV-G-V, F015 UN-G-V, 101A PHASE-FAULT, etc.)
  if (
    codeUpper.includes("1015") ||
    codeUpper.includes("1011") ||
    codeUpper.includes("1010") ||
    codeUpper.includes("F015") ||
    codeUpper.includes("101A") ||
    codeUpper.includes("GRID") ||
    titleUpper.includes("GRID") ||
    titleUpper.includes("DISCOM") ||
    titleUpper.includes("FREQUENCY") ||
    titleUpper.includes("OV-G-") ||
    titleUpper.includes("UN-G-") ||
    titleUpper.includes("PHASE-FAULT") ||
    titleUpper.includes("BLACKOUT")
  ) {
    const isOverFreq = codeUpper.includes("1015") || titleUpper.includes("FREQUENCY");
    const isVoltage = codeUpper.includes("1011") || codeUpper.includes("1010") || codeUpper.includes("F015") || titleUpper.includes("VOLTAGE");
    const specificType = isOverFreq
      ? "Frequency Variation"
      : isVoltage
      ? "Voltage Fluctuation"
      : "Outage / Instability";

    return {
      title: "External Utility Grid Outage Monitored",
      description: `External electricity board (DISCOM) grid power is currently unavailable at ${siteName}. System will automatically resume export as soon as grid stabilizes.`,
      whatIsGoingOn: `The external power grid supplied by the local electricity board (DISCOM) experienced a temporary ${specificType.toLowerCase()} outside standard utility operating boundaries.`,
      whatSaIsDoing: `SolarAssist automated safety controls safely paused inverter export to protect your on-site electrical assets from utility surges. Automated sensors are continuously monitoring the grid line and will reconnect solar power generation the moment utility parameters stabilize.`,
      category: "Grid Outage",
    };
  }

  // 5. Inefficient Power Plants / Low Generation Benchmark
  if (
    codeUpper.includes("1D4C3") ||
    titleUpper.includes("INEFFICIENT") ||
    titleUpper.includes("LOW GENERATION") ||
    titleUpper.includes("UNDER-GENERATION")
  ) {
    return {
      title: "Solar Yield Optimization Underway",
      description: `Site generation at ${siteName} tracked slightly below ideal sunlight benchmark today. SolarAssist is supervising module washing and operational settings to maximize yield.`,
      whatIsGoingOn: `Daily solar production for this installation was lower than expected given regional sunlight levels, typically caused by seasonal soiling, cloudy spells, or temporary inverter clipping.`,
      whatSaIsDoing: `SolarAssist is cross-referencing satellite irradiance readings, verifying panel washing intervals, and scheduling module cleaning to bring generation back up to peak benchmark.`,
      category: "String Optimization",
    };
  }

  // 6. Thermal / Temperature
  if (
    codeUpper.includes("TEMPERATURE") ||
    titleUpper.includes("TEMPERATURE") ||
    titleUpper.includes("THERMAL") ||
    titleUpper.includes("OVERHEAT")
  ) {
    return {
      title: "Equipment Thermal Management Active",
      description: `Inverter enclosure cooling check scheduled at ${siteName} to prevent solar clipping and maintain peak summer yield.`,
      whatIsGoingOn: `Inverter internal operating temperature approached the upper design limit during peak sunshine hours.`,
      whatSaIsDoing: `SolarAssist monitored fan cooling airflow cycles to prevent thermal throttling, protect electronic components, and maintain maximum solar generation.`,
      category: "Inverter Service",
    };
  }

  // Default reassuring
  return {
    title: "System Performance Optimization Active",
    description: `SolarAssist identified an operational item at ${siteName}. Our 24/7 O&M team is supervising resolution.`,
    whatIsGoingOn: `A minor operational variance was identified during continuous system monitoring at ${siteName}.`,
    whatSaIsDoing: `SolarAssist 24/7 engineering team and automated telemetry supervisory system are tracking the item and supervising resolution.`,
    category: "Inverter Service",
  };
}

export function sanitizeServiceEvents(
  alerts: any[] = [],
  workOrders: any[] = [],
  cleaningLogs: any[] = [],
  tickets: any[] = [],
  cleaningVisits: any[] = [],
  sites: any[] = []
): ClientServiceEvent[] {
  const events: ClientServiceEvent[] = [];

  // Index tickets by alert_id or id for verification data lookup
  const ticketMap = new Map<string, any>();
  for (const t of tickets) {
    if (t.id) ticketMap.set(t.id, t);
    if (t.alert_id) ticketMap.set(t.alert_id, t);
  }

  const nowTime = Date.now();
  const todayDateOnly = new Date();
  todayDateOnly.setHours(0, 0, 0, 0);

  // Helper to test if a scheduled date is within 2 days in advance (diff <= 2 calendar days, or up to 54 hours ahead)
  function checkIsWithin2Days(scheduledDateStr: string | null | undefined): boolean {
    if (!scheduledDateStr) return false;
    const schTime = new Date(scheduledDateStr).getTime();
    const hoursUntilScheduled = (schTime - nowTime) / (1000 * 60 * 60);

    const todayStr = new Date().toISOString().slice(0, 10);
    const targetStr = scheduledDateStr.slice(0, 10);
    const diffDays = Math.round((new Date(targetStr + "T00:00:00").getTime() - new Date(todayStr + "T00:00:00").getTime()) / 86400000);

    // 2 days in advance: scheduled today (0), tomorrow (1), or in 2 days (2).
    // In hours: allows up to 54 hours ahead, down to -24 hours (day of visit)
    return (diffDays >= 0 && diffDays <= 2) || (hoursUntilScheduled <= 54 && hoursUntilScheduled >= -24);
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

  // Track scheduled cleaning sites to prevent duplicate prompts
  const scheduledCleaningCovered = new Set<string>();

  // 2. Sanitized Work Orders / Dispatches
  for (const wo of workOrders) {
    const siteName = wo.sites?.name || "your site";
    const linkedTicket = ticketMap.get(wo.ticket_id) || wo.tickets;
    const verStatus = wo.verification_status || linkedTicket?.verification_status;
    const isCleaning = wo.type === "cleaning";

    if (wo.status === "completed") {
      const photos: string[] = [];
      const beforePhoto = wo.before_photo_url || linkedTicket?.before_photo_url;
      const afterPhoto = wo.after_photo_url || linkedTicket?.after_photo_url;
      if (beforePhoto) photos.push(beforePhoto);
      if (afterPhoto) photos.push(afterPhoto);

      let title = "Technician Visit Completed";
      let desc = isCleaning
        ? `SolarAssist technician visited ${siteName} and completed panel cleaning.`
        : `SolarAssist technician visited ${siteName} and completed maintenance service.`;

      if (verStatus === "under_verification") {
        title = "Technician Service Completed • Telemetry Verifying";
        desc = `Physical work finished at ${siteName}. Telemetry verification active to confirm solar generation recovery.`;
      } else if (verStatus === "verified_recovered") {
        title = "Service Completed & Telemetry Verified";
        desc = `Technician visit at ${siteName} completed and full generation recovery confirmed by post-repair telemetry.`;
      }

      // Check if client needs to acknowledge completed cleaning
      const isPendingAck = isCleaning && !wo.client_acknowledged_at;

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
        actionable: isPendingAck ? "cleaning_ack" : undefined,
        actionableId: isPendingAck ? wo.id : undefined,
        actionableStatus: isPendingAck ? "pending" : undefined,
        actionableContext: isCleaning ? { site_name: siteName, entityType: "work_order" } : undefined,
      });
    } else if (wo.status !== "cancelled") {
      const todayDateStr = new Date().toISOString().slice(0, 10);
      const isUpcoming = Boolean(wo.scheduled_date && wo.scheduled_date >= todayDateStr);
      const isWithin2Days = isCleaning && checkIsWithin2Days(wo.scheduled_date);
      const isEligibleForPrompt = isCleaning && isUpcoming;

      if (isCleaning && wo.site_id) {
        scheduledCleaningCovered.add(`${wo.site_id}-${wo.scheduled_date}`);
      }

      events.push({
        id: `wo-active-${wo.id}`,
        type: "technician_visit",
        title: isCleaning ? "Solar Panel Cleaning Scheduled" : "Technician Visit Dispatched",
        description: isCleaning
          ? (isWithin2Days 
              ? `SolarAssist has scheduled routine solar panel cleaning for ${siteName} on ${wo.scheduled_date} (2 days advance notice).`
              : `SolarAssist has scheduled routine solar panel cleaning for ${siteName} on ${wo.scheduled_date}.`)
          : `SolarAssist certified field engineer dispatched to ${siteName} for equipment inspection.`,
        timestamp: wo.scheduled_date || wo.created_at,
        actionable: isEligibleForPrompt ? "cleaning_schedule_ack" : undefined,
        actionableId: isEligibleForPrompt ? wo.id : undefined,
        actionableStatus: isEligibleForPrompt ? (wo.client_acknowledged_at ? "completed" : "pending") : undefined,
        actionableContext: isCleaning ? { scheduled_date: wo.scheduled_date, site_name: siteName, entityType: "work_order", isWithin2Days } : undefined,
      });
    }
  }

  // 3. Canonical Cleaning Visits (Scheduled in advance or Completed)
  for (const v of cleaningVisits) {
    const siteName = v.sites?.name || "your site";
    const key = `${v.site_id}-${v.scheduled_date}`;
    if (scheduledCleaningCovered.has(key)) continue;

    if (v.status === "completed") {
      const isPendingAck = !v.acknowledged_at;
      events.push({
        id: `visit-cmp-${v.id}`,
        type: "technician_visit",
        title: "Solar Panel Cleaning Completed",
        description: `SolarAssist certified cleaning crew completed module washing at ${siteName} on ${v.scheduled_date || "schedule"}.`,
        timestamp: v.completed_at || v.scheduled_date || new Date().toISOString(),
        actionable: isPendingAck ? "cleaning_ack" : undefined,
        actionableId: isPendingAck ? v.id : undefined,
        actionableStatus: isPendingAck ? "pending" : undefined,
        actionableContext: { site_name: siteName, entityType: "cleaning_visit" },
      });
    } else if (v.status !== "cancelled" && v.scheduled_date) {
      const todayDateStr = new Date().toISOString().slice(0, 10);
      const isUpcoming = v.scheduled_date >= todayDateStr;
      const isWithin2Days = checkIsWithin2Days(v.scheduled_date);
      const isEligibleForPrompt = isUpcoming;
      scheduledCleaningCovered.add(key);

      events.push({
        id: `visit-active-${v.id}`,
        type: "technician_visit",
        title: "Solar Panel Cleaning Scheduled",
        description: isWithin2Days
          ? `SolarAssist has scheduled routine solar panel cleaning for ${siteName} on ${v.scheduled_date} (2 days advance notice).`
          : `SolarAssist has scheduled routine solar panel cleaning for ${siteName} on ${v.scheduled_date}.`,
        timestamp: v.scheduled_date,
        actionable: isEligibleForPrompt ? "cleaning_schedule_ack" : undefined,
        actionableId: isEligibleForPrompt ? v.id : undefined,
        actionableStatus: isEligibleForPrompt ? (v.acknowledged_at ? "completed" : "pending") : undefined,
        actionableContext: { scheduled_date: v.scheduled_date, site_name: siteName, entityType: "cleaning_visit", isWithin2Days },
      });
    }
  }

  // 4. Cleaning Logs (Historical & Completed Cleanings)
  for (const cl of cleaningLogs) {
    const siteName = cl.sites?.name || "your site";
    const photos = [cl.safety_photo_url, cl.before_photo_url, cl.after_photo_url, cl.damage_photo_url].filter(Boolean) as string[];
    let desc = `Comprehensive solar panel cleaning completed at ${siteName} to maximize output.`;
    if (cl.damage_observed) {
      desc += ` Roof & panel condition note: ${cl.damage_type || 'minor surface observation recorded'}.`;
    }
    const isCompletedAck = Boolean(cl.client_acknowledged_at || cl.client_acknowledged);

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
      actionableStatus: isCompletedAck ? "completed" : "pending",
      actionableContext: {
        damage_observed: cl.damage_observed,
        damage_type: cl.damage_type,
        remarks: cl.remarks,
        site_name: siteName,
        entityType: "cleaning_log",
      },
    });
  }

  // 5. Scheduled Cleanings directly on sites table (e.g. manual / approved schedule dates)
  for (const s of sites) {
    if (!s.next_cleaning_date) continue;
    const siteName = s.name || "your site";
    const key = `${s.id}-${s.next_cleaning_date}`;
    if (scheduledCleaningCovered.has(key)) continue;

    const todayDateStr = new Date().toISOString().slice(0, 10);
    const isUpcoming = s.next_cleaning_date >= todayDateStr;
    const isWithin2Days = checkIsWithin2Days(s.next_cleaning_date);
    const isEligibleForPrompt = isUpcoming;
    scheduledCleaningCovered.add(key);

    const isAcknowledged = Boolean(
      s.cleaning_schedule_acknowledged_at ||
      (s.cleaning_schedule_notes && s.cleaning_schedule_notes.includes("[ACKNOWLEDGED]"))
    );

    events.push({
      id: `site-clean-${s.id}`,
      type: "technician_visit",
      title: "Solar Panel Cleaning Scheduled",
      description: isWithin2Days
        ? `SolarAssist has scheduled routine solar panel cleaning for ${siteName} on ${s.next_cleaning_date} (2 days advance notice).`
        : `SolarAssist has scheduled routine solar panel cleaning for ${siteName} on ${s.next_cleaning_date}.`,
      timestamp: s.next_cleaning_date,
      actionable: isEligibleForPrompt ? "cleaning_schedule_ack" : undefined,
      actionableId: s.id,
      actionableStatus: isEligibleForPrompt ? (isAcknowledged ? "completed" : "pending") : undefined,
      actionableContext: {
        scheduled_date: s.next_cleaning_date,
        site_name: siteName,
        entityType: "site",
        isWithin2Days,
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
 * Transforms tickets, alerts, and work orders into structured, transparent client service requests and operational error logs.
 */
export function formatClientServiceRequests(
  tickets: any[] = [],
  workOrders: any[] = [],
  sitesMap: Map<string, any> = new Map(),
  alerts: any[] = []
): ClientServiceRequest[] {
  const requests: ClientServiceRequest[] = [];

  // Map work orders by ticket_id
  const woByTicket = new Map<string, any>();
  for (const wo of workOrders) {
    if (wo.ticket_id) woByTicket.set(wo.ticket_id, wo);
  }

  // Set of alert IDs processed through tickets
  const processedAlertIds = new Set<string>();

  for (const ticket of tickets) {
    const site = sitesMap.get(ticket.site_id) || ticket.sites;
    const siteName = site?.name || "Solar Installation";
    const linkedWo = woByTicket.get(ticket.id);

    if (ticket.alert_id) {
      processedAlertIds.add(ticket.alert_id);
    }

    const macro = getMacroTechnicalDescription(ticket.title, siteName);

    // Lifecycle status mapping
    let status: ClientServiceRequest["status"] = "reported";
    let statusLabel = "Detected & Monitored";
    let statusBadgeVariant: ClientServiceRequest["statusBadgeVariant"] = "secondary";
    let explanation = macro.description;

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
      whatIsGoingOn: macro.whatIsGoingOn,
      whatSaIsDoing: macro.whatSaIsDoing,
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

  // 2. Add alerts that do not have dedicated tickets to the Client Operational Log
  for (const alert of alerts) {
    if (processedAlertIds.has(alert.id) || (alert.ticket_id && processedAlertIds.has(alert.ticket_id))) {
      continue;
    }

    const site = sitesMap.get(alert.site_id) || alert.sites;
    const siteName = site?.name || alert.site_name || "Solar Installation";
    const macro = getMacroTechnicalDescription(alert, siteName);

    const isResolved = alert.status === "resolved";
    const status: ClientServiceRequest["status"] = isResolved ? "resolved" : "reported";
    const statusLabel = isResolved ? "Auto-Resolved & Safe" : "Detected & Supervised";
    const statusBadgeVariant: ClientServiceRequest["statusBadgeVariant"] = isResolved ? "success" : "warning";

    requests.push({
      id: alert.id,
      ticketNumber: `INC-${(alert.code || alert.id.slice(0, 8)).toUpperCase()}`,
      siteName,
      title: macro.title,
      macroCategory: macro.category,
      status,
      statusLabel,
      statusBadgeVariant,
      explanation: macro.description,
      whatIsGoingOn: macro.whatIsGoingOn,
      whatSaIsDoing: macro.whatSaIsDoing,
      technicianFindings: null,
      preRepairMetric: null,
      postRepairMetric: isResolved ? "Normal Generation Restored" : null,
      createdAt: alert.triggered_at || alert.created_at || new Date().toISOString(),
      updatedAt: alert.resolved_at || alert.triggered_at || alert.created_at || new Date().toISOString(),
      resolvedAt: alert.resolved_at || null,
      beforePhotoUrl: null,
      afterPhotoUrl: null,
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
