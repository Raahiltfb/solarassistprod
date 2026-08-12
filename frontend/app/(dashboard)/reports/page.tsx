import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Zap, BarChart3, Gauge } from "lucide-react";
import { kWh, pct } from "@/lib/utils";
import { expectedDailyGeneration } from "@/lib/integrations/solcast";

export default async function ReportsPage() {
  const sb = await createClient();
  const { data: sites } = await sb.from("sites").select("*");
  const sinceIso = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data: tel } = await sb.from("telemetry").select("inverter_id, ac_power_kw").gte("timestamp", sinceIso);
  const { data: invs } = await sb.from("inverters").select("id, site_id");

  const invSite = new Map((invs ?? []).map((i) => [i.id, i.site_id]));
  const energyBySite = new Map<string, number>();
  for (const t of tel ?? []) {
    const siteId = invSite.get(t.inverter_id);
    if (!siteId) continue;
    energyBySite.set(siteId, (energyBySite.get(siteId) ?? 0) + Number(t.ac_power_kw));
  }

  const rows = (sites ?? []).map((s) => {
    const energy = energyBySite.get(s.id) ?? 0;
    const expected = expectedDailyGeneration(Number(s.capacity_kwp), Number(s.latitude)) * 30;
    const pr = expected > 0 ? Math.min(100, (energy / expected) * 100) : 0;
    return { ...s, energy, expected, pr };
  });

  const totalEnergy = rows.reduce((s, r) => s + r.energy, 0);
  const avgPr = rows.length ? rows.reduce((s, r) => s + r.pr, 0) / rows.length : 0;

  return (
    <div className="space-y-6" data-testid="reports-page">
      <div>
        <h1 className="text-3xl font-display font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">Client-facing performance summary · last 30 days.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard label="Total energy (30d)" value={kWh(totalEnergy)} icon={Zap} accent="primary" />
        <KpiCard label="Avg performance ratio" value={pct(avgPr)} icon={Gauge} accent={avgPr > 80 ? "success" : "warning"} />
        <KpiCard label="Sites in scope" value={rows.length} icon={BarChart3} />
      </div>

      <Card>
        <CardHeader><CardTitle>Per-site summary</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Site</TableHead>
              <TableHead className="text-right">Capacity</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="text-right">Actual</TableHead>
              <TableHead className="text-right">PR</TableHead>
              <TableHead className="text-right">Savings (₹)</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right font-mono">{Number(r.capacity_kwp).toLocaleString()} kWp</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{kWh(r.expected)}</TableCell>
                  <TableCell className="text-right font-mono">{kWh(r.energy)}</TableCell>
                  <TableCell className="text-right">
                    <span className={r.pr > 80 ? "text-success" : "text-warning"}>{pct(r.pr)}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono">₹{Math.round(r.energy * 8).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
