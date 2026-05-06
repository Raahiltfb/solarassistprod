import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KpiCard } from "@/components/kpi-card";
import { GenerationChart } from "@/components/generation-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, Activity, Thermometer, Sun } from "lucide-react";
import { kWh, pct, formatDate } from "@/lib/utils";
import { expectedDailyGeneration } from "@/lib/integrations/solcast";

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();

  const { data: site } = await sb.from("sites").select("*").eq("id", id).single();
  if (!site) notFound();

  const [invRes, telRes, alertsRes, cleaningRes] = await Promise.all([
    sb.from("inverters").select("*").eq("site_id", id).order("oem_device_id"),
    sb.from("telemetry").select("timestamp, ac_power_kw, inverter_id").gte("timestamp", new Date(Date.now() - 48 * 3600_000).toISOString()).order("timestamp"),
    sb.from("alerts").select("*").eq("site_id", id).order("triggered_at", { ascending: false }).limit(10),
    sb.from("cleaning_logs").select("*").eq("site_id", id).order("performed_at", { ascending: false }).limit(5),
  ]);

  const inverters = invRes.data ?? [];
  const telemetry = telRes.data ?? [];
  const alerts = alertsRes.data ?? [];
  const cleaning = cleaningRes.data ?? [];

  const invIds = new Set(inverters.map((i) => i.id));
  const siteTel = telemetry.filter((t) => invIds.has(t.inverter_id));

  const byHour = new Map<string, number>();
  for (const t of siteTel) {
    const h = new Date(t.timestamp).toISOString().slice(0, 13) + ":00:00Z";
    byHour.set(h, (byHour.get(h) ?? 0) + Number(t.ac_power_kw));
  }
  const expectedKw = expectedDailyGeneration(Number(site.capacity_kwp), Number(site.latitude)) / 24;
  const series = Array.from(byHour.entries()).sort().map(([timestamp, ac_power_kw]) => ({
    timestamp, ac_power_kw: +ac_power_kw.toFixed(2), expected: +expectedKw.toFixed(2),
  }));
  const dayEnergy = siteTel.reduce((s, t) => s + Number(t.ac_power_kw), 0) / 2; // hourly averages → kWh
  const performance = Math.min(100, (dayEnergy / Math.max(1, expectedDailyGeneration(Number(site.capacity_kwp), Number(site.latitude)))) * 100);
  const online = inverters.filter((i) => i.status === "online").length;
  const healthScore = +(100 * (online / Math.max(1, inverters.length))).toFixed(0);

  const lastCleaned = site.last_cleaned_on ? new Date(site.last_cleaned_on) : null;
  const daysSinceClean = lastCleaned ? Math.floor((Date.now() - lastCleaned.getTime()) / 86400_000) : null;

  return (
    <div className="space-y-6" data-testid="site-detail">
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Site</div>
        <h1 className="text-3xl font-display font-semibold">{site.name}</h1>
        <p className="text-sm text-muted-foreground">{site.location} · {Number(site.capacity_kwp).toLocaleString()} kWp · commissioned {formatDate(site.commissioned_on)}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Today's generation" value={kWh(dayEnergy)} sub="Actual AC output" icon={Zap} accent="primary" />
        <KpiCard label="Performance ratio" value={pct(performance)} sub="vs. expected" icon={Sun} accent={performance > 85 ? "success" : "warning"} />
        <KpiCard label="Health score" value={`${healthScore}`} sub={`${online}/${inverters.length} inverters online`} icon={Activity} accent={healthScore > 90 ? "success" : "warning"} />
        <KpiCard label="Cleaning" value={daysSinceClean !== null ? `${daysSinceClean}d` : "—"} sub={daysSinceClean !== null && daysSinceClean > site.cleaning_cycle_days ? "Overdue" : `Cycle: ${site.cleaning_cycle_days}d`} icon={Thermometer} accent={daysSinceClean !== null && daysSinceClean > site.cleaning_cycle_days ? "destructive" : "success"} />
      </div>

      <Card>
        <CardHeader><CardTitle>Generation vs expected · last 48h</CardTitle></CardHeader>
        <CardContent>
          {series.length > 0 ? <GenerationChart data={series} /> : <div className="text-sm text-muted-foreground py-12 text-center">No telemetry available.</div>}
        </CardContent>
      </Card>

      <Tabs defaultValue="inverters">
        <TabsList>
          <TabsTrigger value="inverters" data-testid="tab-inverters">Inverters ({inverters.length})</TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts">Alerts ({alerts.length})</TabsTrigger>
          <TabsTrigger value="cleaning" data-testid="tab-cleaning">Cleaning</TabsTrigger>
        </TabsList>

        <TabsContent value="inverters">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Device</TableHead><TableHead>OEM</TableHead><TableHead>Model</TableHead>
                  <TableHead className="text-right">Capacity</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {inverters.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-mono text-xs">{i.oem_device_id}</TableCell>
                      <TableCell className="uppercase text-xs">{i.oem}</TableCell>
                      <TableCell>{i.model}</TableCell>
                      <TableCell className="text-right font-mono">{i.capacity_kw} kW</TableCell>
                      <TableCell><Badge variant={i.status === "online" ? "success" : i.status === "offline" ? "destructive" : "warning"} className="capitalize">{i.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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
                    <TableCell className="text-xs text-muted-foreground">{formatDate(a.triggered_at, "MMM d HH:mm")}</TableCell>
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
      </Tabs>
    </div>
  );
}
