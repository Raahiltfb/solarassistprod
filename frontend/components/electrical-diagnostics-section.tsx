"use client";

import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, parseISO, subDays, startOfDay } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

interface ElectricalProps {
  inverterId: string;
  latestTelemetry: any;
}

export function ElectricalDiagnosticsSection({ inverterId, latestTelemetry }: ElectricalProps) {
  const sb = createClient();
  const [range, setRange] = useState<"today" | "week" | "month" | "year">("today");
  const [metric, setMetric] = useState<string>("voltage_r_v");
  const [telemetry, setTelemetry] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Group metrics logically
  const acGroup = [
    { key: "voltage_r_v", label: "Phase R Voltage", unit: "V", stroke: "#eab308" },
    { key: "voltage_s_v", label: "Phase S Voltage", unit: "V", stroke: "#a855f7" },
    { key: "voltage_t_v", label: "Phase T Voltage", unit: "V", stroke: "#f43f5e" },
    { key: "current_r_a", label: "Phase R Current", unit: "A", stroke: "#3b82f6" },
    { key: "current_s_a", label: "Phase S Current", unit: "A", stroke: "#10b981" },
    { key: "current_t_a", label: "Phase T Current", unit: "A", stroke: "#f97316" },
    { key: "frequency_hz", label: "Grid Frequency", unit: "Hz", stroke: "#06b6d4" },
    { key: "power_factor", label: "Power Factor", unit: "", stroke: "#ec4899" },
    { key: "reactive_power_kvar", label: "Reactive Power", unit: "kVar", stroke: "#8b5cf6" },
    { key: "apparent_power_kva", label: "Apparent Power", unit: "kVA", stroke: "#14b8a6" }
  ];

  const dcGroup = [
    { key: "dc_power_kw", label: "DC Input Power", unit: "kW", stroke: "#f59e0b" },
    { key: "metrics.dcBus", label: "DC Bus Voltage", unit: "V", stroke: "#10b981" },
    { key: "metrics.dcBusHalf", label: "DC Bus Half Voltage", unit: "V", stroke: "#6366f1" }
  ];

  const healthGroup = [
    { key: "temperature_c", label: "Core Temperature", unit: "°C", stroke: "#ef4444" },
    { key: "efficiency_pct", label: "OEM Conversion Efficiency", unit: "%", stroke: "#a855f7" }
  ];

  const batteryGroup = [
    { key: "battery_soc_pct", label: "Battery SOC", unit: "%", stroke: "#22c55e" },
    { key: "battery_soh_pct", label: "Battery SOH", unit: "%", stroke: "#10b981" },
    { key: "battery_power_kw", label: "Battery Power", unit: "kW", stroke: "#f59e0b" },
    { key: "battery_voltage_v", label: "Battery Voltage", unit: "V", stroke: "#3b82f6" },
    { key: "battery_current_a", label: "Battery Current", unit: "A", stroke: "#ec4899" }
  ];

  const loadGroup = [
    { key: "load_power_kw", label: "Household Load Power", unit: "kW", stroke: "#8b5cf6" },
    { key: "grid_purchased_today_kwh", label: "Grid Purchased Today", unit: "kWh", stroke: "#ec4899" },
    { key: "grid_sell_today_kwh", label: "Grid Sold Today", unit: "kWh", stroke: "#14b8a6" },
    { key: "load_today_kwh", label: "Household Energy Today", unit: "kWh", stroke: "#f43f5e" }
  ];

  // Detect which dynamic categories actually exist in telemetry payload
  const hasBattery = latestTelemetry && latestTelemetry.battery_soc_pct !== null && latestTelemetry.battery_soc_pct !== undefined;
  const hasLoad = latestTelemetry && latestTelemetry.load_power_kw !== null && latestTelemetry.load_power_kw !== undefined;

  // Filter available diagnostic metrics
  const availableGroups = [
    { name: "AC Electrical Parameters", items: acGroup },
    { name: "DC Parameters", items: dcGroup },
    { name: "Inverter Device Health", items: healthGroup }
  ];
  if (hasBattery) availableGroups.push({ name: "Battery Storage", items: batteryGroup });
  if (hasLoad) availableGroups.push({ name: "Load & Grid Exchange", items: loadGroup });

  const allMetrics = [...acGroup, ...dcGroup, ...healthGroup, ...batteryGroup, ...loadGroup];
  const activeConfig = allMetrics.find((m) => m.key === metric) || acGroup[0];

  useEffect(() => {
    async function loadTelemetry() {
      setLoading(true);
      try {
        let startDate = new Date();
        if (range === "today") startDate = startOfDay(new Date());
        else if (range === "week") startDate = subDays(startOfDay(new Date()), 7);
        else if (range === "month") startDate = subDays(startOfDay(new Date()), 30);
        else startDate = subDays(startOfDay(new Date()), 365);

        const { data } = await sb
          .from("telemetry")
          .select("*")
          .eq("inverter_id", inverterId)
          .gte("timestamp", startDate.toISOString())
          .order("timestamp", { ascending: true });

        setTelemetry(data ?? []);
      } catch (err) {
        console.error("Failed to load electrical diagnostics:", err);
      }
      setLoading(false);
    }
    loadTelemetry();
  }, [inverterId, range]);

  // Format data for chart
  function getMetricValue(row: any, keyPath: string) {
    if (keyPath.startsWith("metrics.")) {
      const field = keyPath.split(".")[1];
      return row.metrics ? Number(row.metrics[field] || 0) : 0;
    }
    return Number(row[keyPath] || 0);
  }

  const chartData = telemetry.map((row) => ({
    timestamp: row.timestamp,
    val: getMetricValue(row, activeConfig.key)
  }));

  // Calculate freshness badge status
  function getFreshnessBadge(lastUpdate: string) {
    if (!lastUpdate) return <Badge variant="outline">Offline</Badge>;
    const diffMinutes = (Date.now() - new Date(lastUpdate).getTime()) / 60000;
    if (diffMinutes < 20) {
      return <Badge variant="success" className="animate-pulse">Fresh</Badge>;
    } else if (diffMinutes < 60) {
      return <Badge variant="warning">Delayed</Badge>;
    } else if (diffMinutes < 1440) {
      return <Badge variant="secondary">Stale</Badge>;
    } else {
      return <Badge variant="destructive">Offline</Badge>;
    }
  }

  return (
    <div className="space-y-4" data-testid="electrical-diagnostics-section">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-accent/30 p-3.5 rounded-xl border border-border/40">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>Last Updated: <b>{latestTelemetry.timestamp ? formatDateTime(latestTelemetry.timestamp) : "—"}</b></span>
          {getFreshnessBadge(latestTelemetry.timestamp)}
        </div>

        <div className="flex items-center gap-1.5">
          {(["today", "week", "month", "year"] as const).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? "default" : "outline"}
              onClick={() => setRange(r)}
              className="text-xs h-7 px-3 capitalize"
            >
              {r}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar categories */}
        <div className="md:col-span-1 space-y-4 border-r border-border/40 pr-4">
          {availableGroups.map((g) => (
            <div key={g.name} className="space-y-1.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block px-2">{g.name}</span>
              <div className="flex flex-col gap-0.5">
                {g.items.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMetric(m.key)}
                    className={`text-left text-xs px-2.5 py-1.5 rounded-md font-medium transition-colors ${
                      metric === m.key
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "hover:bg-accent/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Chart View */}
        <div className="md:col-span-3 space-y-3">
          <div className="flex justify-between items-center px-1">
            <h5 className="text-sm font-semibold">{activeConfig.label} ({activeConfig.unit})</h5>
            {telemetry.length > 0 && (
              <span className="text-xs font-mono text-muted-foreground">
                Current: <b>{getMetricValue(telemetry[telemetry.length - 1], activeConfig.key)} {activeConfig.unit}</b>
              </span>
            )}
          </div>

          {loading ? (
            <div className="h-[280px] flex items-center justify-center border border-dashed rounded-xl bg-card">
              <span className="text-xs text-muted-foreground animate-pulse">Loading electrical telemetry data...</span>
            </div>
          ) : telemetry.length > 0 ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="elecMetricGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={activeConfig.stroke} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={activeConfig.stroke} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={(t) => {
                      try {
                        return format(parseISO(t), range === "today" ? "HH:mm" : "d MMM");
                      } catch {
                        return "";
                      }
                    }} 
                    tickLine={false} 
                    axisLine={false} 
                    className="text-[10px] fill-muted-foreground"
                  />
                  <YAxis tickLine={false} axisLine={false} className="text-[10px] fill-muted-foreground" />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                    labelFormatter={(t) => {
                      try {
                        return format(parseISO(String(t)), "MMM d, yyyy HH:mm");
                      } catch {
                        return String(t);
                      }
                    }}
                    formatter={(v: number) => [`${v} ${activeConfig.unit}`, activeConfig.label]}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="val" 
                    stroke={activeConfig.stroke} 
                    fill="url(#elecMetricGrad)" 
                    strokeWidth={2} 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[280px] flex items-center justify-center border border-dashed rounded-xl bg-card">
              <span className="text-xs text-muted-foreground">No telemetry diagnostics logged for this period.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
