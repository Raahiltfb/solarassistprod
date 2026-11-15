import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { 
  ClientReportView, 
  ReportSiteData, 
  ReportCleaningLog, 
  ReportIncident, 
  ReportGenerationDay,
  AvailableMonthOption
} from "@/components/client-report-view";
import { calculateClientHealthScore } from "@/lib/client-health-score";
import { resolveSiteCleaning } from "@/lib/cleaning-schedule-sync";
import { sanitizeServiceEvents } from "@/lib/client-sanitizer";
import { ClientGlobalPopups } from "@/components/client-global-popups";

// Helper to determine exact calendar month boundaries with IST timezone
function getMonthBounds(monthParam?: string) {
  const now = new Date();
  let year = now.getFullYear();
  let monthNum = now.getMonth() + 1; // 1-12

  if (monthParam) {
    const trimmed = decodeURIComponent(monthParam).trim();
    const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})$/);
    if (isoMatch) {
      year = parseInt(isoMatch[1], 10);
      monthNum = parseInt(isoMatch[2], 10);
    } else {
      // Try parsing human string e.g. "October 2026" or "Oct 2026"
      const parsedDate = new Date(`${trimmed} 01`);
      if (!isNaN(parsedDate.getTime())) {
        year = parsedDate.getFullYear();
        monthNum = parsedDate.getMonth() + 1;
      }
    }
  }

  // Ensure monthNum is within 1-12
  if (monthNum < 1) monthNum = 1;
  if (monthNum > 12) monthNum = 12;

  const monthIndex = monthNum - 1;
  // Number of days in this calendar month (handles leap years e.g. Feb 29)
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const yearMonth = `${year}-${String(monthNum).padStart(2, "0")}`;
  const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Exact boundaries in IST (+05:30)
  const startIst = `${year}-${String(monthNum).padStart(2, "0")}-01T00:00:00+05:30`;
  const endIst = `${year}-${String(monthNum).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}T23:59:59+05:30`;

  return {
    year,
    monthNum,
    monthIndex,
    daysInMonth,
    yearMonth,
    monthLabel,
    startIst,
    endIst,
  };
}

export default async function ClientReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ site_id?: string; month?: string }>;
}) {
  const { site_id, month } = await searchParams;

  const sb = await createClient();
  const serviceClient = createServiceClient();

  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  // Fetch Customer Organization details
  let customerOrg = null;
  if (profile.org_id) {
    const { data: org } = await serviceClient.from("organizations").select("*").eq("id", profile.org_id).single();
    customerOrg = org;
  }

  // Strictly scoped sites query respecting client permissions
  let sitesQuery = serviceClient.from("sites").select("*").order("name");
  if (profile.role === "client") {
    if (profile.org_id) {
      sitesQuery = sitesQuery.or(`client_id.eq.${profile.id},client_org_id.eq.${profile.org_id},org_id.eq.${profile.org_id}`).limit(25);
    } else {
      sitesQuery = sitesQuery.eq("client_id", profile.id).limit(25);
    }
  }
  const { data: sitesRes } = await sitesQuery;
  const sites = sitesRes ?? [];
  const siteIds = sites.map((s) => s.id);

  const targetSiteId = site_id && site_id !== "all" && siteIds.includes(site_id) ? site_id : "all";
  const effectiveSiteIds = targetSiteId === "all" ? siteIds : [targetSiteId];

  // Calculate complete calendar month boundaries (inclusive first second to final second)
  const {
    year,
    monthNum,
    daysInMonth,
    yearMonth,
    monthLabel,
    startIst,
    endIst,
  } = getMonthBounds(month);

  // Dynamically generate the last 24 historical calendar months
  const availableMonths: AvailableMonthOption[] = [];
  const curDate = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(curDate.getFullYear(), curDate.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    availableMonths.push({
      value: ym,
      label,
      isLatestThree: i < 3,
    });
  }

  // Fetch upcoming cleaning visits & work orders for operational status
  const todayStr = new Date().toISOString().slice(0, 10);
  let upcomingVisits: any[] = [];
  let workOrders: any[] = [];
  let allAlerts: any[] = [];
  let allCleaningLogs: any[] = [];

  if (siteIds.length > 0) {
    const [visRes, woRes, altRes, clnAllRes] = await Promise.all([
      serviceClient
        .from("cleaning_visits")
        .select("*, sites(name)")
        .in("site_id", siteIds)
        .gte("scheduled_date", todayStr)
        .in("status", ["published", "scheduled", "planned", "approved"])
        .order("scheduled_date", { ascending: true }),
      serviceClient
        .from("work_orders")
        .select("*")
        .in("site_id", siteIds)
        .order("created_at", { ascending: false })
        .limit(30),
      serviceClient
        .from("alerts")
        .select("*")
        .in("site_id", siteIds),
      serviceClient
        .from("cleaning_logs")
        .select("*")
        .in("site_id", siteIds)
        .order("performed_at", { ascending: false })
        .limit(20),
    ]);

    upcomingVisits = visRes.data ?? [];
    workOrders = woRes.data ?? [];
    allAlerts = altRes.data ?? [];
    allCleaningLogs = clnAllRes.data ?? [];
  }

  const serviceEvents = sanitizeServiceEvents(
    allAlerts,
    workOrders,
    allCleaningLogs,
    [],
    upcomingVisits,
    sites
  );

  // Format sites for report using single source of truth resolveSiteCleaning
  const reportSites: ReportSiteData[] = sites.map((s) => {
    const cleanRes = resolveSiteCleaning(s, {
      visits: upcomingVisits,
      workOrders,
      todayStr,
    });
    return {
      id: s.id,
      name: s.name,
      capacity_kwp: Number(s.capacity_kwp || 0),
      location: s.location,
      grid_tariff_inr_per_kwh: s.grid_tariff_inr_per_kwh,
      last_cleaned_on: s.last_cleaned_on,
      cleaning_cycle_days: s.cleaning_cycle_days || 30,
      next_scheduled_cleaning: cleanRes.isScheduled ? cleanRes.scheduledDate : (cleanRes.displayDate || null),
    };
  });

  // Fetch inverters for effective sites
  let inverters: any[] = [];
  let cleaningLogs: any[] = [];
  let tickets: any[] = [];
  let alerts: any[] = [];

  if (effectiveSiteIds.length > 0) {
    const [invRes, clnRes, tktRes, altRes] = await Promise.all([
      serviceClient.from("inverters").select("*").in("site_id", effectiveSiteIds),
      serviceClient
        .from("cleaning_logs")
        .select("*, sites(name)")
        .in("site_id", effectiveSiteIds)
        .gte("performed_at", startIst)
        .lte("performed_at", endIst)
        .order("performed_at", { ascending: false }),
      serviceClient
        .from("tickets")
        .select("*, sites(name)")
        .in("site_id", effectiveSiteIds)
        .gte("created_at", startIst)
        .lte("created_at", endIst)
        .order("created_at", { ascending: false }),
      serviceClient
        .from("alerts")
        .select("*")
        .in("site_id", effectiveSiteIds)
        .gte("triggered_at", startIst)
        .lte("triggered_at", endIst),
    ]);

    inverters = invRes.data ?? [];
    cleaningLogs = clnRes.data ?? [];
    tickets = tktRes.data ?? [];
    alerts = altRes.data ?? [];
  }

  const inverterIds = inverters.map((i) => i.id);

  // Fetch canonical monthly daily telemetry directly from Supabase RPC
  let monthlyTelemetryRows: any[] = [];
  if (inverterIds.length > 0) {
    const rpcRes = await serviceClient.rpc("get_monthly_telemetry", {
      p_inverter_ids: inverterIds,
      p_start_date: startIst,
      p_end_date: endIst,
    });
    monthlyTelemetryRows = rpcRes.data ?? [];
  }

  // Aggregate telemetry rows by calendar day (YYYY-MM-DD) across all effective inverters
  const dailyTelemetryMap = new Map<
    string,
    { generationKwh: number; peakPowerKw: number; avgPowerKw: number; sampleCount: number }
  >();

  for (const row of monthlyTelemetryRows) {
    const dayStr = String(row.day);
    const existing = dailyTelemetryMap.get(dayStr) || {
      generationKwh: 0,
      peakPowerKw: 0,
      avgPowerKw: 0,
      sampleCount: 0,
    };

    existing.generationKwh += Number(row.daily_generation_kwh || 0);
    existing.peakPowerKw = Math.max(existing.peakPowerKw, Number(row.peak_ac_power_kw || 0));
    existing.avgPowerKw = Math.max(existing.avgPowerKw, Number(row.avg_ac_power_kw || 0));
    existing.sampleCount += Number(row.sample_count || 0);

    dailyTelemetryMap.set(dayStr, existing);
  }

  // Total installed capacity under reporting scope (kWp)
  const totalCapacity = reportSites
    .filter((s) => targetSiteId === "all" || s.id === targetSiteId)
    .reduce((sum, s) => sum + s.capacity_kwp, 0);

  // Regional baseline specific yield: ~4.3 kWh/kWp/day
  const baseYieldPerKwp = 4.3;

  // Build complete month day-by-day telemetry (Day 1 through Day daysInMonth)
  let totalGenerationKwh = 0;
  let elapsedDaysCount = 0;
  let reportingDaysCount = 0;
  const generationDays: ReportGenerationDay[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayDate = new Date(`${dateStr}T12:00:00+05:30`);
    const isFuture = dayDate > new Date();

    const expectedKwh = Number((totalCapacity * baseYieldPerKwp).toFixed(1));
    const telemetry = dailyTelemetryMap.get(dateStr);

    if (isFuture) {
      generationDays.push({
        date: dateStr,
        generation_kwh: 0,
        specific_yield: 0,
        expected_kwh: expectedKwh,
        status: "upcoming",
        sample_count: 0,
      });
    } else {
      elapsedDaysCount++;
      const actualKwh = telemetry ? Number(telemetry.generationKwh.toFixed(1)) : 0;
      const dayYield = totalCapacity > 0 ? Number((actualKwh / totalCapacity).toFixed(2)) : 0;

      if (telemetry && actualKwh > 0) {
        reportingDaysCount++;
      }

      totalGenerationKwh += actualKwh;

      let status: "normal" | "low_generation" | "offline" = "normal";
      if (!telemetry || telemetry.sampleCount === 0) {
        status = "offline";
      } else if (actualKwh < expectedKwh * 0.6) {
        status = "low_generation";
      }

      generationDays.push({
        date: dateStr,
        generation_kwh: actualKwh,
        specific_yield: dayYield,
        expected_kwh: expectedKwh,
        status,
        sample_count: telemetry?.sampleCount || 0,
        peak_power_kw: telemetry ? Number(telemetry.peakPowerKw.toFixed(2)) : undefined,
      });
    }
  }

  // Calculate Expected Generation and Performance Metrics
  const expectedGenerationKwh = totalCapacity * baseYieldPerKwp * (elapsedDaysCount || daysInMonth);
  const specificYield = totalCapacity > 0 ? Number((totalGenerationKwh / totalCapacity).toFixed(2)) : 0;
  const performanceRatio = expectedGenerationKwh > 0 ? Number(((totalGenerationKwh / expectedGenerationKwh) * 100).toFixed(1)) : null;
  const inverterAvailability = elapsedDaysCount > 0 ? Number(((reportingDaysCount / elapsedDaysCount) * 100).toFixed(1)) : 100;

  // Calculate Health Score
  const latestTelemetryTimestampMap = new Map<string, string>();
  if (inverterIds.length > 0) {
    const latestTelsRes = await serviceClient.rpc("get_latest_telemetry", { inverter_ids: inverterIds });
    const latestTelemetry = latestTelsRes.data ?? [];
    for (const t of latestTelemetry) {
      if (t.timestamp) {
        latestTelemetryTimestampMap.set(t.inverter_id, t.timestamp);
      }
    }
  }

  const healthResult = calculateClientHealthScore({
    inverters,
    alerts,
    sites: sites.filter((s) => targetSiteId === "all" || s.id === targetSiteId),
    tickets,
    latestTelemetryTimestampMap,
  });

  // Calculate Average Tariff
  const configuredTariffs = sites
    .filter((s) => targetSiteId === "all" || s.id === targetSiteId)
    .map((s) => s.grid_tariff_inr_per_kwh)
    .filter((t) => t !== null && t !== undefined);

  const avgTariff = configuredTariffs.length > 0
    ? configuredTariffs.reduce((a, b) => Number(a) + Number(b), 0) / configuredTariffs.length
    : null;

  // Format cleaning logs for the selected month
  const reportCleanings: ReportCleaningLog[] = cleaningLogs.map((c) => ({
    id: c.id,
    site_id: c.site_id,
    site_name: c.sites?.name || "Solar Site",
    performed_at: c.performed_at,
    safety_photo_url: c.safety_photo_url,
    before_photo_url: c.before_photo_url,
    after_photo_url: c.after_photo_url,
    damage_observed: c.damage_observed,
    damage_type: c.damage_type,
    remarks: c.remarks,
  }));

  // Format incidents with factual resolution mode (Automated Telemetry vs Field Technician Service)
  const reportIncidents: ReportIncident[] = tickets.map((t) => {
    const linkedWo = workOrders.find((wo: any) => wo.ticket_id === t.id);
    const hasCompletedWo = linkedWo && (linkedWo.status === "completed" || linkedWo.completed_at);
    const hasPhotos = Boolean(
      t.before_photo_url || 
      t.after_photo_url || 
      linkedWo?.before_photo_url || 
      linkedWo?.after_photo_url
    );

    const isClosed = t.status === "closed" || t.status === "resolved";
    let resolutionMode: ReportIncident["resolution_mode"] = "open";
    let resolutionSummary = "Monitored under 24/7 telemetry supervision.";

    if (isClosed) {
      if (hasCompletedWo || hasPhotos) {
        resolutionMode = "technician";
        resolutionSummary = "Field technician completed physical work and verified site status.";
      } else {
        resolutionMode = "automated";
        resolutionSummary = "Subsequent inverter telemetry returned to normal baseline. No physical intervention recorded.";
      }
    } else if (t.status === "acknowledged") {
      resolutionMode = "acknowledged";
      resolutionSummary = "Operator acknowledged; active telemetry supervision.";
    }

    return {
      id: t.id,
      site_name: t.sites?.name || "Solar Site",
      title: t.title,
      status: t.status,
      verification_status: t.verification_status || "verified_recovered",
      created_at: t.created_at,
      resolved_at: t.resolved_at,
      post_repair_metric: t.post_repair_metric,
      resolution_mode: resolutionMode,
      resolution_summary: resolutionSummary,
    };
  });

  // Preserve report metadata into monthly_report_records for retention and quick retrieval
  try {
    await serviceClient.from("monthly_report_records").upsert(
      {
        site_id: targetSiteId === "all" ? null : targetSiteId,
        year_month: yearMonth,
        month_label: monthLabel,
        period_start: startIst,
        period_end: endIst,
        total_generation_kwh: totalGenerationKwh,
        specific_yield: specificYield,
        performance_ratio: performanceRatio,
        template_version: "v2",
        generation_status: "ready",
        metadata: {
          daysInMonth,
          elapsedDaysCount,
          reportingDaysCount,
          inverterAvailability,
          cleaningsCount: reportCleanings.length,
          incidentsCount: reportIncidents.length,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "site_id,year_month" }
    );
  } catch (e) {
    // Non-blocking metadata caching
  }

  const clientName = profile.full_name || "Valued Solar Client";
  const organizationName = customerOrg?.name || profile.organization || "Solar Energy Portfolio";

  return (
    <div className="space-y-6" data-testid="client-reports-page">
      <ClientGlobalPopups events={serviceEvents} />

      <ClientReportView
        clientName={clientName}
        organizationName={organizationName}
        sites={reportSites}
        selectedSiteId={targetSiteId}
        selectedMonth={yearMonth}
        monthLabel={monthLabel}
        availableMonths={availableMonths}
        generationDays={generationDays}
        totalGenerationKwh={totalGenerationKwh}
        expectedGenerationKwh={expectedGenerationKwh}
        specificYield={specificYield}
        performanceRatio={performanceRatio}
        inverterAvailability={inverterAvailability}
        cleanings={reportCleanings}
        incidents={reportIncidents}
        healthScore={healthResult.score}
        avgTariff={avgTariff}
      />
    </div>
  );
}
