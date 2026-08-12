import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { KpiCard } from "@/components/kpi-card";
import { PerformanceAnalyticsSection } from "@/components/performance-analytics-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, Activity, Thermometer, Sun, AlertTriangle, Clock, Ticket } from "lucide-react";
import { kWh, pct, formatDate, formatDateTime } from "@/lib/utils";
import { expectedDailyGeneration } from "@/lib/integrations/solcast";

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();

  const { data: site } = await sb.from("sites").select("*").eq("id", id).single();
  if (!site) notFound();

  // Parallel data fetching for site detail aggregates & related collections
  const [invRes, alertsRes, cleaningRes, ticketsRes] = await Promise.all([
    sb.from("inverters").select("*").eq("site_id", id).order("oem_device_id"),
    sb.from("alerts").select("*").eq("site_id", id).order("triggered_at", { ascending: false }),
    sb.from("cleaning_logs").select("*").eq("site_id", id).order("performed_at", { ascending: false }).limit(20),
    sb.from("tickets").select("*").eq("site_id", id).order("created_at", { ascending: false }),
  ]);

  const inverters = invRes.data ?? [];
  const alerts = alertsRes.data ?? [];
  const cleaning = cleaningRes.data ?? [];
  const tickets = ticketsRes.data ?? [];

  const inverterIds = inverters.map((i) => i.id);

  let telemetry: any[] = [];
  let strings: any[] = [];
  let latestStringTelemetry = new Map<string, any>();
  let latestTelemetryMap = new Map<string, any>();

  if (inverterIds.length > 0) {
    const [telRes, strRes, latestTelRes] = await Promise.all([
      sb.from("telemetry")
        .select("timestamp, ac_power_kw, daily_generation_kwh, total_generation_kwh, temperature_c, efficiency_pct, inverter_id")
        .in("inverter_id", inverterIds)
        .order("timestamp", { ascending: false })
        .limit(300),
      sb.from("strings").select("*").in("inverter_id", inverterIds),
      sb.rpc("get_latest_telemetry", { inverter_ids: inverterIds })
    ]);

    telemetry = telRes.data ?? [];
    strings = strRes.data ?? [];
    const latestTel = latestTelRes.data ?? [];
    for (const t of latestTel) {
      latestTelemetryMap.set(t.inverter_id, t);
    }

    const stringIds = strings.map((s) => s.id);
    if (stringIds.length > 0) {
      const { data: stData } = await sb.from("string_telemetry")
        .select("*")
        .in("string_id", stringIds)
        .order("timestamp", { ascending: false });
      
      for (const st of stData ?? []) {
        if (!latestStringTelemetry.has(st.string_id)) {
          latestStringTelemetry.set(st.string_id, st);
        }
      }
    }
  }

  // Aggregate Site Metrics
  let currentPower = 0;
  let todayGeneration = 0;
  let totalGeneration = 0;
  for (const inv of inverters) {
    const tel = latestTelemetryMap.get(inv.id);
    if (tel) {
      currentPower += Number(tel.ac_power_kw || 0);
      todayGeneration += Number(tel.daily_generation_kwh || 0);
      totalGeneration += Number(tel.total_generation_kwh || 0);
    }
  }

  // Format lifetime generation helper
  function formatLifetimeGeneration(kwh: number) {
    if (kwh >= 1000) {
      return `${(kwh / 1000.0).toFixed(2)} MWh`;
    }
    return `${kwh.toFixed(1)} kWh`;
  }

  const specificYieldVal = Number(site.capacity_kwp) > 0 ? (todayGeneration / Number(site.capacity_kwp)) : 0;
  const expectedKw = expectedDailyGeneration(Number(site.capacity_kwp), Number(site.latitude)) / 24;
  const expectedGenerationDaily = expectedDailyGeneration(Number(site.capacity_kwp), Number(site.latitude));
  const performance = expectedGenerationDaily > 0 ? Math.min(100, (todayGeneration / expectedGenerationDaily) * 100) : 0;
  
  const onlineCount = inverters.filter((i) => i.status === "online").length;
  const healthScore = inverters.length > 0 ? Math.round((onlineCount / inverters.length) * 100) : 100;

  const lastCleaned = site.last_cleaned_on ? new Date(site.last_cleaned_on) : null;
  const daysSinceClean = lastCleaned ? Math.floor((Date.now() - lastCleaned.getTime()) / 86400_000) : null;

  const activeAlertsCount = alerts.filter((a) => a.status === "open").length;
  const openTicketsCount = tickets.filter((t) => ["open", "in_progress", "on_hold"].includes(t.status)).length;
  const closedTicketsCount = tickets.filter((t) => t.status === "closed" || t.status === "resolved").length;

  return (
    <div className="space-y-6" data-testid="site-detail">
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Site</div>
        <h1 className="text-3xl font-display font-semibold">{site.name}</h1>
        <p className="text-sm text-muted-foreground">
          {site.location} · {Number(site.capacity_kwp).toLocaleString()} kWp · commissioned {formatDate(site.commissioned_on)}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Current Power" value={`${currentPower.toFixed(2)} kW`} sub="Active fleet output" icon={Zap} accent="primary" />
        <KpiCard label="Today's generation" value={kWh(todayGeneration)} sub={`Expected: ${kWh(expectedGenerationDaily)}`} icon={Sun} accent={performance > 85 ? "success" : "warning"} />
        <KpiCard label="Health score" value={`${healthScore}%`} sub={`${onlineCount}/${inverters.length} online`} icon={Activity} accent={healthScore > 90 ? "success" : "warning"} />
        <KpiCard label="Cleaning" value={daysSinceClean !== null ? `${daysSinceClean}d` : "—"} sub={daysSinceClean !== null && daysSinceClean > site.cleaning_cycle_days ? "Overdue" : `Cycle: ${site.cleaning_cycle_days}d`} icon={Thermometer} accent={daysSinceClean !== null && daysSinceClean > site.cleaning_cycle_days ? "destructive" : "success"} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Lifetime Generation" value={formatLifetimeGeneration(totalGeneration)} sub="Total yield over system lifetime" icon={Zap} />
        <KpiCard label="Specific Yield" value={`${specificYieldVal.toFixed(2)} kWh/kWp`} sub="Today's yield ratio" icon={Activity} accent="success" />
        <KpiCard label="Active alerts" value={activeAlertsCount} sub="Awaiting review" icon={AlertTriangle} accent={activeAlertsCount > 0 ? "warning" : "success"} />
        <KpiCard label="Ticket summary" value={`${openTicketsCount} Open`} sub={`${closedTicketsCount} resolved/closed`} icon={Clock} accent={openTicketsCount > 0 ? "warning" : "success"} />
      </div>

      <Card>
        <CardContent className="pt-6">
          <PerformanceAnalyticsSection siteId={id} isSite={true} />
        </CardContent>
      </Card>

      <Tabs defaultValue="inverters">
        <TabsList>
          <TabsTrigger value="inverters" data-testid="tab-inverters">Inverters ({inverters.length})</TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts">Alerts ({alerts.length})</TabsTrigger>
          <TabsTrigger value="cleaning" data-testid="tab-cleaning">Cleaning ({cleaning.length})</TabsTrigger>
          <TabsTrigger value="tickets" data-testid="tab-tickets">Tickets ({tickets.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="inverters">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {inverters.map((inv) => {
              const tel = latestTelemetryMap.get(inv.id);
              const invStrings = strings.filter((s) => s.inverter_id === inv.id);

              return (
                <Card key={inv.id} className="overflow-hidden">
                  <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-mono font-medium hover:text-primary transition-colors">
                        <Link href={`/inverters/${inv.id}`}>{inv.oem_device_id}</Link>
                      </CardTitle>
                      <p className="text-xs text-muted-foreground uppercase">{inv.oem} · {inv.model} · SN: {inv.serial_number}</p>
                    </div>
                    <Badge variant={inv.status === "online" ? "success" : inv.status === "offline" ? "destructive" : "warning"} className="capitalize">
                      {inv.status}
                    </Badge>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                      <div>
                        <div className="text-muted-foreground text-xs">Current Power</div>
                        <div className="font-semibold font-mono">{tel ? `${Number(tel.ac_power_kw).toFixed(2)} kW` : "—"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Daily Generation</div>
                        <div className="font-semibold font-mono">{tel ? `${Number(tel.daily_generation_kwh || 0).toFixed(1)} kWh` : "—"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Total Generation</div>
                        <div className="font-semibold font-mono">
                          {tel ? `${Number(tel.total_generation_kwh || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} kWh` : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Temperature</div>
                        <div className="font-semibold font-mono">{tel ? `${Number(tel.temperature_c).toFixed(1)} °C` : "—"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Efficiency</div>
                        <div className="font-semibold font-mono">{tel ? `${Number(tel.efficiency_pct).toFixed(1)}%` : "—"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Last Updated</div>
                        <div className="font-semibold font-mono text-xs">{tel ? formatDateTime(tel.timestamp) : "—"}</div>
                      </div>
                    </div>

                    {invStrings.length > 0 && (
                      <details className="group border-t pt-3">
                        <summary className="text-xs text-primary font-medium cursor-pointer list-none flex items-center justify-between select-none hover:underline">
                          <span>Strings Diagnostic ({invStrings.length})</span>
                          <span className="transition-transform group-open:rotate-180">▼</span>
                        </summary>
                        <div className="mt-3 overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="py-1 text-xs">String</TableHead>
                                <TableHead className="py-1 text-xs text-right">Voltage</TableHead>
                                <TableHead className="py-1 text-xs text-right">Current</TableHead>
                                <TableHead className="py-1 text-xs text-right">Power</TableHead>
                                <TableHead className="py-1 text-xs">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {invStrings.map((str) => {
                                const st = latestStringTelemetry.get(str.id);
                                return (
                                  <TableRow key={str.id}>
                                    <TableCell className="py-1.5 text-xs font-medium">#{str.string_index}</TableCell>
                                    <TableCell className="py-1.5 text-xs text-right font-mono">{st ? `${Number(st.voltage_v).toFixed(1)} V` : "—"}</TableCell>
                                    <TableCell className="py-1.5 text-xs text-right font-mono">{st ? `${Number(st.current_a).toFixed(2)} A` : "—"}</TableCell>
                                    <TableCell className="py-1.5 text-xs text-right font-mono">{st ? `${Number(st.power_kw).toFixed(2)} kW` : "—"}</TableCell>
                                    <TableCell className="py-1.5 text-xs">
                                      <Badge variant={str.status === "ok" ? "success" : "warning"} className="text-[10px] py-0 px-1.5 capitalize font-normal">
                                        {st?.status || str.status}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </details>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="alerts">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Title</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead><TableHead>Triggered</TableHead></TableRow></TableHeader>
              <TableBody>
                {alerts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.code}</TableCell>
                    <TableCell>{a.title}</TableCell>
                    <TableCell><Badge variant={a.severity === "critical" ? "destructive" : a.severity === "high" ? "warning" : "secondary"} className="capitalize">{a.severity}</Badge></TableCell>
                    <TableCell className="capitalize">{a.status}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(a.triggered_at)}</TableCell>
                  </TableRow>
                ))}
                {alerts.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No alerts for this site.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="cleaning">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Remarks</TableHead><TableHead>Before</TableHead><TableHead>After</TableHead></TableRow></TableHeader>
              <TableBody>
                {cleaning.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{formatDate(c.performed_at)}</TableCell>
                    <TableCell className="text-sm">{c.remarks ?? "—"}</TableCell>
                    <TableCell>{c.before_photo_url ? <a href={c.before_photo_url} className="text-primary underline" target="_blank" rel="noopener noreferrer">view</a> : "—"}</TableCell>
                    <TableCell>{c.after_photo_url ? <a href={c.after_photo_url} className="text-primary underline" target="_blank" rel="noopener noreferrer">view</a> : "—"}</TableCell>
                  </TableRow>
                ))}
                {cleaning.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No cleaning logs yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="tickets">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>SLA due</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
              <TableBody>
                {tickets.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.title}</TableCell>
                    <TableCell><Badge variant="outline" className="uppercase text-[10px]">{t.priority}</Badge></TableCell>
                    <TableCell><Badge variant={t.status === "resolved" || t.status === "closed" ? "success" : t.status === "on_hold" ? "warning" : "secondary"} className="capitalize">{t.status.replace("_"," ")}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.sla_due_at ? formatDateTime(t.sla_due_at) : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(t.created_at)}</TableCell>
                  </TableRow>
                ))}
                {tickets.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No tickets for this site.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
