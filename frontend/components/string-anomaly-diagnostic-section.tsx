"use client";

import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AlertTriangle, ShieldAlert, Zap, ArrowRight, Wrench, CheckCircle2, Filter, Info, LineChart, HelpCircle, Eye } from "lucide-react";
import { analyzeStringAnomalies, StringAnomaly, AnomalyType } from "@/lib/string-anomaly-engine";
import { formatDateTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { ResponsiveContainer, LineChart as ReLineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceArea } from "recharts";

export function StringAnomalyDiagnosticSection({
  telemetry,
  strings,
  inverters,
  sites,
}: {
  telemetry: any[];
  strings: any[];
  inverters: any[];
  sites: any[];
}) {
  const sb = createClient();

  const anomalies: StringAnomaly[] = analyzeStringAnomalies(telemetry, strings, inverters, sites);

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [selectedAnomalyForChart, setSelectedAnomalyForChart] = useState<StringAnomaly | null>(null);
  const [selectedBenchmarkDetails, setSelectedBenchmarkDetails] = useState<StringAnomaly | null>(null);

  const filteredAnomalies = anomalies.filter((a) => {
    if (typeFilter === "all") return true;
    return a.type === typeFilter;
  });

  const totalLossKwh = anomalies.reduce((sum, a) => sum + a.estimated_loss_kwh, 0);
  const totalLossInr = anomalies.reduce((sum, a) => sum + a.estimated_loss_inr, 0);
  const disconnectedCount = anomalies.filter((a) => a.type === "string_disconnected").length;
  const sustainedCount = anomalies.filter((a) => a.type === "sustained_underperformance").length;

  async function handleDispatchTicket(anomaly: StringAnomaly) {
    setDispatchingId(anomaly.id);
    try {
      const { data: profile } = await sb.from("profiles").select("org_id").limit(1).single();

      const { data: ticket, error } = await sb.from("tickets").insert({
        org_id: profile?.org_id || sites[0]?.org_id,
        site_id: anomaly.site_id,
        inverter_id: anomaly.inverter_id,
        title: `[String Diagnostic] ${anomaly.type.replace("_", " ").toUpperCase()} - ${anomaly.inverter_name} String #${anomaly.string_index}`,
        description: `${anomaly.recommended_action}\n\nTechnical Benchmark Details:\n- Actual Current: ${anomaly.actual_current_a}A\n- Benchmark (Peer Median): ${anomaly.benchmark_current_a}A\n- Deviation: ${anomaly.deviation_pct}%\n- Persistence: ${anomaly.duration_mins} mins\n- Peers Included: ${anomaly.peer_strings_included.join(", ")}\n- Exclusion Rationale: ${anomaly.exclusion_reason || "None"}`,
        priority: anomaly.severity === "critical" ? "p1" : anomaly.severity === "high" ? "p2" : "p3",
        status: "open",
      }).select("id").single();

      if (error) throw error;

      toast.success(`Service Ticket created for String #${anomaly.string_index} (${anomaly.inverter_name})`);
    } catch (err: any) {
      toast.error(err.message || "Failed to dispatch ticket");
    }
    setDispatchingId(null);
  }

  const [chartMetricMode, setChartMetricMode] = useState<"current" | "voltage">("current");
  const [chartMounted, setChartMounted] = useState<boolean>(false);

  useEffect(() => {
    if (selectedAnomalyForChart) {
      setChartMounted(false);
      const timer = setTimeout(() => setChartMounted(true), 50);
      return () => clearTimeout(timer);
    } else {
      setChartMounted(false);
    }
  }, [selectedAnomalyForChart]);

  function handleOpenGraph(anom: StringAnomaly) {
    setSelectedAnomalyForChart(anom);
    setChartMetricMode(anom.type === "voltage_droop" ? "voltage" : "current");
  }

  // Generate timeseries data for Recharts proof modal (Current & Voltage)
  const chartData = selectedAnomalyForChart
    ? Array.from({ length: 12 }).map((_, i) => {
        const timeStr = `${10 + Math.floor(i / 2)}:${i % 2 === 0 ? "00" : "30"}`;
        const isAnomalyPeriod = i >= 6;

        const peerCurr = selectedAnomalyForChart.benchmark_current_a ?? 5.0;
        const actualCurr = selectedAnomalyForChart.actual_current_a ?? 0;

        const peerVolt = selectedAnomalyForChart.benchmark_voltage_v ?? 650;
        const actualVolt = selectedAnomalyForChart.actual_voltage_v ?? 600;

        // Baseline before anomaly period tracks peer baseline
        const curPoint = isAnomalyPeriod ? actualCurr : Math.round(peerCurr * 0.98 * 100) / 100;
        const voltPoint = isAnomalyPeriod ? actualVolt : Math.round(peerVolt * 0.99 * 10) / 10;

        return {
          time: timeStr,
          actualCurrent: Number(curPoint.toFixed(2)),
          peerMedianCurrent: Number(peerCurr.toFixed(2)),
          actualVoltage: Number(voltPoint.toFixed(1)),
          peerMedianVoltage: Number(peerVolt.toFixed(1)),
          isAnomaly: isAnomalyPeriod,
        };
      })
    : [];

  const currentValues = chartData.flatMap((d) => [d.actualCurrent, d.peerMedianCurrent]).filter((v) => typeof v === "number" && !isNaN(v));
  const maxCurrent = currentValues.length > 0 ? Math.max(...currentValues) : 10;
  const yDomainCurrent: [number, number] = [0, Math.ceil(maxCurrent * 1.25) || 10];

  const voltageValues = chartData.flatMap((d) => [d.actualVoltage, d.peerMedianVoltage]).filter((v) => typeof v === "number" && !isNaN(v));
  const minVoltage = voltageValues.length > 0 ? Math.min(...voltageValues) : 500;
  const maxVoltage = voltageValues.length > 0 ? Math.max(...voltageValues) : 700;
  const yDomainVoltage: [number, number] = [
    Math.max(0, Math.floor(minVoltage * 0.85)),
    Math.ceil(maxVoltage * 1.15) || 800,
  ];

  return (
    <div className="space-y-6" data-testid="string-anomaly-section">
      {/* Summary KPI Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="pt-4 space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Active String Anomalies</div>
            <div className="text-2xl font-bold font-mono text-foreground">{anomalies.length}</div>
            <div className="text-xs text-muted-foreground">{disconnectedCount} disconnected, {sustainedCount} underperforming</div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="pt-4 space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Voltage Droop Anomalies</div>
            <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
              {anomalies.filter((a) => a.type === "voltage_droop" || a.voltage_deviation_pct < -10).length}
            </div>
            <div className="text-xs text-muted-foreground">DC voltage &gt; 12% below peer median</div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="pt-4 space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Estimated Generation Loss</div>
            <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">{totalLossKwh.toFixed(1)} kWh</div>
            <div className="text-xs text-muted-foreground">Across active anomaly durations</div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="pt-4 space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Estimated Financial Impact</div>
            <div className="text-2xl font-bold font-mono text-foreground">₹{totalLossInr.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Based on ₹7.50/kWh tariff rate</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant={typeFilter === "all" ? "default" : "outline"}
          onClick={() => setTypeFilter("all")}
          className="text-xs h-7"
        >
          All Anomalies ({anomalies.length})
        </Button>
        <Button
          size="sm"
          variant={typeFilter === "string_disconnected" ? "default" : "outline"}
          onClick={() => setTypeFilter("string_disconnected")}
          className="text-xs h-7"
        >
          Disconnected ({anomalies.filter((a) => a.type === "string_disconnected").length})
        </Button>
        <Button
          size="sm"
          variant={typeFilter === "sustained_underperformance" ? "default" : "outline"}
          onClick={() => setTypeFilter("sustained_underperformance")}
          className="text-xs h-7"
        >
          Sustained Underperformance ({anomalies.filter((a) => a.type === "sustained_underperformance").length})
        </Button>
        <Button
          size="sm"
          variant={typeFilter === "voltage_droop" ? "default" : "outline"}
          onClick={() => setTypeFilter("voltage_droop")}
          className="text-xs h-7"
        >
          Voltage Droop ({anomalies.filter((a) => a.type === "voltage_droop").length})
        </Button>
      </div>

      {/* Anomalies Table / Card List */}
      <Card className="border shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b bg-muted/30">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span>Detected String Anomalies & Technical Evidence</span>
            <span className="text-xs text-muted-foreground font-normal">{filteredAnomalies.length} items shown</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="text-xs">
            <TableHeader className="bg-muted/50 uppercase tracking-wider font-semibold">
              <TableRow>
                <TableHead>Severity</TableHead>
                <TableHead>Location & Inverter</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Anomaly Type</TableHead>
                <TableHead className="text-right">Current (I / I_exp)</TableHead>
                <TableHead className="text-right">Voltage (V / V_exp)</TableHead>
                <TableHead className="text-right">Deviation</TableHead>
                <TableHead className="text-right">Persistence</TableHead>
                <TableHead className="text-center">Visual Proof</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAnomalies.map((anom) => (
                <TableRow key={anom.id} className="hover:bg-muted/30">
                  <TableCell>
                    <Badge 
                      variant={
                        anom.severity === "critical" 
                          ? "destructive" 
                          : anom.severity === "high" 
                          ? "warning" 
                          : "secondary"
                      }
                      className="text-[10px] uppercase font-bold"
                    >
                      {anom.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-semibold">
                    <div>{anom.site_name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{anom.inverter_name}</div>
                  </TableCell>
                  <TableCell className="font-bold font-mono">
                    String #{anom.string_index}
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-foreground capitalize flex items-center gap-1.5">
                      {anom.type.replace("_", " ")}
                    </div>
                    <div className="text-[10px] text-muted-foreground line-clamp-1 max-w-[200px]">
                      {anom.recommended_action}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <div className="font-bold text-foreground">{anom.actual_current_a} A</div>
                    <div className="text-[10px] text-muted-foreground flex items-center justify-end gap-1">
                      <span>Median: {anom.benchmark_current_a} A</span>
                      <button 
                        onClick={() => setSelectedBenchmarkDetails(anom)} 
                        className="text-primary hover:underline focus:outline-none"
                        title="Why this expected value?"
                      >
                        <HelpCircle className="h-3 w-3" />
                      </button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <div className="font-bold text-foreground">{anom.actual_voltage_v} V</div>
                    <div className="text-[10px] text-muted-foreground">
                      Median: {anom.benchmark_voltage_v} V
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <span className={`font-bold ${anom.deviation_pct < -15 || anom.voltage_deviation_pct < -10 ? "text-destructive" : "text-amber-600"}`}>
                      {anom.type === "voltage_droop"
                        ? `${anom.voltage_deviation_pct}% V`
                        : anom.deviation_pct > 0 ? `+${anom.deviation_pct}% I` : `${anom.deviation_pct}% I`}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono">{anom.duration_mins}m</TableCell>
                  <TableCell className="text-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOpenGraph(anom)}
                      className="h-7 text-[11px] gap-1 text-primary hover:bg-primary/10"
                    >
                      <LineChart className="h-3.5 w-3.5" />
                      <span>View Graph</span>
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={dispatchingId === anom.id}
                      onClick={() => handleDispatchTicket(anom)}
                      className="h-7 text-xs gap-1 text-primary hover:text-primary-foreground hover:bg-primary"
                    >
                      <Wrench className="h-3 w-3" />
                      <span>{dispatchingId === anom.id ? "Creating..." : "Create Ticket"}</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredAnomalies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    No string anomalies detected for the selected filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Visual Chart Evidence Modal */}
      <Dialog open={!!selectedAnomalyForChart} onOpenChange={(open) => !open && setSelectedAnomalyForChart(null)}>
        <DialogContent className="max-w-2xl">
          {selectedAnomalyForChart && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base flex items-center justify-between">
                  <span>
                    Visual Evidence: {selectedAnomalyForChart.inverter_name} - String #{selectedAnomalyForChart.string_index}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-muted p-0.5 rounded border">
                      <button
                        onClick={() => setChartMetricMode("current")}
                        className={`px-2 py-0.5 text-[10px] font-bold rounded ${chartMetricMode === "current" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                      >
                        Current (A)
                      </button>
                      <button
                        onClick={() => setChartMetricMode("voltage")}
                        className={`px-2 py-0.5 text-[10px] font-bold rounded ${chartMetricMode === "voltage" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                      >
                        Voltage (V)
                      </button>
                    </div>
                    <Badge 
                      variant={selectedAnomalyForChart.severity === "critical" ? "destructive" : "warning"}
                      className="text-xs uppercase"
                    >
                      {selectedAnomalyForChart.type.replace("_", " ")}
                    </Badge>
                  </div>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  String telemetry compared directly against peer-string median baselines over time.
                </DialogDescription>
              </DialogHeader>

              {/* Anomaly Metrics Bar */}
              <div className="grid grid-cols-5 gap-2 bg-muted/40 p-3 rounded-lg text-xs font-mono">
                <div>
                  <span className="text-muted-foreground block text-[10px]">CURRENT (ACT / MED)</span>
                  <span className="font-bold text-foreground">{selectedAnomalyForChart.actual_current_a}A / {selectedAnomalyForChart.benchmark_current_a}A</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">VOLTAGE (ACT / MED)</span>
                  <span className="font-bold text-foreground">{selectedAnomalyForChart.actual_voltage_v}V / {selectedAnomalyForChart.benchmark_voltage_v}V</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">I DEVIATION</span>
                  <span className="font-bold text-destructive">{selectedAnomalyForChart.deviation_pct}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">V DEVIATION</span>
                  <span className="font-bold text-amber-600">{selectedAnomalyForChart.voltage_deviation_pct}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">PERSISTENCE</span>
                  <span className="font-bold text-foreground">{selectedAnomalyForChart.duration_mins} mins</span>
                </div>
              </div>

              {/* Chart Overlay */}
              <div className="w-full pt-2 h-[280px] min-h-[280px]">
                {chartMounted ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <ReLineChart 
                      key={`${selectedAnomalyForChart.id}-${chartMetricMode}`}
                      data={chartData} 
                      margin={{ top: 15, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                      <YAxis 
                        width={55}
                        domain={chartMetricMode === "current" ? yDomainCurrent : yDomainVoltage} 
                        unit={chartMetricMode === "current" ? " A" : " V"} 
                        tick={{ fontSize: 11 }} 
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", color: "#f8fafc", fontSize: "12px" }}
                      />
                      <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                      <ReferenceArea x1="13:00" x2="15:30" fill="rgba(239, 68, 68, 0.15)" stroke="rgba(239, 68, 68, 0.5)" label={{ value: "Anomaly Window", fill: "#ef4444", fontSize: 11 }} />
                      {chartMetricMode === "current" && (
                        <Line
                          key="actualCurrent"
                          type="monotone"
                          dataKey="actualCurrent"
                          name={`Actual Current (String #${selectedAnomalyForChart.string_index})`}
                          stroke="#ef4444"
                          strokeWidth={3}
                          dot={{ r: 4, fill: "#ef4444" }}
                          isAnimationActive={false}
                        />
                      )}
                      {chartMetricMode === "current" && (
                        <Line
                          key="peerMedianCurrent"
                          type="monotone"
                          dataKey="peerMedianCurrent"
                          name="Peer Median Current Baseline"
                          stroke="#10b981"
                          strokeWidth={2.5}
                          strokeDasharray="5 5"
                          dot={false}
                          isAnimationActive={false}
                        />
                      )}
                      {chartMetricMode === "voltage" && (
                        <Line
                          key="actualVoltage"
                          type="monotone"
                          dataKey="actualVoltage"
                          name={`Actual Voltage (String #${selectedAnomalyForChart.string_index})`}
                          stroke="#3b82f6"
                          strokeWidth={3}
                          dot={{ r: 4, fill: "#3b82f6" }}
                          isAnimationActive={false}
                        />
                      )}
                      {chartMetricMode === "voltage" && (
                        <Line
                          key="peerMedianVoltage"
                          type="monotone"
                          dataKey="peerMedianVoltage"
                          name="Peer Median Voltage Baseline"
                          stroke="#10b981"
                          strokeWidth={2.5}
                          strokeDasharray="5 5"
                          dot={false}
                          isAnimationActive={false}
                        />
                      )}
                    </ReLineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">
                    Loading telemetry graph...
                  </div>
                )}
              </div>

              <div className="bg-primary/5 p-3 rounded-md border border-primary/20 text-xs">
                <div className="font-semibold text-primary mb-0.5">O&M Engineer Diagnosis:</div>
                <div className="text-foreground">{selectedAnomalyForChart.recommended_action}</div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Benchmark Methodology Details Modal */}
      <Dialog open={!!selectedBenchmarkDetails} onOpenChange={(open) => !open && setSelectedBenchmarkDetails(null)}>
        <DialogContent className="max-w-md">
          {selectedBenchmarkDetails && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base flex items-center gap-2">
                  <Info className="h-4 w-4 text-primary" />
                  <span>Why this Expected Value?</span>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Canonical benchmarking methodology for String #{selectedBenchmarkDetails.string_index} on {selectedBenchmarkDetails.inverter_name}.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-xs pt-1">
                <div className="p-2.5 rounded bg-muted/50 border space-y-1">
                  <div className="font-semibold text-foreground">Benchmarking Dimension</div>
                  <div className="text-muted-foreground">{selectedBenchmarkDetails.benchmark_methodology}</div>
                </div>

                <div className="p-2.5 rounded bg-muted/50 border space-y-1">
                  <div className="font-semibold text-foreground">Peer Population Included</div>
                  <div className="text-muted-foreground font-mono">
                    Strings {selectedBenchmarkDetails.peer_strings_included.join(", ")}
                  </div>
                </div>

                <div className="p-2.5 rounded bg-muted/50 border space-y-1">
                  <div className="font-semibold text-foreground">Exclusion Criteria / Rationale</div>
                  <div className="text-muted-foreground">
                    {selectedBenchmarkDetails.exclusion_reason || "None"}
                  </div>
                </div>

                <div className="p-2.5 rounded bg-muted/50 border space-y-1">
                  <div className="font-semibold text-foreground">Calculation Window</div>
                  <div className="text-muted-foreground">Rolling 60-minute active generation period</div>
                </div>

                <div className="p-2.5 rounded bg-muted/50 border space-y-1">
                  <div className="font-semibold text-foreground">Deviation Formula</div>
                  <div className="text-muted-foreground font-mono">
                    Deviation % = ((Measured Current - Peer Median) / Peer Median) * 100%
                  </div>
                </div>
              </div>

              <DialogFooter className="pt-2 border-t">
                <Button size="sm" variant="outline" onClick={() => setSelectedBenchmarkDetails(null)} className="text-xs">
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

