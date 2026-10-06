"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { Zap, Activity, Thermometer, ShieldAlert, Award, TrendingDown, ArrowRight, ChevronRight, Info, Wrench, Layers } from "lucide-react";
import { compareInvertersDiagnostic, InverterComparisonResult } from "@/lib/inverter-diagnostic-engine";

export function MultiInverterDiagnosticSection({ 
  inverters, 
  latestTelemetryMap,
  strings = [],
  stringTelemetryMap = new Map(),
  activeAlerts = []
}: { 
  inverters: any[];
  latestTelemetryMap: Map<string, any>;
  strings?: any[];
  stringTelemetryMap?: Map<string, any>;
  activeAlerts?: any[];
}) {
  const comparisonResults: InverterComparisonResult[] = compareInvertersDiagnostic(
    inverters, 
    latestTelemetryMap,
    strings,
    stringTelemetryMap,
    activeAlerts
  );

  const [sortField, setSortField] = useState<keyof InverterComparisonResult>("performance_rank");
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [selectedInverter, setSelectedInverter] = useState<InverterComparisonResult | null>(null);

  const sortedResults = [...comparisonResults].sort((a, b) => {
    const valA = a[sortField];
    const valB = b[sortField];
    if (typeof valA === "number" && typeof valB === "number") {
      return sortAsc ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
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
  const thermalDeratingCount = comparisonResults.filter((r) => r.thermal_status === "thermal_derating").length;

  return (
    <div className="space-y-6" data-testid="multi-inverter-diagnostic-section">
      {/* Top Level Summary Cards (Simple On Top) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              {lowestInverter?.specific_yield_kwh_kwp.toFixed(2)} kWh/kWp ({lowestInverter?.yield_deviation_pct}% vs median)
            </div>
          </div>
        </div>

        <div className="p-4 bg-card border rounded-xl shadow-sm flex items-center gap-3.5">
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-medium">Site Median Specific Yield</div>
            <div className="font-bold text-sm text-foreground font-mono">
              {(topInverter?.site_median_yield || 0).toFixed(2)} kWh/kWp
            </div>
            <div className="text-xs text-muted-foreground"> Across {comparisonResults.length} inverters</div>
          </div>
        </div>

        <div className="p-4 bg-card border rounded-xl shadow-sm flex items-center gap-3.5">
          <div className="h-10 w-10 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
            <Thermometer className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-medium">Thermal Derating Warnings</div>
            <div className="font-bold text-sm text-foreground font-mono">{thermalDeratingCount}</div>
            <div className="text-xs text-muted-foreground">Internal temp &gt; 65°C under load</div>
          </div>
        </div>
      </div>

      {/* Yield Comparison Chart */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span>Inverter Specific Yield Comparison (kWh/kWp)</span>
            <span className="text-xs text-muted-foreground font-normal">Click an inverter row below for detailed diagnostics</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="h-[220px] w-full">
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
        <CardHeader className="pb-3 border-b bg-muted/30 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Inverter Comparative Diagnostic Matrix</CardTitle>
          <span className="text-xs text-muted-foreground">Click any row for diagnostic breakdown</span>
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
                <TableHead className="text-right cursor-pointer" onClick={() => handleSort("ac_power_kw")}>
                  AC / DC Power {sortField === "ac_power_kw" && (sortAsc ? "↑" : "↓")}
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
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedResults.map((r) => (
                <TableRow 
                  key={r.inverter_id} 
                  onClick={() => setSelectedInverter(r)}
                  className="hover:bg-muted/40 cursor-pointer transition-colors"
                >
                  <TableCell className="font-mono font-bold text-muted-foreground">
                    #{r.performance_rank}
                  </TableCell>
                  <TableCell className="font-semibold text-foreground">
                    <div>{r.oem_device_id}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{r.serial_number}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{r.capacity_kw} kW</TableCell>
                  <TableCell className="text-right font-mono">
                    <span className="font-medium text-foreground">{r.ac_power_kw.toFixed(1)} kW</span>
                    <span className="text-[10px] text-muted-foreground block">DC: {r.dc_power_kw.toFixed(1)} kW</span>
                  </TableCell>
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
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Inverter Deep Diagnostic Modal / Drawer */}
      <Dialog open={!!selectedInverter} onOpenChange={(open) => !open && setSelectedInverter(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedInverter && (
            <div className="space-y-4 text-xs">
              <DialogHeader className="border-b pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    <DialogTitle className="text-base font-bold">
                      Inverter Diagnostic: {selectedInverter.oem_device_id}
                    </DialogTitle>
                  </div>
                  <Badge 
                    variant={selectedInverter.health_score >= 85 ? "success" : selectedInverter.health_score >= 60 ? "warning" : "destructive"}
                    className="text-xs px-2.5 py-0.5 font-bold font-mono"
                  >
                    Health Score: {selectedInverter.health_score}/100
                  </Badge>
                </div>
              </DialogHeader>

              {/* Diagnostic Overview Panel */}
              <div className="p-3 bg-muted/40 rounded-xl border space-y-2">
                <div className="font-semibold text-foreground text-sm flex items-center justify-between">
                  <span>Performance Rank: #{selectedInverter.performance_rank} of {comparisonResults.length}</span>
                  <span className="font-mono text-xs text-muted-foreground">Serial: {selectedInverter.serial_number}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Specific Yield</span>
                    <span className="font-bold font-mono text-sm text-foreground">{selectedInverter.specific_yield_kwh_kwp} kWh/kWp</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Site Median</span>
                    <span className="font-bold font-mono text-sm text-foreground">{selectedInverter.site_median_yield} kWh/kWp</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Yield Deviation</span>
                    <span className={`font-bold font-mono text-sm ${selectedInverter.yield_deviation_pct < -10 ? "text-destructive" : "text-emerald-600"}`}>
                      {selectedInverter.yield_deviation_pct > 0 ? `+${selectedInverter.yield_deviation_pct}%` : `${selectedInverter.yield_deviation_pct}%`}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Conversion Efficiency</span>
                    <span className="font-bold font-mono text-sm text-foreground">{selectedInverter.efficiency_pct}%</span>
                  </div>
                </div>
              </div>

              {/* Diagnostic Finding & Root Cause */}
              <div className="p-3 rounded-xl border bg-primary/5 border-primary/20 space-y-1.5">
                <div className="font-semibold text-primary flex items-center gap-1.5">
                  <Info className="h-4 w-4" /> Why does this inverter rank {selectedInverter.performance_rank > 1 ? `below rank #1` : "highest"}?
                </div>
                <p className="text-foreground leading-relaxed">{selectedInverter.primary_issue_description}</p>
                <div className="pt-1 text-muted-foreground leading-relaxed font-medium">
                  <strong>Recommended O&M Action:</strong> {selectedInverter.recommended_action}
                </div>
              </div>

              {/* Connected String Channels Breakdown */}
              <div className="space-y-2 pt-1">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-primary" /> Connected String Channel Diagnostics ({selectedInverter.string_breakdown.length} channels)
                </div>
                <div className="border rounded-lg overflow-hidden bg-card">
                  <Table className="text-xs">
                    <TableHeader className="bg-muted/50 uppercase">
                      <TableRow>
                        <TableHead>Channel Index</TableHead>
                        <TableHead className="text-right">Voltage (V)</TableHead>
                        <TableHead className="text-right">Current (A)</TableHead>
                        <TableHead className="text-right">Power (kW)</TableHead>
                        <TableHead>Channel Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedInverter.string_breakdown.map((str) => (
                        <TableRow key={str.string_id}>
                          <TableCell className="font-bold font-mono">String #{str.string_index}</TableCell>
                          <TableCell className="text-right font-mono">{str.voltage_v.toFixed(1)} V</TableCell>
                          <TableCell className="text-right font-mono font-medium">{str.current_a.toFixed(2)} A</TableCell>
                          <TableCell className="text-right font-mono">{str.power_kw.toFixed(2)} kW</TableCell>
                          <TableCell>
                            <Badge 
                              variant={str.status === "ok" ? "success" : str.status === "disconnected" ? "destructive" : "warning"}
                              className="text-[10px] capitalize"
                            >
                              {str.status.replace("_", " ")}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {selectedInverter.string_breakdown.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                            No individual string telemetry recorded for this inverter.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
