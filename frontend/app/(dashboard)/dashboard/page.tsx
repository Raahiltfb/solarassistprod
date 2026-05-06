import { createClient } from "@/lib/supabase/server";
import { KpiCard } from "@/components/kpi-card";
import { GenerationChart } from "@/components/generation-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, Activity, AlertTriangle, Building2, CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";
import { kWh, formatDateTime } from "@/lib/utils";

export default async function DashboardPage() {
  const sb = await createClient();

  const [sitesRes, alertsRes, ticketsRes, telRes, invertersRes] = await Promise.all([
    sb.from("sites").select("id, name, location, capacity_kwp, status"),
    sb.from("alerts").select("id, title, severity, status, triggered_at, site_id").order("triggered_at", { ascending: false }).limit(6),
    sb.from("tickets").select("id, title, status, priority, created_at").order("created_at", { ascending: false }).limit(6),
    sb.from("telemetry").select("timestamp, ac_power_kw, energy_kwh").gte("timestamp", new Date(Date.now() - 24 * 3600_000).toISOString()).order("timestamp"),
    sb.from("inverters").select("id, status"),
  ]);

  const sites = sitesRes.data ?? [];
  const alerts = alertsRes.data ?? [];
  const tickets = ticketsRes.data ?? [];
  const telemetry = telRes.data ?? [];
  const inverters = invertersRes.data ?? [];

  const totalCapacity = sites.reduce((s, x) => s + Number(x.capacity_kwp || 0), 0);
  const openAlerts = alerts.filter((a) => a.status === "open").length;
  const onlineInverters = inverters.filter((i) => i.status === "online").length;
  const totalInverters = inverters.length || 1;

  // Aggregate telemetry to a single series per hour (sum across inverters)
  const byHour = new Map<string, number>();
  for (const t of telemetry) {
    const h = new Date(t.timestamp).toISOString().slice(0, 13) + ":00:00Z";
    byHour.set(h, (byHour.get(h) ?? 0) + Number(t.ac_power_kw));
  }
  const series = Array.from(byHour.entries()).sort().map(([timestamp, ac_power_kw]) => ({
    timestamp, ac_power_kw: +ac_power_kw.toFixed(2),
    expected: +(ac_power_kw * 1.08).toFixed(2),
  }));

  const totalEnergy24h = telemetry.reduce((s, t) => s + Number(t.ac_power_kw), 0);

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-display font-semibold tracking-tight">Fleet overview</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time generation, health and ops across all sites.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Installed capacity" value={`${(totalCapacity / 1000).toFixed(2)} MWp`} sub={`${sites.length} sites`} icon={Building2} />
        <KpiCard label="Generation (24h)" value={kWh(totalEnergy24h)} sub="Sum across fleet" icon={Zap} accent="primary" />
        <KpiCard label="Inverters online" value={`${onlineInverters}/${totalInverters}`} sub={`${((onlineInverters / totalInverters) * 100).toFixed(0)}% availability`} icon={Activity} accent="success" />
        <KpiCard label="Open alerts" value={openAlerts} sub={`${tickets.filter((t) => t.status === "open").length} open tickets`} icon={AlertTriangle} accent={openAlerts > 0 ? "warning" : "success"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Generation — last 24 hours</CardTitle></CardHeader>
          <CardContent>
            {series.length > 0 ? <GenerationChart data={series} /> : <div className="text-sm text-muted-foreground py-12 text-center">No telemetry yet. Run <code>yarn seed</code> or trigger OEM sync.</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent alerts</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {alerts.length === 0 && <div className="text-sm text-muted-foreground">All clear.</div>}
            {alerts.map((a) => (
              <Link key={a.id} href="/alerts" className="block">
                <div className="flex items-start gap-3 p-3 rounded-md hover:bg-accent transition-colors">
                  <div className={`h-2 w-2 rounded-full mt-1.5 ${a.severity === "critical" ? "bg-destructive" : a.severity === "high" ? "bg-orange-500" : a.severity === "medium" ? "bg-warning" : "bg-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.title}</div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(a.triggered_at)}</div>
                  </div>
                  <Badge variant={a.status === "open" ? "destructive" : "secondary"} className="shrink-0 capitalize">{a.status}</Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Sites</CardTitle></CardHeader>
          <CardContent className="divide-y">
            {sites.slice(0, 6).map((s) => (
              <Link href={`/sites/${s.id}`} key={s.id} className="flex items-center justify-between py-3 hover:bg-accent/40 -mx-3 px-3 rounded transition-colors">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.location}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm">{Number(s.capacity_kwp).toLocaleString()} kWp</div>
                  <Badge variant={s.status === "active" ? "success" : "secondary"} className="capitalize">{s.status}</Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Ticket pipeline</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {tickets.length === 0 && <div className="text-sm text-muted-foreground">No tickets yet.</div>}
            {tickets.map((t) => (
              <Link key={t.id} href="/tickets" className="flex items-start gap-3 py-2">
                {t.status === "resolved" || t.status === "closed" ? <CheckCircle2 className="h-4 w-4 text-success mt-0.5" /> : <Clock className="h-4 w-4 text-warning mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  <div className="text-xs text-muted-foreground">{formatDateTime(t.created_at)}</div>
                </div>
                <Badge variant="outline" className="uppercase text-[10px]">{t.priority}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
