import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Clock, SprayCan, ArrowRight, Building2 } from "lucide-react";
import { getSiteStatus } from "@/lib/status-utils";
import { formatDate } from "@/lib/utils";
import { KpiCard } from "@/components/kpi-card";

import { FleetStatusBanner } from "@/components/command-center/fleet-status-banner";
import { NeedsAttentionQueue } from "@/components/command-center/needs-attention-queue";
import { TodaysOperationsTracker } from "@/components/command-center/todays-operations-tracker";
import { FleetActivityFeed } from "@/components/command-center/fleet-activity-feed";
import { FleetSiteMatrix } from "@/components/command-center/fleet-site-matrix";
import { PerformanceAnalyticsSection } from "@/components/performance-analytics-section";

export default async function DashboardPage() {
  const sb = await createClient();

  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return null;
  }

  // =========================================================
  // TECHNICIAN DASHBOARD (Keep simple technician execution view)
  // =========================================================
  if (profile.role === "technician") {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [sitesRes, completedTodayRes] = await Promise.all([
      sb.from("sites").select("*").order("name"),
      sb.from("cleaning_logs")
        .select("id", { count: "exact", head: true })
        .gte("performed_at", startOfToday.toISOString()),
    ]);

    const siteList = sitesRes.data ?? [];
    const completedToday = completedTodayRes.count ?? 0;
    const now = Date.now();

    const enrichedSites = siteList.map((site) => {
      const lastCleaned = site.last_cleaned_on
        ? new Date(site.last_cleaned_on).getTime()
        : 0;

      const daysSinceClean =
        lastCleaned > 0 ? Math.floor((now - lastCleaned) / 86400_000) : 999;
      const overdueDays = daysSinceClean - site.cleaning_cycle_days;

      let priority = "normal";
      if (Number(site.capacity_kwp) >= 5000 || overdueDays >= 5) {
        priority = "high";
      } else if (overdueDays >= 0) {
        priority = "medium";
      }

      return {
        ...site,
        daysSinceClean,
        overdueDays,
        priority,
      };
    });

    const overdueSites = enrichedSites.filter((s) => s.overdueDays >= 0);
    const upcomingSites = enrichedSites.filter(
      (s) => s.overdueDays < 0 && s.overdueDays >= -3
    );

    return (
      <div className="space-y-6" data-testid="dashboard-page">
        <div>
          <h1 className="text-3xl font-display font-semibold tracking-tight">
            Hello, {profile.full_name || "Technician"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Role: SolarAssist Operations Technician
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard
            label="Overdue Sites"
            value={overdueSites.length}
            sub="Requires immediate cleaning"
            icon={AlertTriangle}
            accent={overdueSites.length > 0 ? "destructive" : "success"}
          />
          <KpiCard
            label="Completed Today"
            value={completedToday}
            sub="Logs submitted"
            icon={CheckCircle2}
            accent="success"
          />
          <KpiCard
            label="Upcoming Cycle"
            value={upcomingSites.length}
            sub="Next 3 days"
            icon={Clock}
          />
        </div>

        {overdueSites.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-base text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" /> Overdue Sites ({overdueSites.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {overdueSites.map((site) => (
                <Card key={site.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2 border-b flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-semibold">{site.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{site.location}</p>
                    </div>
                    <Badge variant="destructive">
                      {site.overdueDays === 0 ? "Due Today" : `${site.overdueDays}d Overdue`}
                    </Badge>
                  </CardHeader>
                  <CardContent className="pt-3 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Capacity:</span>
                      <span className="font-mono font-medium">{Number(site.capacity_kwp).toLocaleString()} kWp</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Cleaned:</span>
                      <span>{site.last_cleaned_on ? formatDate(site.last_cleaned_on) : "Never"}</span>
                    </div>
                    <div className="pt-2 border-t flex justify-end">
                      <Link href={`/technician/sites/${site.id}`}>
                        <Button size="sm" className="text-[11px] h-7 gap-1">
                          Log Cleaning <SprayCan className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <h3 className="font-semibold text-base">All Assigned Sites</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {enrichedSites.map((site) => (
              <Card key={site.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardHeader className="pb-2 border-b flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">{site.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{site.location}</p>
                  </div>
                  <Badge variant={site.priority === "high" ? "destructive" : site.priority === "medium" ? "warning" : "secondary"}>
                    {site.priority === "high" ? "High Priority" : site.priority === "medium" ? "Medium" : "Normal"}
                  </Badge>
                </CardHeader>
                <CardContent className="pt-3 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Capacity:</span>
                    <span className="font-mono font-medium">{Number(site.capacity_kwp).toLocaleString()} kWp</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Cleaned:</span>
                    <span>{site.last_cleaned_on ? formatDate(site.last_cleaned_on) : "Never"}</span>
                  </div>
                  <div className="pt-2 border-t flex justify-end">
                    <Link href={`/technician/sites/${site.id}`}>
                      <Button variant="outline" size="sm" className="text-[11px] h-7 gap-1">
                        View Details & Log
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================
  // SOLARASSIST OPERATIONS COMMAND CENTER (Admin / EPC / Coordinator)
  // =========================================================
  const todayStr = new Date().toISOString().split("T")[0];

  const [
    sitesRes,
    invertersRes,
    ticketsRes,
    workOrdersRes,
    dailyRoutesRes,
    techniciansRes,
    alertsRes,
    cleaningLogsRes,
  ] = await Promise.all([
    sb
      .from("sites")
      .select(
        "id, org_id, name, location, latitude, longitude, capacity_kwp, commissioned_on, cleaning_cycle_days, last_cleaned_on, next_cleaning_date, cleaning_schedule_type, cleaning_schedule_notes, client_id, client_org_id, grid_tariff_inr_per_kwh, status, timezone, created_at"
      )
      .order("name"),
    sb
      .from("inverters")
      .select("id, site_id, oem, oem_device_id, model, serial_number, capacity_kw, string_count, status, last_seen_at, installed_on"),
    sb
      .from("tickets")
      .select("*, sites(name), alerts(id, code, title)")
      .order("created_at", { ascending: false }),
    sb
      .from("work_orders")
      .select("*, sites(name), profiles!work_orders_technician_id_fkey(full_name)")
      .order("created_at", { ascending: false }),
    sb
      .from("daily_routes")
      .select("*, profiles!daily_routes_technician_id_fkey(full_name, base_address), route_stops(*, work_orders(*, sites(name)))")
      .eq("date", todayStr),
    sb.from("profiles").select("*").eq("role", "technician").order("full_name"),
    sb.from("alerts").select("*, sites(name)").order("triggered_at", { ascending: false }).limit(20),
    sb.from("cleaning_logs").select("*, sites(name)").order("performed_at", { ascending: false }).limit(10),
  ]);

  const sites = sitesRes.data ?? [];
  const inverters = invertersRes.data ?? [];
  const tickets = ticketsRes.data ?? [];
  const workOrders = workOrdersRes.data ?? [];
  const dailyRoutes = dailyRoutesRes.data ?? [];
  const technicians = techniciansRes.data ?? [];
  const alerts = alertsRes.data ?? [];
  const cleaningLogs = cleaningLogsRes.data ?? [];

  // Fetch telemetry snapshots per inverter
  const inverterIds = inverters.map((i) => i.id);
  let latestTelemetry: any[] = [];

  if (inverterIds.length > 0) {
    const latestTelsRes = await sb.rpc("get_latest_telemetry", { inverter_ids: inverterIds });
    latestTelemetry = latestTelsRes.data ?? [];
  }

  // Telemetry lookup maps
  const latestTelemetryMap = new Map<string, any>();
  const latestTimestampMap = new Map<string, string>();
  for (const t of latestTelemetry) {
    latestTelemetryMap.set(t.inverter_id, t);
    latestTimestampMap.set(t.inverter_id, t.timestamp);
  }

  // Calculate live power & energy metrics
  let currentPowerKw = 0;
  let todayEnergyKwh = 0;
  for (const inv of inverters) {
    const tel = latestTelemetryMap.get(inv.id);
    if (tel) {
      currentPowerKw += Number(tel.ac_power_kw || 0);
      todayEnergyKwh += Number(tel.daily_generation_kwh || 0);
    }
  }

  // Site health & status breakdown
  const siteInvertersMap = new Map<string, typeof inverters>();
  for (const inv of inverters) {
    const list = siteInvertersMap.get(inv.site_id) ?? [];
    list.push(inv);
    siteInvertersMap.set(inv.site_id, list);
  }

  let onlineSites = 0;
  let normalSites = 0;
  let attentionSites = 0;
  let offlineSites = 0;

  const offlineSitesList: any[] = [];

  for (const site of sites) {
    const siteInvs = siteInvertersMap.get(site.id) ?? [];
    const status = getSiteStatus(siteInvs, latestTimestampMap);

    const siteTickets = tickets.filter((t) => t.site_id === site.id && t.status !== "resolved" && t.status !== "closed");
    const siteAlerts = alerts.filter((a) => a.site_id === site.id && a.status === "open");

    if (status === "ONLINE" || status === "PARTIALLY ONLINE") {
      onlineSites++;
      if (siteTickets.length > 0 || siteAlerts.length > 0 || status === "PARTIALLY ONLINE") {
        attentionSites++;
      } else {
        normalSites++;
      }
    } else {
      offlineSites++;
      attentionSites++;
      offlineSitesList.push({
        ...site,
        offlineInvertersCount: siteInvs.filter((i) => i.status === "offline").length || 1,
      });
    }
  }

  const onlineInverters = inverters.filter((i) => i.status === "online").length;
  const offlineInverters = inverters.filter((i) => i.status === "offline").length;

  const openTickets = tickets.filter((t) => t.status !== "resolved" && t.status !== "closed");
  const openAlerts = alerts.filter((a) => a.status === "open");

  // Today's work orders (scheduled, en_route, in_progress, completed)
  const todayWorkOrders = workOrders.filter((wo) => wo.scheduled_date === todayStr);

  // Concise Cleaning Overview calculation
  const now = new Date();
  const next7Days = new Date(now.getTime() + 7 * 86400_000).toISOString().split("T")[0];

  let cleaningsDueThisWeek = 0;
  let overdueCleanings = 0;

  for (const site of sites) {
    const targetDate = site.next_cleaning_date;
    if (targetDate) {
      if (targetDate < todayStr) overdueCleanings++;
      else if (targetDate <= next7Days) cleaningsDueThisWeek++;
    } else if (site.last_cleaned_on && site.cleaning_cycle_days) {
      const lastCleanedDate = new Date(site.last_cleaned_on);
      const suggestedDate = new Date(lastCleanedDate.getTime() + site.cleaning_cycle_days * 86400_000)
        .toISOString()
        .split("T")[0];

      if (suggestedDate < todayStr) overdueCleanings++;
      else if (suggestedDate <= next7Days) cleaningsDueThisWeek++;
    }
  }

  // Enrich sites for Matrix component
  const enrichedMatrixSites = sites.map((site) => {
    const siteInvs = siteInvertersMap.get(site.id) ?? [];
    let sPower = 0;
    let sEnergy = 0;
    for (const inv of siteInvs) {
      const tel = latestTelemetryMap.get(inv.id);
      if (tel) {
        sPower += Number(tel.ac_power_kw || 0);
        sEnergy += Number(tel.daily_generation_kwh || 0);
      }
    }

    const openCount = tickets.filter(
      (t) => t.site_id === site.id && t.status !== "resolved" && t.status !== "closed"
    ).length;

    return {
      ...site,
      currentPowerKw: sPower,
      todayEnergyKwh: sEnergy,
      openTicketsCount: openCount,
    };
  });

  return (
    <div className="space-y-8 pb-12" data-testid="dashboard-page">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-display font-bold tracking-tight text-foreground">
            Operations Command Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time operational monitoring, deduplicated incident queue, route dispatches, and fleet performance.
          </p>
        </div>
      </div>

      {/* 1. Fleet Executive Status Banner & Metric Cards */}
      <FleetStatusBanner
        totalSites={sites.length}
        onlineSites={onlineSites}
        normalSites={normalSites}
        attentionSites={attentionSites}
        offlineSites={offlineSites}
        totalInverters={inverters.length}
        onlineInverters={onlineInverters}
        offlineInverters={offlineInverters}
        openTicketsCount={openTickets.length}
        openAlertsCount={openAlerts.length}
        currentPowerKw={currentPowerKw}
        todayEnergyKwh={todayEnergyKwh}
      />

      {/* 2. Needs Attention Deduplicated Incident Queue */}
      <NeedsAttentionQueue
        tickets={tickets}
        workOrders={workOrders}
        offlineSites={offlineSitesList}
        alerts={alerts}
      />

      {/* 3. Field Operations & Technician Dispatch Tracker */}
      <TodaysOperationsTracker
        dailyRoutes={dailyRoutes}
        technicians={technicians}
        todayWorkOrders={todayWorkOrders}
      />

      {/* 4. Concise Operational Cleaning Summary Card */}
      <Card className="border shadow-sm bg-gradient-to-r from-card via-card to-amber-500/5">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <SprayCan className="h-6 w-6" />
              </div>
              <div className="space-y-0.5">
                <div className="text-lg font-bold text-foreground">
                  {cleaningsDueThisWeek + overdueCleanings} Cleanings Scheduled This Week
                  {overdueCleanings > 0 && (
                    <span className="text-destructive font-semibold ml-2">
                      · {overdueCleanings} Overdue
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Review Option A manual schedules & Option B suggested cycle dates for all 35 operational fleet sites.
                </p>
              </div>
            </div>

            <Button asChild variant="default" size="sm" className="text-xs h-9 gap-1.5">
              <Link href="/cleaning">
                <span>Manage Cleaning Schedule</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 5. Fleet Performance Analytics (Reused Baseline Component) */}
      <Card className="border shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle className="text-lg font-bold">Fleet Production & Generation Analytics</CardTitle>
          <CardDescription className="text-sm">
            Fleet-wide energy generation and power output history with Daily, Weekly, Monthly, Yearly, and Lifetime range controls.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-2">
          <PerformanceAnalyticsSection
            isPortfolio={true}
            initialInverterIds={inverterIds}
            initialTotalCapacity={sites.reduce((sum, s) => sum + Number(s.capacity_kwp || 0), 0)}
          />
        </CardContent>
      </Card>

      {/* 6. Recent Operational Activity Feed & Site Grid Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <FleetActivityFeed
            alerts={alerts}
            tickets={tickets}
            workOrders={workOrders}
            cleaningLogs={cleaningLogs}
          />
        </div>

        <div className="lg:col-span-2">
          <FleetSiteMatrix sites={enrichedMatrixSites} inverters={inverters} />
        </div>
      </div>
    </div>
  );
}