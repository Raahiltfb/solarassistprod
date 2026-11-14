import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  Building2,
  Zap,
  TrendingUp,
  DollarSign,
  PieChart,
  Users,
  Clock,
  CheckCircle2,
  Wrench,
  BarChart3,
  Sun,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Award,
  Layers,
  ArrowUpRight,
  SprayCan,
  CalendarCheck,
  Briefcase,
  ArrowRight,
} from "lucide-react";
import { getSiteStatus } from "@/lib/status-utils";
import { PerformanceAnalyticsSection } from "@/components/performance-analytics-section";
import { hasPermission } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import { kWh } from "@/lib/utils";

export default async function FleetOverviewPage() {
  const sb = await createClient();

  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const currentDate = new Date();
  const currentCyclePeriod = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;

  const [
    sitesRes,
    invertersRes,
    ticketsRes,
    alertsRes,
    workOrdersRes,
    profileRes,
    cleaningVisitsRes,
    teamsRes,
    techsRes,
  ] = await Promise.all([
    sb.from("sites").select("id, name, capacity_kwp, location, last_cleaned_on, next_cleaning_date, cleaning_cycle_days, service_tier").order("name"),
    sb.from("inverters").select("id, site_id, status, last_seen_at"),
    sb.from("tickets").select("id, status, priority, created_at, site_id").neq("status", "closed"),
    sb.from("alerts").select("id, status, severity, site_id, code").eq("status", "open"),
    sb.from("work_orders").select("id, status, scheduled_date, type"),
    sb.from("profiles").select("id, full_name, role").eq("id", user.id).single(),
    sb.from("cleaning_visits").select("id, status, cycle_period"),
    sb.from("technician_teams").select("id, name, is_active, technician_team_members(id)"),
    sb.from("profiles").select("id, full_name").eq("role", "technician"),
  ]);

  const profile = profileRes.data;
  const userRole = (profile?.role || "epc_admin") as Role;
  const canViewFinancials = hasPermission(userRole, "financial.view");

  const sites = sitesRes.data ?? [];
  const inverters = invertersRes.data ?? [];
  const tickets = ticketsRes.data ?? [];
  const alerts = alertsRes.data ?? [];
  const workOrders = workOrdersRes.data ?? [];
  const cleaningVisits = cleaningVisitsRes.data ?? [];
  const teams = teamsRes.data ?? [];
  const techs = techsRes.data ?? [];

  // Group latest telemetry by inverter
  const inverterIds = inverters.map((inv) => inv.id);
  let latestTelemetry: any[] = [];

  if (inverterIds.length > 0) {
    const latestTelsRes = await sb.rpc("get_latest_telemetry", { inverter_ids: inverterIds });
    latestTelemetry = latestTelsRes.data ?? [];
  }

  const latestTelemetryMap = new Map<string, any>();
  const latestTimestampMap = new Map<string, string>();
  for (const t of latestTelemetry) {
    latestTelemetryMap.set(t.inverter_id, t);
    latestTimestampMap.set(t.inverter_id, t.timestamp);
  }

  // Generation and power calculations
  let totalPowerKw = 0;
  let todayEnergyKwh = 0;
  let totalGenerationKwh = 0;
  for (const inv of inverters) {
    const tel = latestTelemetryMap.get(inv.id);
    if (tel) {
      totalPowerKw += Number(tel.ac_power_kw || 0);
      todayEnergyKwh += Number(tel.daily_generation_kwh || 0);
      totalGenerationKwh += Number(tel.total_generation_kwh || tel.energy_kwh || 0);
    }
  }

  const totalCapacityKwp = sites.reduce((sum, s) => sum + Number(s.capacity_kwp || 0), 0);
  const totalCapacityMwp = (totalCapacityKwp / 1000).toFixed(2);
  const totalGenerationMwh = (totalGenerationKwh / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 });

  // Filter monitored sites vs cleaning-only sites
  const monitoredSites = sites.filter((s) => s.service_tier !== "cleaning_only");

  // Inverter and site connectivity
  let onlineSites = 0;
  let offlineSites = 0;
  for (const site of monitoredSites) {
    const siteInvs = inverters.filter((inv) => inv.site_id === site.id);
    const status = getSiteStatus(siteInvs, latestTimestampMap, undefined, site.service_tier);
    if (status === "OFFLINE") {
      offlineSites++;
    } else {
      onlineSites++;
    }
  }

  const onlineInverters = inverters.filter((i) => getSiteStatus([i], latestTimestampMap) !== "OFFLINE").length;
  const offlineInverters = inverters.length - onlineInverters;
  const fleetAvailability = inverters.length > 0 ? ((onlineInverters / inverters.length) * 100).toFixed(1) : "100.0";

  // Operational Tickets & Alerts breakdown
  const openTickets = tickets.filter((t) => t.status !== "resolved" && t.status !== "closed");
  const p1Tickets = openTickets.filter((t) => t.priority === "p1");
  const overdueTickets = openTickets.filter((t) => {
    const hours = (Date.now() - new Date(t.created_at).getTime()) / (1000 * 3600);
    return t.priority === "p1" ? hours > 6 : hours > 24;
  });

  const criticalAlerts = alerts.filter((a) => a.severity === "critical" || a.severity === "high");

  // Sites requiring attention (offline, faults, or open tickets)
  let attentionSites = 0;
  for (const site of sites) {
    const siteInvs = inverters.filter((inv) => inv.site_id === site.id);
    const status = getSiteStatus(siteInvs, latestTimestampMap);
    const hasOpenTicket = openTickets.some((t) => t.site_id === site.id);
    const hasOpenAlert = alerts.some((a) => a.site_id === site.id);
    if (status === "OFFLINE" || status === "PARTIALLY ONLINE" || hasOpenTicket || hasOpenAlert) {
      attentionSites++;
    }
  }

  // Cleaning metrics
  const currentMonthVisits = cleaningVisits.filter((cv) => cv.cycle_period === currentCyclePeriod);
  const cleaningCompleted = currentMonthVisits.filter((v) => v.status === "completed" || v.status === "acknowledged").length;
  const cleaningScheduled = currentMonthVisits.filter((v) => v.status === "published" || v.status === "en_route" || v.status === "in_progress").length;
  const cleaningPlanned = currentMonthVisits.filter((v) => v.status === "planned" || v.status === "approved").length;
  const cleaningDue = cleaningPlanned + cleaningScheduled;
  const cleaningTotal = currentMonthVisits.length;
  const cleaningCompletionRate = cleaningTotal > 0 ? Math.round((cleaningCompleted / cleaningTotal) * 100) : 0;

  let overdueCleanings = 0;
  for (const site of sites) {
    const targetDate = site.next_cleaning_date;
    if (targetDate && targetDate < todayStr) {
      overdueCleanings++;
    } else if (site.last_cleaned_on && site.cleaning_cycle_days) {
      const lastCleanedDate = new Date(site.last_cleaned_on);
      const suggestedDate = new Date(lastCleanedDate.getTime() + site.cleaning_cycle_days * 86400_000)
        .toISOString()
        .split("T")[0];
      if (suggestedDate < todayStr) overdueCleanings++;
    }
  }

  // Workforce & execution metrics
  const activeTeams = teams.filter((t) => t.is_active);
  const totalAssignedTechs = teams.reduce((sum, t) => sum + (t.technician_team_members?.length || 0), 0);
  const openWorkOrders = workOrders.filter((wo) => wo.status !== "completed" && wo.status !== "cancelled");
  const workloadPerCrew = activeTeams.length > 0 ? (openWorkOrders.length / activeTeams.length).toFixed(1) : "0.0";

  return (
    <div className="space-y-8 pb-12" data-testid="fleet-overview-page">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider">
              {canViewFinancials ? "Super Admin · Commercial & Operations" : "Site Coordinator · Fleet Operations"}
            </Badge>
          </div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Activity className="h-7 w-7 text-primary" />
            <span>
              {canViewFinancials
                ? "Executive Commercial & Fleet Operations"
                : "Fleet Operations & Asset Performance"}
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {canViewFinancials
              ? "Unified snapshot of commercial business performance, revenue targets, SLA availability, and fleet operations."
              : "Operational execution, live generation, inverter availability, cleaning cycles, and workforce dispatch."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs px-3 py-1 bg-card shadow-sm">
            {sites.length} Fleet Sites ({totalCapacityMwp} MWp)
          </Badge>
          <Badge variant="outline" className="font-mono text-xs px-3 py-1 text-emerald-600 bg-emerald-500/10 border-emerald-500/30">
            {fleetAvailability}% Availability
          </Badge>
          <Badge variant="outline" className="font-mono text-xs px-3 py-1 text-primary bg-primary/10 border-primary/30">
            {kWh(todayEnergyKwh)} Today
          </Badge>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUPER ADMIN ONLY: COMMERCIAL PERFORMANCE, UNIT ECONOMICS & SALES PIPELINE */}
      {/* ========================================================================= */}
      {canViewFinancials && (
        <div className="space-y-6">
          {/* SECTION: COMMERCIAL UNIT ECONOMICS */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              Company Commercial Performance &amp; Unit Economics
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Commercial KPI 1: Annual Revenue */}
              <Card className="shadow-sm border">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      O&amp;M Annual Revenue
                    </span>
                    <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      ₹1.10 Cr <span className="text-xs font-sans font-normal text-muted-foreground">/ yr</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Revenue / MW: <strong className="text-foreground">₹9.82 L / MW</strong>
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <DollarSign className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

              {/* Commercial KPI 2: Margins */}
              <Card className="shadow-sm border">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Gross / EBITDA Margin
                    </span>
                    <div className="text-2xl font-bold font-mono text-foreground">
                      68.4% <span className="text-xs font-sans font-normal text-muted-foreground">Gross</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      EBITDA Margin: <strong className="text-emerald-600 font-medium">42.1%</strong>
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <PieChart className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

              {/* Commercial KPI 3: Cash Conversion / DSO */}
              <Card className="shadow-sm border">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Cash Conversion / DSO
                    </span>
                    <div className="text-2xl font-bold font-mono text-foreground">
                      28 <span className="text-xs font-sans font-normal text-muted-foreground">Days DSO</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Collection Efficiency: <strong className="text-emerald-600 font-medium">92.0%</strong>
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <DollarSign className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

              {/* Commercial KPI 4: Customer Retention & Revenue Share */}
              <Card className="shadow-sm border">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Client Retention &amp; Churn
                    </span>
                    <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      98.5%
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Annual Churn: <strong className="text-foreground">1.5%</strong> · Top 3 Share: 24.1%
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* SECTION: SALES TARGETS, PIPELINE & FINANCIAL MILESTONES */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
              Sales Targets, Pipeline &amp; Financial Milestones
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Sales Pipeline */}
              <Card className="shadow-sm border">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Sales Pipeline $\rightarrow$ MW Target
                    </span>
                    <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      25.0 <span className="text-xs font-sans font-normal text-muted-foreground">MW Target</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Roofsol &amp; SolarSquare EPC fleets in capture
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

              {/* Commercial Milestone */}
              <Card className="shadow-sm border">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Annual ARR Milestone
                    </span>
                    <div className="text-2xl font-bold font-mono text-foreground">
                      ₹2.50 Cr <span className="text-xs font-sans font-normal text-muted-foreground">Target</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Run-rate pacing towards next fiscal expansion
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Award className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

              {/* ARPU / Client Economics */}
              <Card className="shadow-sm border">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Average Revenue / Client
                    </span>
                    <div className="text-2xl font-bold font-mono text-foreground">
                      ₹73.3k <span className="text-xs font-sans font-normal text-muted-foreground">/ mo</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Target: <strong className="text-foreground">150+ Clients Under Contract</strong>
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <DollarSign className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 1: OPERATIONAL CAPACITY & FLEET GENERATION PERFORMANCE */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-amber-500" />
          Fleet Installed Capacity &amp; Generation Output
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Operational KPI 1: Installed Capacity */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Installed Capacity Under Mgt
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {totalCapacityMwp} <span className="text-xs font-sans font-normal text-muted-foreground">MWp</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Across <strong className="text-foreground">{sites.length} Active Sites</strong>
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* Operational KPI 2: Today's Generation */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Today&apos;s Generation
                </span>
                <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {kWh(todayEnergyKwh)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Live Current Power: <strong className="text-foreground">{totalPowerKw.toFixed(1)} kW</strong>
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Sun className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* Operational KPI 3: Portfolio Total Generation */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Portfolio Generation History
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {totalGenerationMwh} <span className="text-xs font-sans font-normal text-muted-foreground">MWh</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Cumulative lifetime fleet yield
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <BarChart3 className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* Operational KPI 4: Inverter Availability */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Inverter Availability &amp; State
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {onlineInverters} / {inverters.length}
                </div>
                <p className="text-xs text-muted-foreground">
                  {offlineInverters === 0 ? (
                    <strong className="text-emerald-600 font-medium">100% Inverters Communicating</strong>
                  ) : (
                    <strong className="text-destructive font-medium">{offlineInverters} Inverter(s) Offline</strong>
                  )}
                </p>
              </div>
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${offlineInverters > 0 ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600"}`}>
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: OPERATIONAL FAULTS, ALERTS & ATTENTION REQUIRED */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
          Faults, Unresolved Alerts &amp; Sites Requiring Attention
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Attention Sites */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Sites Requiring Attention
                </span>
                <div className={`text-2xl font-bold font-mono ${attentionSites > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                  {attentionSites} <span className="text-xs font-sans font-normal text-muted-foreground">/ {sites.length} Sites</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {attentionSites === 0 ? "All plants performing normally" : "Outages, faults or tickets pending"}
                </p>
              </div>
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${attentionSites > 0 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-primary/10 text-primary"}`}>
                <AlertTriangle className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* Active Telemetry Alerts */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Active OEM &amp; Telemetry Alerts
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {alerts.length} <span className="text-xs font-sans font-normal text-muted-foreground">Open</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {criticalAlerts.length > 0 ? (
                    <strong className="text-destructive font-medium">{criticalAlerts.length} Critical / High Severity</strong>
                  ) : (
                    "0 Critical equipment alarms"
                  )}
                </p>
              </div>
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${criticalAlerts.length > 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                <Zap className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* Open Operational Incident Tickets */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Open Operational Tickets
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {openTickets.length} <span className="text-xs font-sans font-normal text-muted-foreground">Tickets</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {p1Tickets.length > 0 ? (
                    <strong className="text-destructive font-medium">{p1Tickets.length} P1 Priority Incident(s)</strong>
                  ) : (
                    "0 P1 Priority incidents pending"
                  )}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Briefcase className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* Overdue Work & SLA Breaches */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Overdue Work &amp; SLA
                </span>
                <div className={`text-2xl font-bold font-mono ${overdueTickets.length > 0 ? "text-destructive" : "text-foreground"}`}>
                  {overdueTickets.length} <span className="text-xs font-sans font-normal text-muted-foreground">Breaches</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Target: <strong className="text-emerald-600 font-medium">Zero SLA Breaches (&lt;6h MTTR)</strong>
                </p>
              </div>
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${overdueTickets.length > 0 ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600"}`}>
                <Clock className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 3: OPERATIONAL CLEANING CYCLES & COMPLETION RATES */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <SprayCan className="h-3.5 w-3.5 text-primary" />
            Module Cleaning Execution &amp; Completion Rates ({currentCyclePeriod})
          </h2>
          <Button asChild variant="ghost" size="sm" className="text-xs h-7 gap-1">
            <Link href="/cleaning">
              <span>View Cleaning Planner</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Cleaning Completed */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Cleanings Completed
                </span>
                <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {cleaningCompleted} <span className="text-xs font-sans font-normal text-muted-foreground">Visits</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Successfully verified and executed this cycle
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* Cleanings Scheduled / In Progress */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Cleanings Scheduled &amp; Due
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {cleaningDue} <span className="text-xs font-sans font-normal text-muted-foreground">Visits Due</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {cleaningScheduled} published/en route · {cleaningPlanned} planned
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <CalendarCheck className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* Overdue Cleanings */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Overdue Cleanings
                </span>
                <div className={`text-2xl font-bold font-mono ${overdueCleanings > 0 ? "text-destructive" : "text-foreground"}`}>
                  {overdueCleanings} <span className="text-xs font-sans font-normal text-muted-foreground">Sites Overdue</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Exceeding standard 15d / 30d cleaning cycle
                </p>
              </div>
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${overdueCleanings > 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                <AlertTriangle className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* Cleaning Completion Rate */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Cycle Completion Rate
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {cleaningCompletionRate}%
                </div>
                <p className="text-xs text-muted-foreground">
                  Progress towards 100% monthly fleet target
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Award className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 4: TECHNICIAN & TEAM WORKLOAD EXECUTION */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5 text-primary" />
            Technician &amp; Team Workload Execution
          </h2>
          <Button asChild variant="ghost" size="sm" className="text-xs h-7 gap-1">
            <Link href="/cleaning/teams">
              <span>Manage Teams &amp; Capacity</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Active Field Crews */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Active Field Crews
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {activeTeams.length} <span className="text-xs font-sans font-normal text-muted-foreground">Teams</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  2-person operational cleaning crews
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Users className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* Assigned Technicians */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Field Technicians Paired
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {totalAssignedTechs} / {techs.length}
                </div>
                <p className="text-xs text-muted-foreground">
                  <strong className="text-emerald-600 font-medium">100% paired (2 techs/crew)</strong>
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* Workload per Crew */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Workload / Crew
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {workloadPerCrew} <span className="text-xs font-sans font-normal text-muted-foreground">Jobs / Crew</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Across {openWorkOrders.length} active cleaning &amp; O&amp;M jobs
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Layers className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* Shift Capacity */}
          <Card className="shadow-sm border">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Daily Crew Capacity
                </span>
                <div className="text-2xl font-bold font-mono text-foreground">
                  480 <span className="text-xs font-sans font-normal text-muted-foreground">mins</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  8.0 working hours standard shift
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Clock className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 5: FLEET ENERGY OUTPUT & GENERATION ANALYTICS (TRENDS) */}
      {/* ========================================================================= */}
      <Card className="shadow-sm border">
        <CardHeader className="p-5 pb-2 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <span>Fleet Energy Output &amp; Generation Trends</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Comparative portfolio energy output history across daily, weekly, monthly, and yearly cycles.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-3">
          <PerformanceAnalyticsSection
            isPortfolio={true}
            initialInverterIds={inverterIds}
            initialTotalCapacity={totalCapacityKwp}
          />
        </CardContent>
      </Card>
    </div>
  );
}
