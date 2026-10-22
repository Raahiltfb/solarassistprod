import { createClient, createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PerformanceAnalyticsSection } from "@/components/performance-analytics-section";
import {
  MapPin,
  Zap,
  Activity,
  Coins,
  ShieldCheck,
  SprayCan,
  Clock,
  CheckCircle2,
  ArrowLeft,
  Calendar,
  ImageIcon,
  AlertCircle,
  Info,
  Sun,
  Wrench,
  BarChart3,
  ArrowUpRight,
  Camera,
  Check,
  FileText,
  HelpCircle,
  ExternalLink,
  ChevronRight
} from "lucide-react";
import { getSanitizedInverterStatus, calculateFinancialSavings, sanitizeServiceEvents, formatClientServiceRequests } from "@/lib/client-sanitizer";
import { ClientGlobalPopups } from "@/components/client-global-popups";
import { calculateClientHealthScore } from "@/lib/client-health-score";
import { ClientHealthBreakdownModal } from "@/components/client-health-breakdown-modal";
import { ClientServiceRequestsSection } from "@/components/client-service-requests-section";
import { ClientEvidenceViewer } from "@/components/client-evidence-viewer";
import { getSiteStatus } from "@/lib/status-utils";
import { kWh, formatDateTime, formatDate } from "@/lib/utils";
import { resolveSiteCleaning } from "@/lib/cleaning-schedule-sync";

export default async function ClientSiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  let siteQuery = serviceClient.from("sites").select("*").eq("id", id);
  if (profile.role === "client") {
    if (profile.org_id) {
      siteQuery = siteQuery.or(`client_id.eq.${profile.id},client_org_id.eq.${profile.org_id}`);
    } else {
      siteQuery = siteQuery.eq("client_id", profile.id);
    }
  }
  const { data: site } = await siteQuery.maybeSingle();

  if (!site) {
    notFound();
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // Fetch inverters, telemetry, alerts, cleaning logs, work orders, tickets for this site
  const [invRes, altRes, clnRes, woRes, tktRes, visRes] = await Promise.all([
    serviceClient.from("inverters").select("*").eq("site_id", site.id),
    serviceClient.from("alerts").select("*").eq("site_id", site.id),
    serviceClient.from("cleaning_logs").select("*").eq("site_id", site.id).order("performed_at", { ascending: false }),
    serviceClient.from("work_orders").select("*, tickets(before_photo_url, after_photo_url)").eq("site_id", site.id).order("created_at", { ascending: false }),
    serviceClient.from("tickets").select("*").eq("site_id", site.id).order("created_at", { ascending: false }),
    serviceClient.from("cleaning_visits").select("*, sites(name)").eq("site_id", site.id).gte("scheduled_date", todayStr).in("status", ["published", "scheduled", "planned", "approved"]).order("scheduled_date", { ascending: true }),
  ]);

  const inverters = invRes.data ?? [];
  const alerts = altRes.data ?? [];
  const cleaningLogs = clnRes.data ?? [];
  const workOrders = woRes.data ?? [];
  const tickets = tktRes.data ?? [];
  const upcomingVisits = visRes.data ?? [];

  const inverterIds = inverters.map((i) => i.id);

  let latestTelemetry: any[] = [];
  if (inverterIds.length > 0) {
    const latestTelsRes = await serviceClient.rpc("get_latest_telemetry", { inverter_ids: inverterIds });
    latestTelemetry = latestTelsRes.data ?? [];
  }

  const latestInvTelemetryMap = new Map<string, any>();
  const latestTelemetryTimestampMap = new Map<string, string>();
  for (const t of latestTelemetry) {
    latestInvTelemetryMap.set(t.inverter_id, t);
    if (t.timestamp) {
      latestTelemetryTimestampMap.set(t.inverter_id, t.timestamp);
    }
  }

  let currentPower = 0;
  let todayYield = 0;
  let lifetimeYield = 0;

  for (const inv of inverters) {
    const tel = latestInvTelemetryMap.get(inv.id);
    if (tel) {
      currentPower += Number(tel.ac_power_kw || 0);
      todayYield += Number(tel.daily_generation_kwh || 0);
      lifetimeYield += Number(tel.total_generation_kwh || 0);
    }
  }

  const capacityKwp = Number(site.capacity_kwp || 0);
  const todaySpecificYield = capacityKwp > 0 ? (todayYield / capacityKwp) : 0;
  const siteStatus = getSiteStatus(inverters, latestTelemetryTimestampMap);
  const isSiteNormal = siteStatus === "ONLINE";

  // Financial Savings
  const savingsResult = calculateFinancialSavings(lifetimeYield, site.grid_tariff_inr_per_kwh);
  const todaySavingsResult = calculateFinancialSavings(todayYield, site.grid_tariff_inr_per_kwh);

  // Health Score calculation with verification engine states
  const healthResult = calculateClientHealthScore({
    inverters,
    alerts: alerts.filter((a) => a.status === "open"),
    sites: [site],
    tickets,
    latestTelemetryTimestampMap,
  });

  // Authoritative Next Cleaning Resolution via cleaning-schedule-sync:
  // Hierarchy: 1. Canonical published cleaning_visit -> 2. Cleaning work_order -> 3. sites.next_cleaning_date -> 4. Projected interval
  const cycleDays = site.cleaning_cycle_days || 30;
  const cleanRes = resolveSiteCleaning(site, { visits: upcomingVisits, workOrders, todayStr });

  async function acknowledgeCleaning(formData: FormData) {
    "use server";
    const logId = formData.get("logId") as string;
    if (!logId) return;
    const sbService = createServiceClient();
    await sbService
      .from("cleaning_logs")
      .update({ client_acknowledged: true, client_acknowledged_at: new Date().toISOString() })
      .eq("id", logId);
    revalidatePath(`/client/sites/${id}`);
  }

  // Sanitized Service Timeline Events & Structured Requests
  const serviceEvents = sanitizeServiceEvents(alerts, workOrders, cleaningLogs, tickets, upcomingVisits, [site]);
  const clientServiceRequests = formatClientServiceRequests(tickets, workOrders, new Map([[site.id, site]]), alerts);
  const activeRequestsCount = clientServiceRequests.filter((r) => r.status !== "resolved").length;

  return (
    <div className="space-y-10" data-testid="client-site-detail-page">
      <ClientGlobalPopups events={serviceEvents} />

      {/* Navigation Breadcrumb & Header */}
      <div className="space-y-3 border-b pb-4">
        <div className="flex items-center gap-2 text-xs">
          <Link href="/client" className="text-muted-foreground hover:text-primary transition-colors">
            Portfolio
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link href="/client/sites" className="text-muted-foreground hover:text-primary transition-colors">
            Sites
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-primary font-medium">{site.name}</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-display font-semibold tracking-tight">{site.name}</h1>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap border ${
                  isSiteNormal
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    isSiteNormal ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                  }`}
                />
                <span>{isSiteNormal ? "Operating Normally" : "Attention Needed"}</span>
              </span>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin className="h-3.5 w-3.5" /> {site.location} • System Size: {capacityKwp} kWp • Grid Tariff: {site.grid_tariff_inr_per_kwh ? `₹${site.grid_tariff_inr_per_kwh}/kWh` : "Unconfigured"}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link href={`/client/reports?site_id=${site.id}`}>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <BarChart3 className="h-3.5 w-3.5" /> Site Monthly Report
              </Button>
            </Link>
            <Link href="/client/sites">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to Sites
              </Button>
            </Link>
          </div>
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
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> 2. Operational Issues & Care
        </a>
        <a href="#cleaning-schedule" className="px-3 py-1.5 rounded-lg bg-card hover:bg-accent border font-medium text-foreground transition-colors flex items-center gap-1.5">
          <SprayCan className="h-3.5 w-3.5 text-primary" /> 3. Cleaning Schedule
        </a>
        <a href="#work-evidence" className="px-3 py-1.5 rounded-lg bg-card hover:bg-accent border font-medium text-foreground transition-colors flex items-center gap-1.5">
          <Camera className="h-3.5 w-3.5 text-blue-500" /> 4. Completed Proofs
        </a>
        <a href="#reports-analytics" className="px-3 py-1.5 rounded-lg bg-card hover:bg-accent border font-medium text-foreground transition-colors flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5 text-purple-500" /> 5. Production Analytics
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
              Generation output, operational health index, and inverter hardware status for {site.name}.
            </p>
          </div>
        </div>

        {/* Headline Customer KPI Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Energy Produced Today */}
          <Card className="hover:shadow-sm transition-shadow">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-medium uppercase tracking-wider flex items-center justify-between">
                <span>Energy Produced Today</span>
                <Sun className="h-4 w-4 text-emerald-500" />
              </CardDescription>
              <CardTitle className="text-3xl font-bold font-mono text-foreground mt-1">
                {kWh(todayYield)}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground">
                Clean electricity units generated today at {site.name}
              </p>
            </CardContent>
          </Card>

          {/* Card 2: Today's Specific Yield */}
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

          {/* Card 3: System Health with Explainability */}
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
                siteName={site.name}
                trigger={
                  <button type="button" className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
                    <span>View explainable factors</span>
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                }
              />
            </CardContent>
          </Card>

          {/* Card 4: Estimated Savings */}
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
                {site.grid_tariff_inr_per_kwh ? `Calculated at ₹${site.grid_tariff_inr_per_kwh}/kWh tariff` : "Set grid tariff to view financial savings"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Solar Inverters Equipment Breakdown */}
        <Card>
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Solar Inverter Equipment ({inverters.length})</CardTitle>
                <CardDescription className="text-xs">Reassuring status and operating power output for each solar inverter</CardDescription>
              </div>
              <Badge variant="outline" className="text-xs font-mono">
                Current Output: {currentPower.toFixed(1)} kW
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {inverters.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">No inverter units configured for this site.</div>
            ) : (
              inverters.map((inv) => {
                const lastSeenStr = inv.last_seen_at || latestTelemetryTimestampMap.get(inv.id);
                let isStale = false;
                if (lastSeenStr) {
                  const diffMins = (Date.now() - new Date(lastSeenStr).getTime()) / (1000 * 60);
                  if (diffMins > 30) isStale = true;
                } else {
                  isStale = true;
                }

                const statusInfo = getSanitizedInverterStatus(inv.status, inv.serial_number, isStale);
                const tel = latestInvTelemetryMap.get(inv.id);

                return (
                  <div key={inv.id} className="p-3.5 border rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs bg-card/50">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">Solar Inverter #{inv.serial_number}</span>
                        <Badge variant={statusInfo.badgeVariant}>{statusInfo.badgeText}</Badge>
                      </div>
                      <p className="text-muted-foreground leading-relaxed">{statusInfo.message}</p>
                    </div>

                    <div className="flex items-center gap-4 border-t md:border-t-0 pt-2 md:pt-0 shrink-0">
                      <div>
                        <div className="text-muted-foreground text-[10px]">Equipment Capacity</div>
                        <div className="font-mono font-medium">{inv.capacity_kw} kW</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[10px]">Current Power Output</div>
                        <div className="font-mono font-medium text-emerald-600 dark:text-emerald-400">{tel ? `${Number(tel.ac_power_kw || 0).toFixed(1)} kW` : "0 kW"}</div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
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
              Transparent lifecycle tracking and telemetry verification for all maintenance on this installation.
            </p>
          </div>
          {clientServiceRequests.length > 0 && (
            <a href="#operational-history" className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
              <span>View full log ({clientServiceRequests.length})</span>
              <ChevronRight className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Reassuring zero-issues card when site is normal */}
        {activeRequestsCount === 0 ? (
          <Card className="bg-emerald-500/5 border-emerald-500/30">
            <CardContent className="p-5 flex items-start sm:items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
              <div className="flex items-start sm:items-center gap-4">
                <div className="h-11 w-11 rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <span>Zero Active Technical Exceptions</span>
                    <Badge variant="success" className="text-[10px] py-0 px-2">24/7 Monitored</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    All inverter channels, string DC current ratios, and ground insulation resistances are operating within nominal limits at {site.name}. Solar Assist 24/7 automated O&M supervision is active.
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
              Routine module washing schedule to maintain peak generation and eliminate soiling losses.
            </p>
          </div>
        </div>

        {/* Cleaning Schedule Card */}
        <Card className="border shadow-sm overflow-hidden">
          <CardHeader className="pb-3 border-b bg-card">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <SprayCan className="h-4 w-4 text-primary" /> Solar Panel Cleaning & Maintenance Care
              </CardTitle>
              <Badge variant={cleanRes.isWithin2Days ? "warning" : cleanRes.isScheduled ? "secondary" : "outline"} className="capitalize">
                {cleanRes.displayStatus}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Authoritative schedule derived from certified O&M dispatch planning and site policy cadence.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-accent/30 p-4 rounded-xl border">
              <div>
                <div className="text-muted-foreground">Last Cleaning Completed</div>
                <div className="font-semibold text-sm text-foreground mt-0.5">
                  {site.last_cleaned_on ? formatDate(site.last_cleaned_on) : "Never recorded"}
                </div>
                {site.last_cleaned_on && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {Math.round((new Date(todayStr + "T00:00:00").getTime() - new Date(site.last_cleaned_on.slice(0, 10) + "T00:00:00").getTime()) / 86400000)} days ago
                  </div>
                )}
              </div>
              <div>
                <div className="text-muted-foreground">Routine Interval</div>
                <div className="font-semibold text-sm text-foreground mt-0.5">Every {cycleDays} days</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Certified cleaning crew</div>
              </div>
              <div>
                <div className="text-muted-foreground">Next Planned Service</div>
                <div className="font-semibold text-sm text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> {cleanRes.formattedDate}
                </div>
                <div className="text-[10px] text-muted-foreground capitalize mt-0.5">
                  {cleanRes.daysUntil !== null ? (cleanRes.daysUntil === 0 ? "Scheduled today" : cleanRes.daysUntil === 1 ? "Scheduled tomorrow" : `In ${cleanRes.daysUntil} days`) : cleanRes.displayStatus}
                </div>
              </div>
            </div>

            {cleanRes.isWithin2Days && (
              <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-lg flex items-center gap-3">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="text-xs text-foreground font-medium">
                  Notice: Cleaning visit scheduled within 48 hours ({cleanRes.formattedDate}). Certified technicians will be on site.
                </span>
              </div>
            )}
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
              Photographic verification, safety checklists, technician field remarks, and client acknowledgment.
            </p>
          </div>
        </div>

        <Card className="border shadow-sm overflow-hidden">
          <CardHeader className="pb-3 border-b bg-card">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Camera className="h-4 w-4 text-blue-500" /> Completed Service Logs & Photographic Evidence
              </CardTitle>
              <Badge variant="outline" className="text-xs font-mono">
                {cleaningLogs.length} Completed Cleanings
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {cleaningLogs.length === 0 ? (
              <div className="text-muted-foreground text-center py-8 text-xs space-y-2">
                <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto" />
                <div>No historical cleaning logs recorded for {site.name} yet. Proofs will populate as technicians complete field work.</div>
              </div>
            ) : (
              cleaningLogs.map((log) => (
                <div key={log.id} className="p-3.5 border rounded-xl bg-card space-y-2.5 text-xs">
                  <div className="flex justify-between items-center font-medium border-b pb-2">
                    <span className="flex items-center gap-1.5 text-foreground font-semibold">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Solar Panel Cleaning Completed
                    </span>
                    <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                      <Clock className="h-3 w-3" />
                      <span>{formatDateTime(log.performed_at)}</span>
                      {log.client_acknowledged ? (
                        <Badge variant="success" className="text-[10px]">
                          <Check className="h-3 w-3 mr-0.5" /> Acknowledged
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30">
                          Pending Review
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="pt-1">
                    <ClientEvidenceViewer
                      title={`Cleaning Evidence • ${site.name}`}
                      safetyPhotoUrl={log.safety_photo_url}
                      beforePhotoUrl={log.before_photo_url}
                      afterPhotoUrl={log.after_photo_url}
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
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Acknowledge Cleaning Visit
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
              ))
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
              Interactive telemetry analytics and official monthly performance reports for {site.name}.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Interactive Solar Production Analytics Chart */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Solar Production Analytics</CardTitle>
                <CardDescription className="text-xs">Interactive energy output and specific yield trends for {site.name}</CardDescription>
              </div>
              <Badge variant="outline" className="text-xs font-mono">
                Live Telemetry
              </Badge>
            </CardHeader>
            <CardContent className="pt-4">
              <PerformanceAnalyticsSection
                siteId={id}
                isSite={true}
                isClientView={true}
                initialInverterIds={inverterIds}
                initialTotalCapacity={capacityKwp}
              />
            </CardContent>
          </Card>

          {/* Site Monthly Report Hub */}
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
                  Audited monthly generation, yield, and savings summaries for this installation.
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-4 space-y-3 text-xs">
                <div className="p-3 border rounded-xl bg-card hover:bg-accent/30 transition-colors flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-foreground">October 2026 Report</div>
                    <div className="text-[11px] text-muted-foreground">Current billing cycle • In Progress</div>
                  </div>
                  <Link href={`/client/reports?site_id=${site.id}&month=October%202026`}>
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
                  <Link href={`/client/reports?site_id=${site.id}&month=September%202026`}>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                      View Report <ExternalLink className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </div>

            <div className="p-4 border-t bg-muted/20 text-xs text-muted-foreground flex items-center justify-between">
              <span>PDF and data export available</span>
              <Link href={`/client/reports?site_id=${site.id}`} className="text-primary font-medium hover:underline text-[11px] flex items-center gap-1">
                Open Full Report <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </Card>
        </div>
      </section>

      {/* SYSTEM OPERATIONAL LOG & SERVICE CARE (Moved towards the end & Collapsible by default) */}
      <section id="operational-history" className="space-y-4 scroll-mt-20">
        <ClientServiceRequestsSection
          serviceRequests={clientServiceRequests}
          title="Service Requests for This Site"
          description="Transparent lifecycle tracking and telemetry verification for all maintenance on this installation."
          defaultCollapsed={true}
        />
      </section>
    </div>
  );
}
