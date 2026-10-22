import { createClient, createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
  Check,
  Clock,
  FileText,
  Camera,
  ChevronRight,
  HelpCircle,
  ExternalLink
} from "lucide-react";
import { calculateClientHealthScore } from "@/lib/client-health-score";
import { calculateFinancialSavings, sanitizeServiceEvents, formatClientServiceRequests } from "@/lib/client-sanitizer";
import { ClientGlobalPopups } from "@/components/client-global-popups";
import { ClientHealthBreakdownModal } from "@/components/client-health-breakdown-modal";
import { ClientServiceRequestsSection } from "@/components/client-service-requests-section";
import { ClientEvidenceViewer } from "@/components/client-evidence-viewer";
import { getSiteStatus } from "@/lib/status-utils";
import { kWh, formatDateTime, formatDate } from "@/lib/utils";
import { resolveSiteCleaning } from "@/lib/cleaning-schedule-sync";

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
  let rawVisits: any[] = [];

  const todayStr = new Date().toISOString().slice(0, 10);

  if (siteIds.length > 0) {
    const [invRes, altRes, clnRes, woRes, tktRes, visRes] = await Promise.all([
      serviceClient.from("inverters").select("*").in("site_id", siteIds),
      serviceClient.from("alerts").select("*").in("site_id", siteIds),
      serviceClient.from("cleaning_logs").select("*, sites(name)").in("site_id", siteIds).order("performed_at", { ascending: false }).limit(25),
      serviceClient.from("work_orders").select("*, tickets(before_photo_url, after_photo_url)").in("site_id", siteIds).order("created_at", { ascending: false }).limit(25),
      serviceClient.from("tickets").select("*").in("site_id", siteIds).order("created_at", { ascending: false }).limit(25),
      serviceClient.from("cleaning_visits").select("*, sites(name)").in("site_id", siteIds).gte("scheduled_date", todayStr).in("status", ["published", "scheduled", "planned", "approved"]).order("scheduled_date", { ascending: true }),
    ]);

    inverters = invRes.data ?? [];
    alerts = altRes.data ?? [];
    cleaningLogs = clnRes.data ?? [];
    workOrders = woRes.data ?? [];
    tickets = tktRes.data ?? [];
    rawVisits = visRes.data ?? [];
  }

  // Authoritative cleaning resolution per site using resolveSiteCleaning:
  // Hierarchy: 1. Published cleaning_visit -> 2. Cleaning work_order -> 3. sites.next_cleaning_date -> 4. Projected interval
  const siteCleanings = sites.map((s) => ({
    site: s,
    resolution: resolveSiteCleaning(s, {
      visits: rawVisits,
      workOrders,
      todayStr,
    }),
  }));

  // Build upcoming visits list for notifications & schedule display
  const upcomingVisits = rawVisits.map((v) => ({
    id: v.id,
    site_id: v.site_id,
    scheduled_date: v.scheduled_date,
    status: v.status || "scheduled",
    sites: v.sites || (sitesMap.get(v.site_id) ? { name: sitesMap.get(v.site_id)!.name } : { name: "Solar Site" }),
    source: "cleaning_visit",
    acknowledged_at: v.acknowledged_at,
  }));

  // Also include fallback scheduled cleanings for sites without a published cleaning_visit
  const visitSiteIds = new Set(upcomingVisits.map((v) => v.site_id));
  for (const sc of siteCleanings) {
    if (sc.resolution.isScheduled && !visitSiteIds.has(sc.site.id) && sc.resolution.scheduledDate) {
      upcomingVisits.push({
        id: sc.resolution.workOrderId || `site-clean-${sc.site.id}`,
        site_id: sc.site.id,
        scheduled_date: sc.resolution.scheduledDate,
        status: sc.resolution.status || "scheduled",
        sites: { name: sc.site.name },
        source: sc.resolution.workOrderId ? "work_order" : "site",
        acknowledged_at: sc.resolution.isAcknowledged ? new Date().toISOString() : null,
      });
      visitSiteIds.add(sc.site.id);
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
  const totalCapacityKwp = sites.reduce((sum, s) => sum + Number(s.capacity_kwp || 0), 0);

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

  // Sanitized Service Timeline Events & Popups
  const serviceEvents = sanitizeServiceEvents(alerts, workOrders, cleaningLogs, tickets, upcomingVisits, sites);
  // Structured Client Operational Log & Service Requests
  const clientServiceRequests = formatClientServiceRequests(tickets, workOrders, sitesMap, alerts);
  const activeRequestsCount = clientServiceRequests.filter((r) => r.status !== "resolved").length;

  const portfolioName = customerOrg?.name || profile.organization || "Solar Portfolio";
  const allSystemsHealthy = attentionSitesCount === 0;

  // Server action for acknowledging completed cleaning logs directly from client portal
  async function acknowledgeCleaning(formData: FormData) {
    "use server";
    const logId = formData.get("logId") as string;
    if (!logId) return;
    const sbService = createServiceClient();
    await sbService
      .from("cleaning_logs")
      .update({ client_acknowledged: true, client_acknowledged_at: new Date().toISOString() })
      .eq("id", logId);
    revalidatePath("/client");
  }

  return (
    <div className="space-y-10" data-testid="client-portfolio-page">
      <ClientGlobalPopups events={serviceEvents} />

      {/* Portfolio Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
              Customer Portal
            </span>
            <span className="text-xs text-muted-foreground">• Portfolio Executive Hub</span>
          </div>
          <h1 className="text-3xl font-display font-semibold tracking-tight mt-1">
            {portfolioName}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-3xl">
            24/7 automated telemetry supervision, preventive module care, and verified field operations for your solar installations.
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

      {/* Customer Question Navigation / Quick Links Bar */}
      <div className="flex flex-wrap items-center gap-2 p-2 bg-muted/30 rounded-xl border text-xs">
        <span className="font-semibold text-muted-foreground px-2 flex items-center gap-1.5 shrink-0">
          <HelpCircle className="h-3.5 w-3.5 text-primary" /> Key Questions:
        </span>
        <a href="#performance" className="px-3 py-1.5 rounded-lg bg-card hover:bg-accent border font-medium text-foreground transition-colors flex items-center gap-1.5">
          <Sun className="h-3.5 w-3.5 text-amber-500" /> 1. Plant Performance
        </a>
        <a href="#active-care" className="px-3 py-1.5 rounded-lg bg-card hover:bg-accent border font-medium text-foreground transition-colors flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> 2. System Issues & Care
        </a>
        <a href="#cleaning-schedule" className="px-3 py-1.5 rounded-lg bg-card hover:bg-accent border font-medium text-foreground transition-colors flex items-center gap-1.5">
          <SprayCan className="h-3.5 w-3.5 text-primary" /> 3. Cleaning Schedule
        </a>
        <a href="#work-evidence" className="px-3 py-1.5 rounded-lg bg-card hover:bg-accent border font-medium text-foreground transition-colors flex items-center gap-1.5">
          <Camera className="h-3.5 w-3.5 text-blue-500" /> 4. Field Work & Evidence
        </a>
        <a href="#reports-analytics" className="px-3 py-1.5 rounded-lg bg-card hover:bg-accent border font-medium text-foreground transition-colors flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5 text-purple-500" /> 5. Reports & Analytics
        </a>
        <a href="#operational-history" className="px-3 py-1.5 rounded-lg bg-card hover:bg-accent border font-medium text-foreground transition-colors flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Operational Log
        </a>
      </div>

      {/* QUESTION 1: Is my solar plant performing properly? */}
      <section id="performance" className="space-y-4 scroll-mt-20">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                Question 1
              </Badge>
              <h2 className="text-xl font-bold tracking-tight">Is my solar plant performing properly?</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live power generation output, verified operating status, and portfolio health score.
            </p>
          </div>
        </div>

        {/* 10-Second Executive Status Banner */}
        <Card className={`overflow-hidden border shadow-sm ${allSystemsHealthy
          ? "bg-gradient-to-r from-emerald-500/10 via-card to-card border-emerald-500/30"
          : "bg-gradient-to-r from-amber-500/10 via-card to-card border-amber-500/30"
          }`}>
          <CardContent className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className={`flex items-center justify-center h-14 w-14 rounded-2xl shrink-0 ${allSystemsHealthy
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
                    <h3 className="text-xl font-bold tracking-tight text-foreground">
                      {allSystemsHealthy
                        ? "All Solar Systems Operating Normally"
                        : `${attentionSitesCount} ${attentionSitesCount === 1 ? 'Site Needs' : 'Sites Need'} Attention`}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap border ${
                        allSystemsHealthy
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${allSystemsHealthy ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                      <span>{allSystemsHealthy ? "Operating Smoothly" : "Solar Assist Managing"}</span>
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground max-w-2xl">
                    {allSystemsHealthy ? (
                      `All ${sites.length} solar installations are actively generating clean electricity. Solar Assist 24/7 automated O&M supervision is active with zero open faults.`
                    ) : (
                      `Solar Assist is actively managing operational items at ${sitesNeedingAttention.join(", ")}. Certified technicians and automated telemetry verification are supervising recovery.`
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
                  <div className="text-xs text-muted-foreground">Current Generation</div>
                  <div className="text-lg font-bold font-mono text-foreground">{currentPowerKw.toFixed(1)} kW</div>
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

        {/* 4 Headline Customer Metric Cards */}
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
              <p className="text-xs text-muted-foreground leading-normal">
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

        {/* Individual Solar Sites Operational Status Grid */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" /> Solar Installations Overview ({sites.length})
            </h3>
            <Link href="/client/sites" className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
              View all sites <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
              const cleanMatch = siteCleanings.find((sc) => sc.site.id === s.id);
              const cleanRes = cleanMatch ? cleanMatch.resolution : resolveSiteCleaning(s, { visits: rawVisits, workOrders, todayStr });

              return (
                <Card key={s.id} className="overflow-hidden hover:shadow-md transition-all border border-border/70 hover:border-border flex flex-col justify-between bg-card">
                  <div>
                    <CardHeader className="pb-3 border-b space-y-2 bg-muted/15">
                      <div className="flex items-start justify-between gap-2.5">
                        <Link href={`/client/sites/${s.id}`} className="hover:underline flex-1 min-w-0">
                          <CardTitle className="text-base font-semibold text-foreground leading-snug break-words">
                            {s.name}
                          </CardTitle>
                        </Link>

                        <div className="shrink-0">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap border ${
                              isSiteNormal
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25"
                                : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                isSiteNormal ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                              }`}
                            />
                            <span>{isSiteNormal ? "Operating Normally" : "Attention Needed"}</span>
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground flex items-start gap-1 leading-normal break-words">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80 mt-0.5" />
                        <span className="break-words">{s.location}</span>
                      </p>
                    </CardHeader>

                    <CardContent className="pt-3.5 pb-2 text-xs space-y-3">
                      <div className="grid grid-cols-2 gap-3 bg-muted/25 p-3 rounded-xl border border-border/50">
                        <div>
                          <div className="text-[11px] text-muted-foreground font-medium">System Size</div>
                          <div className="font-semibold font-mono text-sm text-foreground mt-0.5">{s.capacity_kwp} kWp</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground font-medium">Current Output</div>
                          <div className="font-semibold font-mono text-sm text-foreground mt-0.5">{sitePower.toFixed(2)} kW</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground font-medium">Energy Today</div>
                          <div className="font-semibold font-mono text-sm text-emerald-600 dark:text-emerald-400 mt-0.5">{siteTodayYield.toFixed(1)} kWh</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground font-medium">Estimated Savings</div>
                          <div className="font-semibold font-mono text-sm text-foreground mt-0.5">
                            {siteSavings ? siteSavings.formatted : "Not configured"}
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                        <div>
                          Last Cleaned: <span className="font-medium text-foreground">{s.last_cleaned_on ? formatDate(s.last_cleaned_on) : "—"}</span>
                        </div>
                        <div>
                          Next Planned: <span className="font-medium text-emerald-600 dark:text-emerald-400">{cleanRes.formattedDate}</span>
                        </div>
                      </div>
                    </CardContent>
                  </div>

                  <CardContent className="pt-0 pb-3">
                    <div className="pt-2 flex justify-end">
                      <Link href={`/client/sites/${s.id}`}>
                        <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8 font-medium hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-colors">
                          <span>View Site Details</span>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* QUESTION 2: Is anything wrong, and what is being done about it? */}
      <section id="active-care" className="space-y-4 scroll-mt-20">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                Question 2
              </Badge>
              <h2 className="text-xl font-bold tracking-tight">Is anything wrong, and what is being done about it?</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Transparent 24/7 supervision from automated fault detection to field intervention and telemetry verification.
            </p>
          </div>
          {clientServiceRequests.length > 0 && (
            <a href="#operational-history" className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
              <span>View full log ({clientServiceRequests.length})</span>
              <ChevronRight className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Reassuring zero-issues card when all is nominal */}
        {activeRequestsCount === 0 ? (
          <Card className="bg-emerald-500/5 border-emerald-500/30">
            <CardContent className="p-5 flex items-start sm:items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
              <div className="flex items-start sm:items-center gap-4">
                <div className="h-11 w-11 rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <span>Zero Open Operational Exceptions</span>
                    <Badge variant="success" className="text-[10px] py-0 px-2">24/7 Monitored</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    All solar installations are operating at nominal electrical parameters. Solar Assist automated telemetry monitoring is supervising all inverter channels, ground insulation, and string currents. No manual intervention required.
                  </p>
                </div>
              </div>
              <a href="#operational-history" className="shrink-0">
                <Button variant="outline" size="sm" className="text-xs h-7 gap-1">
                  View Past Care Logs ({clientServiceRequests.length})
                </Button>
              </a>
            </CardContent>
          </Card>
        ) : (
          /* Active issue present: show ONLY the single active issue card directly */
          <div className="space-y-2">
            <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{activeRequestsCount} Active Item(s) Under Solar Assist Supervision</span>
            </div>
            {(() => {
              const activeReq = clientServiceRequests.find((r) => r.status !== "resolved") || clientServiceRequests[0];
              const steps = [
                { label: "1. Detected", desc: "Monitored 24/7" },
                { label: "2. Dispatched", desc: "Engineer Assigned" },
                { label: "3. On Site", desc: "Physical Work" },
                { label: "4. Verifying", desc: "Telemetry Check" },
                { label: "5. Resolved", desc: "Verified Safe" },
              ];
              const statusOrder: Record<string, number> = {
                reported: 0,
                dispatched: 1,
                on_site: 2,
                verifying: 3,
                resolved: 4,
                follow_up: 2,
              };
              const currentOrder = statusOrder[activeReq.status] ?? 0;

              return (
                <Card className="border shadow-sm p-4 space-y-3.5 bg-card border-amber-500/30">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-foreground bg-muted px-2 py-0.5 rounded border">
                        {activeReq.ticketNumber}
                      </span>
                      <span className="text-xs font-semibold text-foreground">{activeReq.siteName}</span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold">
                        {activeReq.macroCategory}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {formatDateTime(activeReq.updatedAt)}
                      </span>
                      <Badge variant={activeReq.statusBadgeVariant} className="text-xs capitalize">
                        {activeReq.statusLabel}
                      </Badge>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                      <Activity className="h-4 w-4 text-primary shrink-0" />
                      {activeReq.title}
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-0.5">
                    <div className="bg-muted/40 p-3 rounded-lg border border-border/60 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        <span>What is going on</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {activeReq.whatIsGoingOn || activeReq.explanation}
                      </p>
                    </div>

                    <div className="bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/20 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                        <span>What Solar Assist is doing</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {activeReq.whatSaIsDoing || "Solar Assist automated telemetry engine and 24/7 O&M team are supervising resolution and verifying power generation."}
                      </p>
                    </div>
                  </div>

                  <div className="pt-1">
                    <div className="grid grid-cols-5 gap-1 text-center">
                      {steps.map((st, sIdx) => {
                        const isCompleted = activeReq.status === "resolved" || currentOrder > sIdx;
                        const isCurrent = activeReq.status !== "resolved" && currentOrder === sIdx;

                        return (
                          <div key={sIdx} className="space-y-1">
                            <div
                              className={`h-1.5 rounded-full transition-all ${isCompleted
                                ? "bg-emerald-500"
                                : isCurrent
                                  ? "bg-primary animate-pulse"
                                  : "bg-muted"
                                }`}
                            />
                            <div
                              className={`text-[10px] font-medium leading-tight ${isCompleted
                                ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                                : isCurrent
                                  ? "text-primary font-bold"
                                  : "text-muted-foreground"
                                }`}
                            >
                              {st.label}
                            </div>
                            <div className="text-[9px] text-muted-foreground hidden sm:block">
                              {st.desc}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-2 flex justify-between items-center border-t text-xs text-muted-foreground">
                    <span>Certified technicians and automated verification active</span>
                    <a href="#operational-history" className="text-primary font-medium hover:underline flex items-center gap-1">
                      View full history in Operational Log ↓
                    </a>
                  </div>
                </Card>
              );
            })()}
          </div>
        )}
      </section>

      {/* QUESTION 3: When is the next cleaning, and when was the last one completed? */}
      <section id="cleaning-schedule" className="space-y-4 scroll-mt-20">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                Question 3
              </Badge>
              <h2 className="text-xl font-bold tracking-tight">When is the next cleaning, and when was the last one completed?</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Scheduled solar module washing to prevent soiling degradation and maintain peak yield.
            </p>
          </div>
        </div>

        {/* Comprehensive Cleaning Schedule Matrix */}
        <Card className="border shadow-sm overflow-hidden">
          <CardHeader className="pb-3 border-b bg-card">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <SprayCan className="h-4 w-4 text-primary" /> Fleet Cleaning & Routine Maintenance Care
                </CardTitle>
                <CardDescription className="text-xs">
                  Authoritative schedule derived from monthly O&M planning, active work orders, and site routine cadences.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs font-mono">
                {upcomingVisits.length} Upcoming Scheduled
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground">
                    <th className="py-2.5 px-4 text-left font-medium">Solar Installation</th>
                    <th className="py-2.5 px-4 text-left font-medium">Last Cleaned On</th>
                    <th className="py-2.5 px-4 text-left font-medium">Routine Cadence</th>
                    <th className="py-2.5 px-4 text-left font-medium">Next Planned Service</th>
                    <th className="py-2.5 px-4 text-left font-medium">Schedule Status</th>
                    <th className="py-2.5 px-4 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {siteCleanings.map(({ site: s, resolution: res }) => {
                    const daysAgo = s.last_cleaned_on
                      ? Math.round((new Date(todayStr + "T00:00:00").getTime() - new Date(s.last_cleaned_on.slice(0, 10) + "T00:00:00").getTime()) / 86400000)
                      : null;

                    return (
                      <tr key={s.id} className="hover:bg-muted/10 transition-colors">
                        <td className="py-3 px-4 font-medium text-foreground">
                          <div>{s.name}</div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {s.location}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {s.last_cleaned_on ? (
                            <div>
                              <div className="font-medium text-foreground">{formatDate(s.last_cleaned_on)}</div>
                              <div className="text-[10px] text-muted-foreground">{daysAgo} days ago</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Never recorded</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono">
                          Every {res.cycleDays} days
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>{res.formattedDate}</span>
                          </div>
                          {res.daysUntil !== null && (
                            <div className="text-[10px] text-muted-foreground">
                              {res.daysUntil === 0 ? "Scheduled today" : res.daysUntil === 1 ? "Scheduled tomorrow" : `In ${res.daysUntil} days`}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant={res.isWithin2Days ? "warning" : res.isScheduled ? "secondary" : "outline"}
                            className="capitalize text-[11px]"
                          >
                            {res.displayStatus}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link href={`/client/sites/${s.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                              View Site <ChevronRight className="h-3 w-3" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* QUESTION 4: What work has been performed, and what evidence confirms completion? */}
      <section id="work-evidence" className="space-y-4 scroll-mt-20">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                Question 4
              </Badge>
              <h2 className="text-xl font-bold tracking-tight">What work has been performed, and what evidence confirms completion?</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Photographic verification, safety check logs, and technician field remarks.
            </p>
          </div>
        </div>

        {/* Cleaning Logs & Service Proofs List */}
        <Card className="border shadow-sm overflow-hidden">
          <CardHeader className="pb-3 border-b bg-card">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Camera className="h-4 w-4 text-blue-500" /> Completed Field Service & Photographic Proofs
                </CardTitle>
                <CardDescription className="text-xs">
                  Inspect high-resolution Before & After photos, safety confirmations, and technician sign-offs.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs font-mono">
                {cleaningLogs.length} Recorded Visits
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {cleaningLogs.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-10 space-y-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                <div>No historical cleaning logs recorded yet. Proofs will populate as technicians complete field work.</div>
              </div>
            ) : (
              cleaningLogs.slice(0, 6).map((log) => {
                const siteName = log.sites?.name || (sitesMap.get(log.site_id)?.name) || "Solar Site";

                return (
                  <div key={log.id} className="p-4 border rounded-xl bg-card/60 space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        <div>
                          <span className="font-semibold text-sm text-foreground">{siteName}</span>
                          <span className="text-muted-foreground text-xs ml-2">• Module Washing & Safety Inspection</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{formatDateTime(log.performed_at)}</span>
                        {log.client_acknowledged ? (
                          <Badge variant="success" className="text-[10px]">
                            <Check className="h-3 w-3 mr-1" /> Acknowledged
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30">
                            Pending Review
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Evidence Viewer with Before/After Photos */}
                    <div>
                      <ClientEvidenceViewer
                        title={`Cleaning & Safety Proofs • ${siteName}`}
                        safetyPhotoUrl={log.safety_photo_url}
                        beforePhotoUrl={log.beforePhotoUrl || log.before_photo_url}
                        afterPhotoUrl={log.afterPhotoUrl || log.after_photo_url}
                        damagePhotoUrl={log.damage_photo_url}
                        damageObserved={log.damage_observed}
                        damageType={log.damage_type}
                        remarks={log.remarks}
                      />
                    </div>

                    {/* Acknowledgment action */}
                    {!log.client_acknowledged && (
                      <div className="pt-1 flex items-center justify-between border-t text-[11px] text-muted-foreground">
                        <span>Confirm that cleaning results have been reviewed</span>
                        <form action={acknowledgeCleaning}>
                          <input type="hidden" name="logId" value={log.id} />
                          <Button type="submit" size="sm" variant="outline" className="text-xs h-7 gap-1">
                            <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Acknowledge Service Visit
                          </Button>
                        </form>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </section>

      {/* QUESTION 5: Where can I find reports and historical performance? */}
      <section id="reports-analytics" className="space-y-4 scroll-mt-20">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
                Question 5
              </Badge>
              <h2 className="text-xl font-bold tracking-tight">Where can I find reports and historical performance?</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Interactive solar production analytics and official monthly performance statements.
            </p>
          </div>
        </div>

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

          {/* Monthly Performance Statements Hub */}
          <Card className="flex flex-col justify-between">
            <div>
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-purple-500" /> Monthly Reports
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs">Official Statements</Badge>
                </div>
                <CardDescription className="text-xs">
                  Audited monthly generation, specific yield, and financial savings summaries.
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-4 space-y-3 text-xs">
                <div className="p-3 border rounded-xl bg-card hover:bg-accent/30 transition-colors flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-foreground">October 2026 Report</div>
                    <div className="text-[11px] text-muted-foreground">Current billing cycle • In Progress</div>
                  </div>
                  <Link href="/client/reports?month=October%202026">
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                      View Report <ExternalLink className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>

                <div className="p-3 border rounded-xl bg-card hover:bg-accent/30 transition-colors flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-foreground">September 2026 Report</div>
                    <div className="text-[11px] text-muted-foreground">Audited monthly statement • Finalized</div>
                  </div>
                  <Link href="/client/reports?month=September%202026">
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                      View Report <ExternalLink className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>

                <div className="p-3 border rounded-xl bg-card hover:bg-accent/30 transition-colors flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-foreground">August 2026 Report</div>
                    <div className="text-[11px] text-muted-foreground">Audited monthly statement • Finalized</div>
                  </div>
                  <Link href="/client/reports?month=August%202026">
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                      View Report <ExternalLink className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </div>

            <div className="p-4 border-t bg-muted/20 text-xs text-muted-foreground flex items-center justify-between">
              <span>PDF and spreadsheet data exports available</span>
              <Link href="/client/reports" className="text-primary font-medium hover:underline text-[11px] flex items-center gap-1">
                Open Reports Hub <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </Card>
        </div>
      </section>

      {/* SYSTEM OPERATIONAL LOG & SERVICE CARE (Moved towards the end & Collapsible by default) */}
      <section id="operational-history" className="space-y-4 scroll-mt-20">
        <ClientServiceRequestsSection
          serviceRequests={clientServiceRequests}
          title="System Operational Log & Service Care"
          description="Transparent operational tracking from automated fault detection to field intervention and telemetry recovery verification."
          defaultCollapsed={true}
        />
      </section>
    </div>
  );
}
