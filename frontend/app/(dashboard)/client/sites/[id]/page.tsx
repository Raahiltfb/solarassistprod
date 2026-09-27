import { createClient, createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PerformanceAnalyticsSection } from "@/components/performance-analytics-section";
import { KpiCard } from "@/components/kpi-card";
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
  Image as ImageIcon, 
  AlertCircle,
  Info,
  Sun,
  Wrench
} from "lucide-react";
import { getSanitizedInverterStatus, calculateFinancialSavings, sanitizeServiceEvents } from "@/lib/client-sanitizer";
import { calculateClientHealthScore } from "@/lib/client-health-score";
import { getSiteStatus } from "@/lib/status-utils";
import { kWh, formatDateTime, formatDate } from "@/lib/utils";

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
  if (profile.role === "client" && profile.org_id) {
    siteQuery = siteQuery.eq("client_org_id", profile.org_id);
  }
  const { data: site } = await siteQuery.maybeSingle();

  if (!site) {
    notFound();
  }

  // Fetch inverters, telemetry, alerts, cleaning logs, work orders for this site
  const [invRes, altRes, clnRes, woRes] = await Promise.all([
    serviceClient.from("inverters").select("*").eq("site_id", site.id),
    serviceClient.from("alerts").select("*").eq("site_id", site.id),
    serviceClient.from("cleaning_logs").select("*").eq("site_id", site.id).order("performed_at", { ascending: false }),
    serviceClient.from("work_orders").select("*, tickets(before_photo_url, after_photo_url)").eq("site_id", site.id).order("created_at", { ascending: false }),
  ]);

  const inverters = invRes.data ?? [];
  const alerts = altRes.data ?? [];
  const cleaningLogs = clnRes.data ?? [];
  const workOrders = woRes.data ?? [];

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

  // Health Score calculation
  const healthResult = calculateClientHealthScore({
    inverters,
    alerts: alerts.filter((a) => a.status === "open"),
    sites: [site],
    latestTelemetryTimestampMap,
  });

  // Cleaning Information
  const lastCleanedDate = site.last_cleaned_on ? new Date(site.last_cleaned_on) : null;
  const cycleDays = site.cleaning_cycle_days || 30;
  const nextScheduledCleaningDate = lastCleanedDate 
    ? new Date(lastCleanedDate.getTime() + cycleDays * 86400_000)
    : new Date(Date.now() + 7 * 86400_000);

  // Find any scheduled cleaning work order
  const scheduledCleaningWo = workOrders.find((wo) => wo.type === "cleaning" && wo.status === "scheduled");
  const isCleaningScheduled = !!scheduledCleaningWo;

  async function acknowledgeCleaning(formData: FormData) {
    "use server";
    const logId = formData.get("logId") as string;
    if (!logId) return;
    const sbClient = await createClient();
    await sbClient
      .from("cleaning_logs")
      .update({ client_acknowledged: true, client_acknowledged_at: new Date().toISOString() })
      .eq("id", logId);
    revalidatePath(`/client/sites/${id}`);
  }

  // Sanitized Service Timeline Events
  const serviceEvents = sanitizeServiceEvents(alerts, workOrders, cleaningLogs);

  return (
    <div className="space-y-6" data-testid="client-site-detail-page">
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
              <Badge variant={isSiteNormal ? "success" : "warning"}>
                {isSiteNormal ? "Operating Normally" : "Attention Needed"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin className="h-3.5 w-3.5" /> {site.location} • System Size: {capacityKwp} kWp
            </p>
          </div>

          <Link href="/client/sites">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Sites
            </Button>
          </Link>
        </div>
      </div>

      {/* Scheduled Cleaning Banner */}
      {isCleaningScheduled && scheduledCleaningWo && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-lg flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <SprayCan className="h-4 w-4" />
            </div>
            <div>
              <div className="font-semibold text-sm text-foreground">Scheduled Maintenance</div>
              <p className="text-muted-foreground mt-0.5">
                Cleaning scheduled for {formatDate(scheduledCleaningWo.scheduled_date)}. Our SolarAssist technician team is dispatched to maintain peak performance at {site.name}.
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="shrink-0 font-medium">
            Scheduled
          </Badge>
        </div>
      )}

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
              <span>How much electricity your solar system produced today relative to its size.</span>
            </p>
          </CardContent>
        </Card>

        {/* Card 3: System Health */}
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
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              {healthResult.summary}
            </p>
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

      {/* Solar Inverters Status Section */}
      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base font-semibold">Solar Inverter Equipment ({inverters.length})</CardTitle>
          <CardDescription className="text-xs">Reassuring status and current power output for each solar inverter</CardDescription>
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

      {/* Interactive Solar Production Performance Chart */}
      <Card>
        <CardHeader className="pb-2 border-b flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Solar Production Analytics</CardTitle>
            <CardDescription className="text-xs">Interactive energy output and specific yield trends for {site.name}</CardDescription>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            Interactive
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

      {/* Cleaning Schedule & Service Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cleaning Schedule */}
        <Card>
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <SprayCan className="h-4 w-4 text-primary" /> Solar Panel Cleaning & Service
            </CardTitle>
            <CardDescription className="text-xs">Routine cleaning interval and maintenance history</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4 bg-accent/30 p-3.5 rounded-xl border">
              <div>
                <div className="text-muted-foreground">Routine Interval</div>
                <div className="font-semibold text-sm text-foreground">Every {cycleDays} days</div>
              </div>
              <div>
                <div className="text-muted-foreground">Next Service Date</div>
                <div className="font-semibold text-sm text-emerald-600 dark:text-emerald-400">
                  {formatDate(nextScheduledCleaningDate.toISOString())}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-semibold text-sm">Completed Cleaning Proofs</div>
              {cleaningLogs.length === 0 ? (
                <div className="text-muted-foreground text-center py-6">No historical cleaning logs recorded yet.</div>
              ) : (
                cleaningLogs.map((log) => (
                  <div key={log.id} className="p-3 border rounded-lg space-y-2">
                    <div className="flex justify-between items-center font-medium">
                      <span className="flex items-center gap-1.5 text-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Solar Panel Cleaning Completed
                      </span>
                      <span className="text-muted-foreground">{formatDateTime(log.performed_at)}</span>
                    </div>

                    {/* Before / After Photos */}
                    {(log.before_photo_url || log.after_photo_url) && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {log.before_photo_url && (
                          <div className="space-y-1">
                            <span className="text-[10px] text-muted-foreground">Before Cleaning Inspection</span>
                            <a href={log.before_photo_url} target="_blank" rel="noopener noreferrer">
                              <img src={log.before_photo_url} alt="Before cleaning inspection" className="h-24 w-full object-cover rounded border hover:opacity-90" />
                            </a>
                          </div>
                        )}
                        {log.after_photo_url && (
                          <div className="space-y-1">
                            <span className="text-[10px] text-muted-foreground">After Cleaning Proof</span>
                            <a href={log.after_photo_url} target="_blank" rel="noopener noreferrer">
                              <img src={log.after_photo_url} alt="After cleaning proof" className="h-24 w-full object-cover rounded border hover:opacity-90" />
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Service & Maintenance Activity */}
        <Card>
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" /> Service & Maintenance Care
            </CardTitle>
            <CardDescription className="text-xs">Reassuring O&M support timeline</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4 text-xs">
            {serviceEvents.length === 0 ? (
              <div className="text-muted-foreground text-center py-10">No items recorded. System operating smoothly.</div>
            ) : (
              serviceEvents.map((evt) => (
                <div key={evt.id} className="flex gap-3 items-start border-b pb-3 last:border-0 last:pb-0">
                  <div className="h-7 w-7 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                    {evt.type === "technician_visit" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : evt.type === "auto_resolved" ? (
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Activity className="h-3.5 w-3.5 text-amber-500" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between font-medium">
                      <span className="text-foreground">{evt.title}</span>
                      <span className="text-[10px] text-muted-foreground">{formatDateTime(evt.timestamp)}</span>
                    </div>
                    <p className="text-muted-foreground leading-relaxed">{evt.description}</p>
                    {evt.photos && evt.photos.length > 0 && (
                      <div className="flex gap-2 pt-1">
                        {evt.photos.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                            <img src={url} alt="Service evidence" className="h-12 w-12 object-cover rounded border hover:opacity-90" />
                          </a>
                        ))}
                      </div>
                    )}
                    {evt.actionable === "cleaning_ack" && (
                      <div className="pt-2">
                        {evt.actionableStatus === "pending" ? (
                          <form action={acknowledgeCleaning}>
                            <input type="hidden" name="logId" value={evt.actionableId} />
                            <Button type="submit" size="sm" variant="default" className="text-xs h-8">
                              Acknowledge Cleaning
                            </Button>
                          </form>
                        ) : (
                          <Badge variant="success" className="text-[10px] gap-1 px-2 py-0.5">
                            <CheckCircle2 className="h-3 w-3" /> Acknowledged
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
