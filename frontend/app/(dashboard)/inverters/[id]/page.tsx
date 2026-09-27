import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { KpiCard } from "@/components/kpi-card";
import { PerformanceAnalyticsSection } from "@/components/performance-analytics-section";
import { ElectricalDiagnosticsSection } from "@/components/electrical-diagnostics-section";
import { StringAnalyticsSection } from "@/components/string-analytics-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Zap, 
  Activity, 
  Thermometer, 
  Sun, 
  AlertTriangle, 
  Clock, 
  FileText, 
  Database, 
  Wrench,
  Layers,
  Calendar
} from "lucide-react";
import { getInverterStatus } from "@/lib/status-utils";
import { kWh, formatDate, formatDateTime } from "@/lib/utils";

export default async function InverterDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();

  // 1. Fetch Inverter details and linked site
  const { data: inverter } = await sb
    .from("inverters")
    .select("*, sites(*)")
    .eq("id", id)
    .single();

  if (!inverter) notFound();

  // 2. Fetch operations data for this inverter in parallel
  const [telemetryRes, alertsRes, ticketsRes, cleaningRes, stringsRes] = await Promise.all([
    sb.from("telemetry")
      .select("*")
      .eq("inverter_id", id)
      .order("timestamp", { ascending: false })
      .limit(300),
    sb.from("alerts")
      .select("*")
      .eq("inverter_id", id)
      .order("triggered_at", { ascending: false }),
    sb.from("tickets")
      .select("*")
      .eq("inverter_id", id)
      .order("created_at", { ascending: false }),
    sb.from("cleaning_logs")
      .select("*")
      .eq("site_id", inverter.site_id)
      .order("performed_at", { ascending: false })
      .limit(20),
    sb.from("strings")
      .select("*")
      .eq("inverter_id", id)
      .order("string_index")
  ]);

  const telemetry = telemetryRes.data ?? [];
  const alerts = alertsRes.data ?? [];
  const tickets = ticketsRes.data ?? [];
  const cleaningLogs = cleaningRes.data ?? [];
  const strings = (stringsRes.data ?? []).sort((a, b) => Number(a.string_index) - Number(b.string_index));

  // Fetch latest string telemetry for live diagnostic values
  let latestStringTelemetry = new Map<string, any>();
  const stringIds = strings.map((s) => s.id);
  if (stringIds.length > 0) {
    const { data: stData } = await sb
      .from("string_telemetry")
      .select("*")
      .in("string_id", stringIds)
      .order("timestamp", { ascending: false });

    for (const st of stData ?? []) {
      if (!latestStringTelemetry.has(st.string_id)) {
        latestStringTelemetry.set(st.string_id, st);
      }
    }
  }

  // Helper formatting functions
  function formatLifetimeGeneration(kwh: number) {
    if (kwh >= 1000) {
      return `${(kwh / 1000.0).toFixed(2)} MWh`;
    }
    return `${kwh.toFixed(1)} kWh`;
  }

  function getFreshnessText(lastUpdate: string) {
    if (!lastUpdate) return "Offline";
    const diffMinutes = (Date.now() - new Date(lastUpdate).getTime()) / 60000;
    if (diffMinutes < 20) return "Fresh";
    if (diffMinutes < 60) return "Delayed";
    if (diffMinutes < 1440) return "Stale";
    return "Offline";
  }

  // Aggregate current metrics
  const latestTelemetry = telemetry[0] || {};
  const currentPower = Number(latestTelemetry.ac_power_kw || 0);
  const dailyGen = Number(latestTelemetry.daily_generation_kwh || 0);
  const totalGen = Number(latestTelemetry.total_generation_kwh || 0);
  const specificYieldVal = Number(inverter.capacity_kw) > 0 ? (dailyGen / Number(inverter.capacity_kw)) : 0;

  const activeAlertsCount = alerts.filter((a) => a.status === "open").length;
  const unresolvedTicketsCount = tickets.filter((t) => ["open", "in_progress", "on_hold"].includes(t.status)).length;

  const invStatus = getInverterStatus(inverter, latestTelemetry?.timestamp);

  return (
    <div className="space-y-6" data-testid="inverter-detail-page">
      <div>
        <Link href={`/sites/${inverter.site_id}`}>
          <Button variant="outline" size="sm" className="mb-4 gap-1 text-xs">
            ← Back to Site
          </Button>
        </Link>
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider mb-1">
          <Link href={`/sites/${inverter.site_id}`} className="hover:text-primary transition-colors">
            {inverter.sites?.name}
          </Link>
          <span>·</span>
          <span>Inverter Record</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-semibold font-mono">{inverter.oem_device_id}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Serial Number: <b className="font-mono">{inverter.serial_number}</b> · OEM: <span className="capitalize">{inverter.oem}</span> · Model: {inverter.model}
            </p>
            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
              Last updated: <span className="font-mono font-medium">{latestTelemetry.timestamp ? formatDateTime(latestTelemetry.timestamp) : "—"}</span>
            </p>
          </div>
          <Badge variant={invStatus === "ONLINE" ? "success" : invStatus === "OFFLINE" ? "destructive" : "warning"} className="text-sm capitalize py-1 px-3">
            {invStatus === "NO GRID" ? "Online (No Grid)" : invStatus.toLowerCase()}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label="AC Active Power" value={`${currentPower.toFixed(2)} kW`} sub={`Capacity: ${inverter.capacity_kw} kW`} icon={Zap} accent="primary" />
        <KpiCard label="Today's Generation" value={`${dailyGen.toFixed(1)} kWh`} sub={`Specific Yield: ${specificYieldVal.toFixed(2)} kWh/kWp`} icon={Sun} accent="success" />
        <KpiCard label="Lifetime Generation" value={formatLifetimeGeneration(totalGen)} sub="Total yield over system lifetime" icon={Zap} />
        <KpiCard label="Specific Yield" value={`${specificYieldVal.toFixed(2)} kWh/kWp`} sub="Today's yield ratio" icon={Activity} accent="success" />
        <KpiCard label="Active Alerts" value={activeAlertsCount} sub={`${unresolvedTicketsCount} unresolved tickets`} icon={AlertTriangle} accent={activeAlertsCount > 0 ? "warning" : "success"} />
      </div>

      <Tabs defaultValue="performance">
        <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1 p-1 bg-muted rounded-lg">
          <TabsTrigger value="performance" data-testid="tab-performance">Performance Analytics</TabsTrigger>
          <TabsTrigger value="electrical" data-testid="tab-electrical">Electrical Diagnostics</TabsTrigger>
          <TabsTrigger value="strings" data-testid="tab-strings">Live Strings ({strings.length})</TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">String Diagnostics</TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts">Alerts History ({alerts.length})</TabsTrigger>
          <TabsTrigger value="tickets" data-testid="tab-tickets">Tickets & Maintenance ({tickets.length})</TabsTrigger>
          <TabsTrigger value="cleanings" data-testid="tab-cleanings">Cleanings ({cleaningLogs.length})</TabsTrigger>
          <TabsTrigger value="commissioning" data-testid="tab-commissioning">Commissioning</TabsTrigger>
        </TabsList>

        <TabsContent value="performance">
          <Card>
            <CardContent className="pt-6">
              <PerformanceAnalyticsSection
                inverterId={id}
                initialInverterIds={[id]}
                initialTotalCapacity={Number(inverter.capacity_kw || 0)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="electrical">
          <Card>
            <CardContent className="pt-6">
              <ElectricalDiagnosticsSection inverterId={id} latestTelemetry={latestTelemetry} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="strings">
          <Card>
            <CardHeader><CardTitle>Live String Input Channels</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel Index</TableHead>
                    <TableHead className="text-right">Voltage</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">Power</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {strings.map((str) => {
                    const st = latestStringTelemetry.get(str.id);
                    return (
                      <TableRow key={str.id}>
                        <TableCell className="font-semibold">String #{str.string_index}</TableCell>
                        <TableCell className="text-right font-mono">{st ? `${Number(st.voltage_v).toFixed(1)} V` : "—"}</TableCell>
                        <TableCell className="text-right font-mono">{st ? `${Number(st.current_a).toFixed(2)} A` : "—"}</TableCell>
                        <TableCell className="text-right font-mono">{st ? `${Number(st.power_kw).toFixed(2)} kW` : "—"}</TableCell>
                        <TableCell>
                          <Badge variant={str.status === "ok" ? "success" : "warning"} className="capitalize">
                            {st?.status || str.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {strings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                        No strings defined for this inverter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <Card>
            <CardHeader><CardTitle>String Telemetry Analytics</CardTitle></CardHeader>
            <CardContent>
              <StringAnalyticsSection inverters={[inverter]} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OEM Code</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Triggered Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs font-semibold">{a.alarm_code || a.code}</TableCell>
                      <TableCell>
                        <div className="font-medium">{a.title}</div>
                        {a.description && <div className="text-xs text-muted-foreground line-clamp-1">{a.description}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={a.severity === "critical" ? "destructive" : a.severity === "high" ? "warning" : "secondary"} className="capitalize">
                          {a.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize text-xs">{a.category || "inverter"}</TableCell>
                      <TableCell className="capitalize">{a.status}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(a.triggered_at)}</TableCell>
                    </TableRow>
                  ))}
                  {alerts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                        No alerts recorded for this inverter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tickets">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket Title</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Technician Remarks</TableHead>
                    <TableHead>Created At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-semibold hover:underline">
                        <Link href={`/tickets/${t.id}`}>{t.title}</Link>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="uppercase text-[10px]">{t.priority}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={t.status === "closed" || t.status === "resolved" ? "success" : "secondary"} className="capitalize">
                          {t.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{t.technician_remarks || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(t.created_at)}</TableCell>
                    </TableRow>
                  ))}
                  {tickets.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                        No service tickets raised for this inverter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cleanings">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cleaning Date</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead>Before photo</TableHead>
                    <TableHead>After photo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cleaningLogs.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-semibold">{formatDate(c.performed_at)}</TableCell>
                      <TableCell className="text-sm">{c.remarks || "—"}</TableCell>
                      <TableCell>
                        {c.before_photo_url ? (
                          <a href={c.before_photo_url} className="text-primary underline text-xs" target="_blank" rel="noopener noreferrer">View</a>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {c.after_photo_url ? (
                          <a href={c.after_photo_url} className="text-primary underline text-xs" target="_blank" rel="noopener noreferrer">View</a>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {cleaningLogs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                        No cleaning events logged.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commissioning">
          <div className="grid grid-cols-1 gap-6">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />Commissioning Details</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Commissioned Date</span>
                  <span className="font-semibold">{formatDate(inverter.installed_on)}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Rated Capacity</span>
                  <span className="font-semibold font-mono">{inverter.capacity_kw} kW</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Number of Active Strings</span>
                  <span className="font-semibold font-mono">{inverter.string_count} channels</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Grid Standard Config</span>
                  <span className="font-semibold font-mono">AS4777.2_2020</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
