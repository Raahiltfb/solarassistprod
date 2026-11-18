"use client";

import { useState, useEffect, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AlertTriangle, ShieldAlert, Zap, ArrowRight, Wrench, CheckCircle2, Filter, Info, LineChart, HelpCircle, Eye } from "lucide-react";
import { analyzeStringAnomalies, calculateMedian, StringAnomaly, AnomalyType } from "@/lib/string-anomaly-engine";
import { formatDateTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { ResponsiveContainer, LineChart as ReLineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceArea } from "recharts";

export interface MultiStringNavigationContext {
  inverterId?: string;
  metric?: "voltage_v" | "current_a" | "power_kw";
  stringIndex?: number;
}

export function StringAnomalyDiagnosticSection({
  telemetry,
  strings,
  inverters,
  sites,
  initialAnomalies,
  onNavigateToTab,
}: {
  telemetry: any[];
  strings: any[];
  inverters: any[];
  sites: any[];
  initialAnomalies?: StringAnomaly[];
  onNavigateToTab?: (tab: string, context?: MultiStringNavigationContext) => void;
}) {
  const sb = createClient();

  const anomalies: StringAnomaly[] = useMemo(() => {
    if (initialAnomalies && initialAnomalies.length > 0) {
      return initialAnomalies;
    }
    return analyzeStringAnomalies(telemetry, strings, inverters, sites);
  }, [initialAnomalies, telemetry, strings, inverters, sites]);

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
        description: `${anomaly.recommended_action}\n\nTechnical 3-Way Benchmark Details:\n- Actual Current: ${anomaly.actual_current_a}A\n- Peer Median: ${anomaly.benchmark_current_a}A\n- Historical Self Baseline: ${anomaly.historical_current_a}A\n- Expected Design Target: ${anomaly.expected_current_a}A\n- Peer Deviation: ${anomaly.deviation_pct}%\n- Historical Deviation: ${anomaly.historical_deviation_pct}%\n- Persistence: ${anomaly.duration_mins} mins\n- Peers Included: ${anomaly.peer_strings_included.join(", ")}\n- Exclusion Rationale: ${anomaly.exclusion_reason || "None"}`,
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
  const [daylightFilter, setDaylightFilter] = useState<boolean>(true);
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
    setDaylightFilter(true);
  }

  // Format persistence duration nicely (e.g. "72h (3 days)")
  function formatPersistence(mins?: number) {
    if (!mins || mins <= 0) return "0 mins";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hrs < 24) {
      return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs} hrs`;
    }
    const days = (mins / 1440).toFixed(1);
    return `${hrs}h (${days}d)`;
  }

  // Generate timeseries data from actual recorded string telemetry points
  const stringHistoryPoints = selectedAnomalyForChart
    ? telemetry
        .filter((t) => t.string_id === selectedAnomalyForChart.string_id)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    : [];

  const rawChartData = stringHistoryPoints.map((pt) => {
    const ts = pt.timestamp;
    const dateObj = new Date(ts);
    const timeStr = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    const dateStr = dateObj.toLocaleDateString([], { month: "short", day: "numeric" });
    const fullLabel = `${dateStr} ${timeStr}`;

    // Compute sibling strings median at this exact timestamp
    const siblingPoints = telemetry.filter(
      (t) => t.timestamp === ts && t.string_id !== pt.string_id && (t.voltage_v || 0) > 50
    );
    const validCurrents = siblingPoints.map((t) => Number(t.current_a || 0)).filter((c) => c > 0.2);
    const validVoltages = siblingPoints.map((t) => Number(t.voltage_v || 0)).filter((v) => v > 50);

    const actualCurr = Number(pt.current_a || 0);
    const actualVolt = Number(pt.voltage_v || 0);

    // Daylight operation detection: true when peers or string is active
    const isOperating = validVoltages.length > 0 || actualVolt > 50 || actualCurr > 0.2;

    const peerCurr = validCurrents.length > 0
      ? calculateMedian(validCurrents)
      : (isOperating ? (selectedAnomalyForChart?.benchmark_current_a ?? 0) : 0);
    const peerVolt = validVoltages.length > 0
      ? calculateMedian(validVoltages)
      : (isOperating ? (selectedAnomalyForChart?.benchmark_voltage_v ?? 0) : 0);

    return {
      timestamp: ts,
      time: fullLabel,
      timeOnly: timeStr,
      isOperating,
      actualCurrent: Number(actualCurr.toFixed(2)),
      peerMedianCurrent: Number(peerCurr.toFixed(2)),
      historicalCurrent: Number((selectedAnomalyForChart?.historical_current_a ?? peerCurr).toFixed(2)),
      actualVoltage: Number(actualVolt.toFixed(1)),
      peerMedianVoltage: Number(peerVolt.toFixed(1)),
      historicalVoltage: Number((selectedAnomalyForChart?.historical_voltage_v ?? peerVolt).toFixed(1)),
    };
  });

  // Filter night time noise when daylightFilter is active
  const chartData = daylightFilter
    ? rawChartData.filter((d) => d.isOperating && (d.actualVoltage > 30 || d.peerMedianVoltage > 30))
    : rawChartData;

  const currentValues = chartData.flatMap((d) => [d.actualCurrent, d.peerMedianCurrent]).filter((v) => typeof v === "number" && !isNaN(v) && v > 0);
  const maxCurrent = currentValues.length > 0 ? Math.max(...currentValues) : 10;
  const yDomainCurrent: [number, number] = [0, Math.ceil(maxCurrent * 1.25) || 10];

  const voltageValues = chartData.flatMap((d) => [d.actualVoltage, d.peerMedianVoltage]).filter((v) => typeof v === "number" && !isNaN(v) && v > 50);
  const minVoltage = voltageValues.length > 0 ? Math.min(...voltageValues) : 300;
  const maxVoltage = voltageValues.length > 0 ? Math.max(...voltageValues) : 700;
  const yDomainVoltage: [number, number] = [
    Math.max(0, Math.floor(minVoltage * 0.9)),
    Math.ceil(maxVoltage * 1.1) || 800,
  ];

  // Accurately compute the anomaly window on the X-axis from genuine anomaly timestamps and telemetry deviations
  const anomalyWindow = useMemo(() => {
    if (!selectedAnomalyForChart || chartData.length === 0) return null;

    const firstMs = new Date(selectedAnomalyForChart.first_detected_at).getTime();
    const lastMs = new Date(selectedAnomalyForChart.last_detected_at).getTime();

    // 1. Check points directly within [first_detected_at, last_detected_at]
    const pointsInWindow = chartData.filter((d) => {
      const ptMs = new Date(d.timestamp).getTime();
      return ptMs >= firstMs && ptMs <= lastMs;
    });

    if (pointsInWindow.length > 0) {
      return {
        x1: pointsInWindow[0].time,
        x2: pointsInWindow[pointsInWindow.length - 1].time,
      };
    }

    // 2. Identify the actual physical drop in chartData
    const isVoltage = selectedAnomalyForChart.type === "voltage_droop";
    const deviatingPoints = chartData.filter((d) => {
      if (isVoltage) {
        return d.peerMedianVoltage > 150 && (d.peerMedianVoltage - d.actualVoltage) >= 30;
      }
      return d.peerMedianCurrent >= 1.5 && (d.peerMedianCurrent - d.actualCurrent) >= 1.5;
    });

    if (deviatingPoints.length > 0) {
      return {
        x1: deviatingPoints[0].time,
        x2: deviatingPoints[deviatingPoints.length - 1].time,
      };
    }

    // 3. Fallback: Closest chart points to first_detected_at and last_detected_at
    let closestStart = chartData[0];
    let closestEnd = chartData[chartData.length - 1];
    let minDiffStart = Infinity;
    let minDiffEnd = Infinity;

    for (const pt of chartData) {
      const ptMs = new Date(pt.timestamp).getTime();
      const diffStart = Math.abs(ptMs - firstMs);
      const diffEnd = Math.abs(ptMs - lastMs);
      if (diffStart < minDiffStart) {
        minDiffStart = diffStart;
        closestStart = pt;
      }
      if (diffEnd < minDiffEnd) {
        minDiffEnd = diffEnd;
        closestEnd = pt;
      }
    }

    return {
      x1: closestStart.time,
      x2: closestEnd.time,
    };
  }, [selectedAnomalyForChart, chartData]);

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
                    {anom.string_index > 0 ? `String #${anom.string_index}` : "All Strings"}
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-foreground capitalize flex items-center gap-1.5">
                      {anom.type === "inverter_offline" ? (
                        <span className="text-destructive font-bold flex items-center gap-1">
                          <Zap className="h-3.5 w-3.5 fill-destructive" /> Inverter Offline
                        </span>
                      ) : (
                        anom.type.replace("_", " ")
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground break-words leading-tight max-w-[280px]">
                      {anom.recommended_action}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <div className="font-bold text-foreground">{anom.type === "inverter_offline" ? "0 A" : `${anom.actual_current_a} A`}</div>
                    <div className="text-[10px] text-muted-foreground flex items-center justify-end gap-1">
                      <span>{anom.type === "inverter_offline" ? "Offline" : `Median: ${anom.benchmark_current_a} A`}</span>
                      {anom.type !== "inverter_offline" && (
                        <button 
                          onClick={() => setSelectedBenchmarkDetails(anom)} 
                          className="text-primary hover:underline focus:outline-none"
                          title="Why this expected value?"
                        >
                          <HelpCircle className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <div className="font-bold text-foreground">{anom.type === "inverter_offline" ? "0 V" : `${anom.actual_voltage_v} V`}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {anom.type === "inverter_offline" ? "Offline" : `Median: ${anom.benchmark_voltage_v} V`}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <span className={`font-bold ${anom.type === "inverter_offline" || anom.deviation_pct < -15 || anom.voltage_deviation_pct < -10 ? "text-destructive" : "text-amber-600"}`}>
                      {anom.type === "inverter_offline"
                        ? "OFFLINE"
                        : anom.type === "voltage_droop"
                        ? `${anom.voltage_deviation_pct}% V`
                        : anom.deviation_pct < 0
                        ? `${anom.deviation_pct.toFixed(0)}% I`
                        : `-${Math.abs(anom.deviation_pct).toFixed(0)}% I`}
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
        <DialogContent className="max-w-4xl sm:max-w-4xl">
          {selectedAnomalyForChart && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base flex flex-wrap items-center justify-between gap-3">
                  <span className="font-semibold text-foreground">
                    Visual Evidence: {selectedAnomalyForChart.inverter_name} — String #{selectedAnomalyForChart.string_index}
                  </span>
                  <div className="flex items-center gap-2">
                    {/* Daylight filter toggle */}
                    <div className="flex items-center bg-muted p-0.5 rounded border text-[11px]">
                      <button
                        onClick={() => setDaylightFilter(true)}
                        className={`px-2 py-0.5 font-medium rounded transition-colors ${daylightFilter ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"}`}
                        title="Show daylight operating hours only (excludes night 0V/0A drops)"
                      >
                        Daylight Hours
                      </button>
                      <button
                        onClick={() => setDaylightFilter(false)}
                        className={`px-2 py-0.5 font-medium rounded transition-colors ${!daylightFilter ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"}`}
                        title="Show full 24h day/night cycle"
                      >
                        24h All
                      </button>
                    </div>

                    {/* Metric Mode Toggle */}
                    <div className="flex items-center bg-muted p-0.5 rounded border text-[11px]">
                      <button
                        onClick={() => setChartMetricMode("current")}
                        className={`px-2 py-0.5 font-medium rounded transition-colors ${chartMetricMode === "current" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        Current (A)
                      </button>
                      <button
                        onClick={() => setChartMetricMode("voltage")}
                        className={`px-2 py-0.5 font-medium rounded transition-colors ${chartMetricMode === "voltage" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        Voltage (V)
                      </button>
                    </div>

                    <Badge 
                      variant={selectedAnomalyForChart.severity === "critical" ? "destructive" : "warning"}
                      className="text-xs uppercase font-mono tracking-wider"
                    >
                      {selectedAnomalyForChart.type.replace("_", " ")}
                    </Badge>
                  </div>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  High-resolution string telemetry compared directly against peer-string median baselines across active operating windows.
                </DialogDescription>
              </DialogHeader>

              {/* Crystal Clear Anomaly Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 bg-muted/40 p-3 rounded-xl border border-border/60 text-xs">
                <div className="bg-card/70 p-2.5 rounded-lg border border-border/40 space-y-1">
                  <span className="text-muted-foreground block text-[10px] font-semibold uppercase tracking-wider">
                    {chartMetricMode === "current" ? "Actual String Current" : "Actual String Voltage"}
                  </span>
                  <span className={`text-base font-bold font-mono ${chartMetricMode === "current" ? "text-rose-600 dark:text-rose-400" : "text-sky-600 dark:text-sky-400"}`}>
                    {chartMetricMode === "current" ? `${selectedAnomalyForChart.actual_current_a} A` : `${selectedAnomalyForChart.actual_voltage_v} V`}
                  </span>
                </div>

                <div className="bg-card/70 p-2.5 rounded-lg border border-border/40 space-y-1">
                  <span className="text-muted-foreground block text-[10px] font-semibold uppercase tracking-wider">
                    Peer Median Baseline
                  </span>
                  <span className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {chartMetricMode === "current" ? `${selectedAnomalyForChart.benchmark_current_a} A` : `${selectedAnomalyForChart.benchmark_voltage_v} V`}
                  </span>
                </div>

                <div className="bg-card/70 p-2.5 rounded-lg border border-border/40 space-y-1">
                  <span className="text-muted-foreground block text-[10px] font-semibold uppercase tracking-wider">
                    Historical Self Baseline
                  </span>
                  <span className="text-base font-bold font-mono text-violet-600 dark:text-violet-400">
                    {chartMetricMode === "current" ? `${selectedAnomalyForChart.historical_current_a} A` : `${selectedAnomalyForChart.historical_voltage_v} V`}
                  </span>
                </div>

                <div className="bg-card/70 p-2.5 rounded-lg border border-border/40 space-y-1">
                  <span className="text-muted-foreground block text-[10px] font-semibold uppercase tracking-wider">
                    Peer Deviation
                  </span>
                  <span className="text-base font-bold font-mono text-rose-600 dark:text-rose-400">
                    {selectedAnomalyForChart.deviation_pct}%
                  </span>
                </div>

                <div className="bg-card/70 p-2.5 rounded-lg border border-border/40 space-y-1 col-span-2 sm:col-span-1">
                  <span className="text-muted-foreground block text-[10px] font-semibold uppercase tracking-wider">
                    Persistence Duration
                  </span>
                  <span className="text-base font-bold font-mono text-foreground">
                    {formatPersistence(selectedAnomalyForChart.duration_mins)}
                  </span>
                </div>
              </div>

              {/* Chart Overlay */}
              <div className="w-full pt-2 h-[320px] min-h-[320px]">
                {chartData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6 bg-muted/20 border border-dashed rounded-lg">
                    <Info className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm font-semibold text-foreground">No Timeseries Telemetry Available</p>
                    <p className="text-xs text-muted-foreground max-w-sm mt-1">
                      No string telemetry points were recorded for this channel during the active observation window.
                    </p>
                  </div>
                ) : chartMounted ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <ReLineChart 
                      key={`${selectedAnomalyForChart.id}-${chartMetricMode}-${daylightFilter}`}
                      data={chartData} 
                      margin={{ top: 15, right: 25, left: 15, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis 
                        width={55}
                        domain={chartMetricMode === "current" ? yDomainCurrent : yDomainVoltage} 
                        unit={chartMetricMode === "current" ? " A" : " V"} 
                        tick={{ fontSize: 11 }} 
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", color: "#f8fafc", fontSize: "12px", borderRadius: "8px" }}
                        formatter={(val: any, name: any) => [`${Number(val).toFixed(2)} ${chartMetricMode === "current" ? "A" : "V"}`, name]}
                      />
                      <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                      {anomalyWindow && (
                        <ReferenceArea 
                          x1={anomalyWindow.x1} 
                          x2={anomalyWindow.x2} 
                          fill="rgba(239, 68, 68, 0.12)" 
                          stroke="rgba(239, 68, 68, 0.4)" 
                          label={{ value: "Anomaly Window", fill: "#ef4444", fontSize: 11, position: "insideTopLeft" }} 
                        />
                      )}
                      {chartMetricMode === "current" && (
                        <Line
                          key="actualCurrent"
                          type="monotone"
                          dataKey="actualCurrent"
                          name={`Actual Current (String #${selectedAnomalyForChart.string_index})`}
                          stroke="#ef4444"
                          strokeWidth={2.5}
                          dot={false}
                          activeDot={{ r: 5, fill: "#ef4444" }}
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
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          dot={false}
                          activeDot={{ r: 4, fill: "#10b981" }}
                          isAnimationActive={false}
                        />
                      )}
                      {chartMetricMode === "current" && (
                        <Line
                          key="historicalCurrent"
                          type="monotone"
                          dataKey="historicalCurrent"
                          name="Historical Self Baseline"
                          stroke="#8b5cf6"
                          strokeWidth={1.5}
                          strokeDasharray="2 2"
                          dot={false}
                          activeDot={{ r: 4, fill: "#8b5cf6" }}
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
                          strokeWidth={2.5}
                          dot={false}
                          activeDot={{ r: 5, fill: "#3b82f6" }}
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
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          dot={false}
                          activeDot={{ r: 4, fill: "#10b981" }}
                          isAnimationActive={false}
                        />
                      )}
                      {chartMetricMode === "voltage" && (
                        <Line
                          key="historicalVoltage"
                          type="monotone"
                          dataKey="historicalVoltage"
                          name="Historical Self Baseline"
                          stroke="#8b5cf6"
                          strokeWidth={1.5}
                          strokeDasharray="2 2"
                          dot={false}
                          activeDot={{ r: 4, fill: "#8b5cf6" }}
                          isAnimationActive={false}
                        />
                      )}
                    </ReLineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[320px] flex items-center justify-center text-xs text-muted-foreground">
                    Loading recorded telemetry graph...
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-4 bg-primary/5 p-3 rounded-md border border-primary/20 text-xs">
                <div className="space-y-0.5">
                  <div className="font-semibold text-primary">O&M Engineer Diagnosis:</div>
                  <div className="text-foreground">{selectedAnomalyForChart.recommended_action}</div>
                </div>
                {onNavigateToTab && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const isVoltage = selectedAnomalyForChart.type === "voltage_droop";
                      const targetMetric: "voltage_v" | "current_a" = isVoltage ? "voltage_v" : "current_a";
                      onNavigateToTab("multi-string", {
                        inverterId: selectedAnomalyForChart.inverter_id,
                        metric: targetMetric,
                        stringIndex: selectedAnomalyForChart.string_index,
                      });
                      setSelectedAnomalyForChart(null);
                    }}
                    className="shrink-0 h-8 text-xs gap-1 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
                  >
                    <span>Inspect in Multi-String Analytics</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                )}
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

