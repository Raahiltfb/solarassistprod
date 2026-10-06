"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { Zap, Activity, Thermometer, ShieldAlert, Award, TrendingDown, ArrowUpRight } from "lucide-react";
import { compareInvertersDiagnostic, InverterComparisonResult } from "@/lib/inverter-diagnostic-engine";

export function MultiInverterDiagnosticSection({ 
  inverters, 
  latestTelemetryMap 
}: { 
  inverters: any[];
  latestTelemetryMap: Map<string, any>;
}) {
  const comparisonResults: InverterComparisonResult[] = compareInvertersDiagnostic(inverters, latestTelemetryMap);

  const [sortField, setSortField] = useState<keyof InverterComparisonResult>("performance_rank");
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const sortedResults = [...comparisonResults].sort((a, b) => {
    const valA = a[sortField];
    const valB = b[sortField];
    if (typeof valA === "number" && typeof valB === "number") {
      return sortAsc ? valA - valB : valB - valA;
    }
    return sortAsc 
      ? String(valA).localeCompare(String(valB)) 
      : String(valB).localeCompare(String(valA));
  });

  const handleSort = (field: keyof InverterComparisonResult) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const chartData = comparisonResults.map((r) => ({
    name: r.oem_device_id,
    yield: r.specific_yield_kwh_kwp,
    efficiency: r.efficiency_pct,
    devPct: r.yield_deviation_pct,
  }));

  const topInverter = comparisonResults.find((r) => r.performance_rank === 1);
  const lowestInverter = comparisonResults.reduce((lowest, r) => 
    (!lowest || r.specific_yield_kwh_kwp < lowest.specific_yield_kwh_kwp) ? r : lowest, comparisonResults[0]
  );

  return (
    <div className="space-y-6" data-testid="multi-inverter-diagnostic-section">
      {/* Top Level Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-card border rounded-xl shadow-sm flex items-center gap-3.5">
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-medium">Top Performing Inverter</div>
            <div className="font-bold text-sm text-foreground font-mono">{topInverter?.oem_device_id || "—"}</div>
            <div className="text-xs text-emerald-600 dark:text-emerald-400 font-mono font-medium">
              {topInverter?.specific_yield_kwh_kwp.toFixed(2)} kWh/kWp ({topInverter?.yield_deviation_pct && topInverter.yield_deviation_pct > 0 ? `+${topInverter.yield_deviation_pct}%` : "0%"})
            </div>
          </div>
        </div>

        <div className="p-4 bg-card border rounded-xl shadow-sm flex items-center gap-3.5">
          <div className="h-10 w-10 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
            <TrendingDown className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-medium">Lowest Yield Inverter</div>
            <div className="font-bold text-sm text-foreground font-mono">{lowestInverter?.oem_device_id || "—"}</div>
            <div className="text-xs text-amber-600 dark:text-amber-400 font-mono font-medium">
              {lowestInverter?.specific_yield_kwh_kwp.toFixed(2)} kWh/kWp ({lowestInverter?.yield_deviation_pct}% vs avg)
            </div>
          </div>
        </div>

        <div className="p-4 bg-card border rounded-xl shadow-sm flex items-center gap-3.5">
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-medium">Fleet Mean Specific Yield</div>
            <div className="font-bold text-sm text-foreground font-mono">
              {(comparisonResults.reduce((sum, r) => sum + r.specific_yield_kwh_kwp, 0) / (comparisonResults.length || 1)).toFixed(2)} kWh/kWp
            </div>
            <div className="text-xs text-muted-foreground"> Across {comparisonResults.length} inverters</div>
          </div>
        </div>
      </div>

      {/* Yield Comparison Chart */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span>Inverter Specific Yield Comparison (kWh/kWp)</span>
            <span className="text-xs text-muted-foreground font-normal">Higher is better</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} className="text-[10px] fill-muted-foreground" />
                <YAxis tickLine={false} axisLine={false} className="text-[10px] fill-muted-foreground" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                  formatter={(val: any) => [`${val} kWh/kWp`, "Specific Yield"]}
                />
                <Bar dataKey="yield" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.devPct < -10 ? "hsl(var(--destructive))" : entry.devPct > 5 ? "#10b981" : "#3b82f6"} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Side-by-Side Inverter Diagnostic Table */}
      <Card className="border shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b bg-muted/30">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span>Inverter Comparative Diagnostic Matrix</span>
            <span className="text-xs text-muted-foreground font-normal">{comparisonResults.length} inverters evaluated</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="text-xs">
            <TableHeader className="bg-muted/50 uppercase tracking-wider font-semibold">
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => handleSort("performance_rank")}>
                  Rank {sortField === "performance_rank" && (sortAsc ? "↑" : "↓")}
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort("oem_device_id")}>
                  Inverter {sortField === "oem_device_id" && (sortAsc ? "↑" : "↓")}
                </TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => handleSort("capacity_kw")}>
                  Capacity {sortField === "capacity_kw" && (sortAsc ? "↑" : "↓")}
                </TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => handleSort("active_power_kw")}>
                  Active Power {sortField === "active_power_kw" && (sortAsc ? "↑" : "↓")}
                </TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => handleSort("today_generation_kwh")}>
                  Today Gen {sortField === "today_generation_kwh" && (sortAsc ? "↑" : "↓")}
                </TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => handleSort("specific_yield_kwh_kwp")}>
                  Specific Yield {sortField === "specific_yield_kwh_kwp" && (sortAsc ? "↑" : "↓")}
                </TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => handleSort("yield_deviation_pct")}>
                  Yield Delta {sortField === "yield_deviation_pct" && (sortAsc ? "↑" : "↓")}
                </TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => handleSort("efficiency_pct")}>
                  Efficiency {sortField === "efficiency_pct" && (sortAsc ? "↑" : "↓")}
                </TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => handleSort("temperature_c")}>
                  Temp (°C) {sortField === "temperature_c" && (sortAsc ? "↑" : "↓")}
                </TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => handleSort("health_score")}>
                  Health Score {sortField === "health_score" && (sortAsc ? "↑" : "↓")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedResults.map((r) => (
                <TableRow key={r.inverter_id} className="hover:bg-muted/30">
                  <TableCell className="font-mono font-bold text-muted-foreground">
                    #{r.performance_rank}
                  </TableCell>
                  <TableCell className="font-semibold text-foreground">
                    <div>{r.oem_device_id}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{r.serial_number}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{r.capacity_kw} kW</TableCell>
                  <TableCell className="text-right font-mono font-medium">{r.active_power_kw.toFixed(1)} kW</TableCell>
                  <TableCell className="text-right font-mono font-medium">{r.today_generation_kwh.toFixed(1)} kWh</TableCell>
                  <TableCell className="text-right font-mono font-bold text-foreground">
                    {r.specific_yield_kwh_kwp.toFixed(2)} kWh/kWp
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <span className={r.yield_deviation_pct < -10 ? "text-destructive font-bold" : r.yield_deviation_pct > 5 ? "text-emerald-600 font-bold" : "text-muted-foreground"}>
                      {r.yield_deviation_pct > 0 ? `+${r.yield_deviation_pct}%` : `${r.yield_deviation_pct}%`}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono">{r.efficiency_pct.toFixed(1)}%</TableCell>
                  <TableCell className="text-right font-mono">
                    <span className={r.temperature_c > 65 ? "text-amber-600 font-bold" : "text-muted-foreground"}>
                      {r.temperature_c}°C
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge 
                      variant={r.health_score >= 85 ? "success" : r.health_score >= 60 ? "warning" : "destructive"} 
                      className="font-mono text-[10px]"
                    >
                      {r.health_score}/100
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
