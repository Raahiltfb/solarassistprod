import { createClient, createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PerformanceAnalyticsSection } from "@/components/performance-analytics-section";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Zap, 
  Activity, 
  Building2, 
  CheckCircle2, 
  AlertCircle, 
  ArrowUpRight, 
  Coins, 
  ShieldCheck, 
  MapPin,
  Info,
  Wrench,
  Sun,
  SprayCan,
  Calendar,
  BarChart3,
  Check
} from "lucide-react";
import { calculateClientHealthScore } from "@/lib/client-health-score";
import { calculateFinancialSavings, sanitizeServiceEvents, formatClientServiceRequests } from "@/lib/client-sanitizer";
import { ClientGlobalPopups } from "@/components/client-global-popups";
import { ClientHealthBreakdownModal } from "@/components/client-health-breakdown-modal";
import { ClientServiceRequestsSection } from "@/components/client-service-requests-section";
import { ClientEvidenceViewer } from "@/components/client-evidence-viewer";
import { getSiteStatus } from "@/lib/status-utils";
import { kWh, formatDateTime, formatDate } from "@/lib/utils";

export default async function ClientPortfolioPage() {
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

  // Fetch Customer Organization details if assigned
  let customerOrg = null;
  if (profile.org_id) {
    const { data: org } = await serviceClient.from("organizations").select("*").eq("id", profile.org_id).single();
    customerOrg = org;
  }

  // Fetch client accessible sites (strictly scoped via tenant rules)
  let sitesQuery = serviceClient.from("sites").select("*").order("name");
  if (profile.role === "client") {
    if (profile.org_id) {
      sitesQuery = sitesQuery.or(`client_id.eq.${profile.id},client_org_id.eq.${profile.org_id}`);
    } else {
      sitesQuery = sitesQuery.eq("client_id", profile.id);
    }
  }
  const { data: sitesRes } = await sitesQuery;

  const sites = sitesRes ?? [];
  const siteIds = sites.map((s) => s.id);
  const sitesMap = new Map(sites.map((s) => [s.id, s]));

  let inverters: any[] = [];
  let alerts: any[] = [];
  let cleaningLogs: any[] = [];
  let workOrders: any[] = [];
  let tickets: any[] = [];
  let upcomingVisits: any[] = [];

  const todayStr = new Date().toISOString().slice(0, 10);

  if (siteIds.length > 0) {
    const [invRes, altRes, clnRes, woRes, tktRes, visRes] = await Promise.all([
      serviceClient.from("inverters").select("*").in("site_id", siteIds),
      serviceClient.from("alerts").select("*").in("site_id", siteIds),
      serviceClient.from("cleaning_logs").select("*").in("site_id", siteIds).order("performed_at", { ascending: false }).limit(25),
      serviceClient.from("work_orders").select("*, tickets(before_photo_url, after_photo_url)").in("site_id", siteIds).order("created_at", { ascending: false }).limit(25),
      serviceClient.from("tickets").select("*").in("site_id", siteIds).order("created_at", { ascending: false }).limit(25),
      serviceClient.from("cleaning_visits").select("*, sites(name)").in("site_id", siteIds).gte("scheduled_date", todayStr).in("status", ["published", "scheduled", "planned", "approved"]).order("scheduled_date", { ascending: true }),
    ]);

    inverters = invRes.data ?? [];
    alerts = altRes.data ?? [];
    cleaningLogs = clnRes.data ?? [];
    workOrders = woRes.data ?? [];
    tickets = tktRes.data ?? [];
    upcomingVisits = visRes.data ?? [];
  }

  // Canonical upcoming cleaning map
  const upcomingCleaningMap = new Map<string, any>();
  for (const v of upcomingVisits) {
    if (!upcomingCleaningMap.has(v.site_id)) {
      upcomingCleaningMap.set(v.site_id, v);
    }
  }

  const inverterIds = inverters.map((i) => i.id);

  let latestTelemetry: any[] = [];
  if (inverterIds.length > 0) {
    const latestTelsRes = await serviceClient.rpc("get_latest_telemetry", { inverter_ids: inverterIds });
    latestTelemetry = latestTelsRes.data ?? [];
  }

  // Group latest telemetry by inverter ID
  const latestInvTelemetryMap = new Map<string, any>();
  const latestTelemetryTimestampMap = new Map<string, string>();
  for (const t of latestTelemetry) {
    latestInvTelemetryMap.set(t.inverter_id, t);
    if (t.timestamp) {
      latestTelemetryTimestampMap.set(t.inverter_id, t.timestamp);
    }
  }

  // Calculate Portfolio Energy Metrics
  let currentPowerKw = 0;
  let todayGenerationKwh = 0;
  let lifetimeGenerationKwh = 0;
  let totalCapacityKwp = sites.reduce((sum, s) => sum + Number(s.capacity_kwp || 0), 0);

  for (const inv of inverters) {
    const tel = latestInvTelemetryMap.get(inv.id);
    if (tel) {
      currentPowerKw += Number(tel.ac_power_kw || 0);
      todayGenerationKwh += Number(tel.daily_generation_kwh || 0);
      lifetimeGenerationKwh += Number(tel.total_generation_kwh || 0);
    }
  }

  // Today's Specific Yield calculation
  const todaySpecificYield = totalCapacityKwp > 0 ? (todayGenerationKwh / totalCapacityKwp) : 0;

  // Group inverters by site
  const siteInverters = new Map<string, any[]>();
  for (const inv of inverters) {
    const list = siteInverters.get(inv.site_id) ?? [];
    list.push(inv);
    siteInverters.set(inv.site_id, list);
  }

  // Site Status Counts
  let onlineSitesCount = 0;
  let attentionSitesCount = 0;
  const sitesNeedingAttention: string[] = [];

  for (const site of sites) {
    const siteInvs = siteInverters.get(site.id) ?? [];
    const siteStatus = getSiteStatus(siteInvs, latestTelemetryTimestampMap);
    if (siteStatus === "ONLINE") {
      onlineSitesCount++;
    } else {
      attentionSitesCount++;
      sitesNeedingAttention.push(site.name);
    }
  }

  // Calculate Health Score with Phase 6 verification states
  const healthResult = calculateClientHealthScore({
    inverters,
    alerts: alerts.filter((a) => a.status === "open"),
    sites,
    tickets,
    latestTelemetryTimestampMap,
  });

  // Calculate Savings if grid_tariff_inr_per_kwh is configured
  const configuredTariffs = sites.map((s) => s.grid_tariff_inr_per_kwh).filter((t) => t !== null && t !== undefined);
  const avgTariff = configuredTariffs.length > 0 
    ? (configuredTariffs.reduce((a, b) => Number(a) + Number(b), 0) / configuredTariffs.length)
    : null;

  const savingsResult = calculateFinancialSavings(lifetimeGenerationKwh, avgTariff);
  const todaySavingsResult = calculateFinancialSavings(todayGenerationKwh, avgTariff);

  // Sanitized Service Timeline Events
  const serviceEvents = sanitizeServiceEvents(alerts, workOrders, cleaningLogs, tickets);
  const clientServiceRequests = formatClientServiceRequests(tickets, workOrders, sitesMap);

  const portfolioName = customerOrg?.name || profile.organization || "Solar Portfolio";
  const allSystemsHealthy = attentionSitesCount === 0;

  return (
    <div className="space-y-6" data-testid="client-portfolio-page">
      <ClientGlobalPopups events={serviceEvents} />
      
      {/* Portfolio Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
              Customer Portal
            </span>
            <span className="text-xs text-muted-foreground">• Portfolio Overview</span>
          </div>
          <h1 className="text-3xl font-display font-semibold tracking-tight mt-1">
            {portfolioName}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Transparent performance metrics, routine maintenance care, and verified operational status for your solar installations.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href="/client/reports">
            <Button variant="outline" className="gap-2 text-xs">
              <BarChart3 className="h-4 w-4" /> Monthly Reports
            </Button>
          </Link>
          <Link href="/client/sites">
            <Button className="gap-2 text-xs">
              <Building2 className="h-4 w-4" /> View All Sites ({sites.length})
            </Button>
          </Link>
        </div>
      </div>

      {/* Viewport 1: 10-Second Executive Status Banner */}
      <Card className={`overflow-hidden border shadow-sm ${
        allSystemsHealthy 
          ? "bg-gradient-to-r from-emerald-500/10 via-card to-card border-emerald-500/30" 
          : "bg-gradient-to-r from-amber-500/10 via-card to-card border-amber-500/30"
      }`}>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className={`flex items-center justify-center h-14 w-14 rounded-2xl shrink-0 ${
                allSystemsHealthy 
                  ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" 
                  : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
              }`}>
                {allSystemsHealthy ? (
                  <ShieldCheck className="h-8 w-8" />
                ) : (
                  <AlertCircle className="h-8 w-8" />
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold tracking-tight text-foreground">
                    {allSystemsHealthy 
                      ? "All Solar Systems Operating Normally" 
                      : `${attentionSitesCount} ${attentionSitesCount === 1 ? 'Site Needs' : 'Sites Need'} Attention`}
                  </h2>
                  <Badge 
                    variant={allSystemsHealthy ? "success" : "warning"}
                    className="text-xs px-2.5 py-0.5 font-medium"
                  >
                    {allSystemsHealthy ? "Operating Smoothly" : "SolarAssist Managing"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground max-w-2xl">
                  {allSystemsHealthy ? (
                    `All ${sites.length} solar sites are actively generating clean electricity. SolarAssist 24/7 automated O&M supervision is active.`
                  ) : (
                    `SolarAssist is actively managing operational items at ${sitesNeedingAttention.join(", ")}. Certified technicians and automated telemetry verification are supervising recovery.`
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6 bg-background/80 backdrop-blur px-5 py-3 rounded-xl border">
              <div>
                <div className="text-xs text-muted-foreground">Sites Operational</div>
                <div className="text-lg font-bold font-mono text-foreground">{onlineSitesCount} / {sites.length}</div>
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <div className="text-xs text-muted-foreground">System Health</div>
                <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {healthResult.score} / 100
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Non-Technical Headline Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Energy Produced Today */}
        <Card className="hover:shadow-sm transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium uppercase tracking-wider flex items-center justify-between">
              <span>Energy Produced Today</span>
              <Sun className="h-4 w-4 text-emerald-500" />
            </CardDescription>
            <CardTitle className="text-3xl font-bold font-mono text-foreground mt-1">
              {kWh(todayGenerationKwh)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              Units of clean electricity generated today across your portfolio
            </p>
          </CardContent>
        </Card>

        {/* Metric 2: Today's Specific Yield */}
        <Card className="hover:shadow-sm transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium uppercase tracking-wider flex items-center justify-between">
              <span>Today's Specific Yield</span>
              <Activity className="h-4 w-4 text-amber-500" />
            </CardDescription>
            <CardTitle className="text-3xl font-bold font-mono text-foreground mt-1">
              {todaySpecificYield.toFixed(2)} <span className="text-sm font-sans font-normal text-muted-foreground">kWh/kWp</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <span>Electricity generated relative to installed solar capacity.</span>
            </p>
          </CardContent>
        </Card>

        {/* Metric 3: System Health Score with Explainability */}
        <Card className="hover:shadow-sm transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium uppercase tracking-wider flex items-center justify-between">
              <span>System Health</span>
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            </CardDescription>
            <CardTitle className="text-3xl font-bold font-mono text-foreground mt-1">
              {healthResult.score} <span className="text-sm font-sans font-normal text-muted-foreground">/ 100</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            <p className="text-xs text-muted-foreground line-clamp-1">
              {healthResult.summary}
            </p>
            <ClientHealthBreakdownModal
              healthResult={healthResult}
              trigger={
                <button type="button" className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
                  <span>View explainable factors</span>
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              }
            />
          </CardContent>
        </Card>

        {/* Metric 4: Financial Savings */}
        <Card className="hover:shadow-sm transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium uppercase tracking-wider flex items-center justify-between">
              <span>Estimated Lifetime Savings</span>
              <Coins className="h-4 w-4 text-emerald-500" />
            </CardDescription>
            <CardTitle className="text-3xl font-bold font-mono text-foreground mt-1">
              {savingsResult ? savingsResult.formatted : "Not configured"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              {avgTariff ? `Calculated at ₹${avgTariff.toFixed(2)}/kWh grid tariff` : "Set grid tariff in settings to calculate financial savings"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Production Analytics Chart & Upcoming Care Widget */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interactive Production Analytics Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
            <div>
              <CardTitle className="text-base font-semibold">Solar Production Analytics</CardTitle>
              <CardDescription className="text-xs">
                Interactive energy output and specific yield trends across your solar portfolio
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              Live Telemetry
            </Badge>
          </CardHeader>
          <CardContent className="pt-4">
            <PerformanceAnalyticsSection
              siteIds={siteIds}
              isPortfolio={true}
              isClientView={true}
              initialInverterIds={inverterIds}
              initialTotalCapacity={totalCapacityKwp}
            />
          </CardContent>
        </Card>

        {/* Upcoming Routine Cleaning & Care Schedule */}
        <Card className="flex flex-col justify-between">
          <div>
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <SprayCan className="h-4 w-4 text-primary" /> Upcoming Cleaning Care
                </CardTitle>
                <Badge variant="outline" className="text-xs font-mono">
                  {upcomingVisits.length} Planned
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Scheduled module washing to eliminate soiling loss
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-4 space-y-3.5">
              {upcomingVisits.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-8 space-y-2">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto" />
                  <div>All panel cleanings are currently up to date.</div>
                </div>
              ) : (
                upcomingVisits.slice(0, 4).map((visit) => (
                  <div key={visit.id} className="p-3 border rounded-xl bg-card space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{visit.sites?.name || "Solar Site"}</span>
                      <Badge variant="secondary" className="text-[10px] capitalize">
                        {visit.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-primary" /> {formatDate(visit.scheduled_date)}
                      </span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">Certified Cleaning Team</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </div>

          <div className="p-4 border-t bg-muted/20 text-xs text-muted-foreground flex items-center justify-between">
            <span>Regular 15-30 day routine cycles</span>
            <Link href="/client/reports" className="text-primary font-medium hover:underline text-[11px]">
              View Historical Proofs →
            </Link>
          </div>
        </Card>
      </div>

      {/* Service Requests & Operational Care Section */}
      <ClientServiceRequestsSection
        serviceRequests={clientServiceRequests}
      />

      {/* Your Solar Sites Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Your Solar Sites ({sites.length})</h2>
            <p className="text-xs text-muted-foreground">Select an individual site for detailed inverter metrics and maintenance logs</p>
          </div>
          <Link href="/client/sites" className="text-xs text-primary font-medium flex items-center gap-1 hover:underline">
            View all sites <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sites.map((s) => {
            const siteInvs = siteInverters.get(s.id) ?? [];
            const siteStatus = getSiteStatus(siteInvs, latestTelemetryTimestampMap);

            let sitePower = 0;
            let siteTodayYield = 0;
            for (const inv of siteInvs) {
              const tel = latestInvTelemetryMap.get(inv.id);
              if (tel) {
                sitePower += Number(tel.ac_power_kw || 0);
                siteTodayYield += Number(tel.daily_generation_kwh || 0);
              }
            }

            const siteSavings = calculateFinancialSavings(siteTodayYield, s.grid_tariff_inr_per_kwh);
            const isSiteNormal = siteStatus === "ONLINE";

            const canonicalVisit = upcomingCleaningMap.get(s.id);
            const nextCleaningStr = canonicalVisit
              ? canonicalVisit.scheduled_date
              : s.last_cleaned_on
              ? new Date(new Date(s.last_cleaned_on).getTime() + (s.cleaning_cycle_days || 15) * 86400_000).toISOString().slice(0, 10)
              : s.next_cleaning_date;

            return (
              <Card key={s.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardHeader className="pb-3 border-b flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">{s.name}</CardTitle>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3" /> {s.location}
                    </p>
                  </div>
                  <Badge variant={isSiteNormal ? "success" : "warning"}>
                    {isSiteNormal ? "Operating Normally" : "Attention Needed"}
                  </Badge>
                </CardHeader>
                <CardContent className="pt-4 text-xs space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-muted-foreground">System Size</div>
                      <div className="font-semibold font-mono">{s.capacity_kwp} kWp</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Current Output</div>
                      <div className="font-semibold font-mono">{sitePower.toFixed(2)} kW</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Energy Today</div>
                      <div className="font-semibold font-mono text-emerald-600 dark:text-emerald-400">{siteTodayYield.toFixed(1)} kWh</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Estimated Savings</div>
                      <div className="font-semibold font-mono">
                        {siteSavings ? siteSavings.formatted : "Not configured"}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t flex items-center justify-between text-[11px] text-muted-foreground">
                    <div>
                      Last Cleaned: <span className="font-medium text-foreground">{s.last_cleaned_on ? formatDate(s.last_cleaned_on) : "Never recorded"}</span>
                    </div>
                    <div>
                      Next Planned: <span className="font-medium text-emerald-600 dark:text-emerald-400">{nextCleaningStr ? formatDate(nextCleaningStr) : "—"}</span>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Link href={`/client/sites/${s.id}`}>
                      <Button variant="outline" size="sm" className="text-xs gap-1 h-7">
                        View Site Details <ArrowUpRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
