"use client";

import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";

export function TelemetryChartSection({ telemetry, expectedKw }: { telemetry: any[]; expectedKw: number }) {
  const [metric, setMetric] = useState<string>("power");

  // Build list of available metric options
  const defaultMetrics = [
    { id: "power", key: "ac_power_kw", stroke: "hsl(var(--primary))", label: "Power", unit: "kW", showExpected: true },
    { id: "generation", key: "daily_generation_kwh", stroke: "#22c55e", label: "Generation", unit: "kWh", showExpected: false },
    { id: "temperature", key: "temperature_c", stroke: "#f97316", label: "Temperature", unit: "°C", showExpected: false },
    { id: "efficiency", key: "efficiency_pct", stroke: "#a855f7", label: "Efficiency", unit: "%", showExpected: false },
    { id: "frequency", key: "frequency_hz", stroke: "#06b6d4", label: "Frequency", unit: "Hz", showExpected: false },
    { id: "power_factor", key: "power_factor", stroke: "#ec4899", label: "Power Factor", unit: "", showExpected: false },
    { id: "reactive_power", key: "reactive_power_kvar", stroke: "#8b5cf6", label: "Reactive Power", unit: "kVar", showExpected: false },
    { id: "voltage_r", key: "voltage_r_v", stroke: "#eab308", label: "Voltage R", unit: "V", showExpected: false },
    { id: "current_r", key: "current_r_a", stroke: "#14b8a6", label: "Current R", unit: "A", showExpected: false },
    { id: "battery_soc", key: "battery_soc_pct", stroke: "#10b981", label: "Battery SOC", unit: "%", showExpected: false },
  ];

  // Dynamically append any vendor metrics from JSONB
  const availableMetrics = [...defaultMetrics];
  if (telemetry.length > 0) {
    const sample = telemetry[0];
    const vendorMetrics = sample.metrics || {};
    Object.keys(vendorMetrics).forEach((vk) => {
      if (!availableMetrics.some((m) => m.id === `metrics.${vk}`)) {
        const label = vk.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        availableMetrics.push({
          id: `metrics.${vk}`,
          key: `metrics.${vk}`,
          stroke: "#f43f5e",
          label: label,
          unit: "",
          showExpected: false,
        });
      }
    });
  }

  const activeConfig = availableMetrics.find((m) => m.id === metric) || availableMetrics[0];

  // Group by hour and aggregate
  const hourlyDataMap = new Map<string, { sum: number; count: number }>();

  for (const t of telemetry) {
    const h = new Date(t.timestamp).toISOString().slice(0, 13) + ":00:00Z";
    const existing = hourlyDataMap.get(h) ?? { sum: 0, count: 0 };
    
    let val = 0;
    if (activeConfig.key.startsWith("metrics.")) {
      const subKey = activeConfig.key.split(".")[1];
      val = t.metrics ? Number(t.metrics[subKey] || 0) : 0;
    } else {
      val = Number(t[activeConfig.key] || 0);
    }

    existing.sum += val;
    existing.count += 1;
    hourlyDataMap.set(h, existing);
  }

  const chartData = Array.from(hourlyDataMap.entries()).sort().map(([timestamp, data]) => {
    const avgVal = data.count > 0 ? data.sum / data.count : 0;
    return {
      timestamp,
      val: +avgVal.toFixed(2),
      expectedPower: +(expectedKw || 0).toFixed(2)
    };
  });

  return (
    <div className="space-y-4" data-testid="telemetry-chart-section">
      <div className="flex flex-wrap gap-1.5 justify-end">
        {availableMetrics.map((m) => (
          <Button
            key={m.id}
            size="sm"
            variant={metric === m.id ? "default" : "outline"}
            onClick={() => setMetric(m.id)}
            className="text-xs h-7 px-2.5 capitalize"
          >
            {m.label}
          </Button>
        ))}
      </div>

      <div className="h-[280px]">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="telemetryMetricGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={activeConfig.stroke} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={activeConfig.stroke} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis 
                dataKey="timestamp" 
                tickFormatter={(t) => {
                  try {
                    return format(parseISO(t), "HH:mm");
                  } catch {
                    return "";
                  }
                }} 
                tickLine={false} 
                axisLine={false} 
              />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                labelFormatter={(t) => {
                  try {
                    return format(parseISO(String(t)), "MMM d, HH:mm");
                  } catch {
                    return String(t);
                  }
                }}
                formatter={(v: number, name) => [`${v} ${activeConfig.unit}`, name === "expectedPower" ? "Expected Power" : activeConfig.label]}
              />
              {activeConfig.showExpected && (
                <Area type="monotone" dataKey="expectedPower" stroke="hsl(var(--muted-foreground))" fill="url(#expGrad)" strokeDasharray="4 4" />
              )}
              <Area type="monotone" dataKey="val" stroke={activeConfig.stroke} fill="url(#telemetryMetricGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-sm text-muted-foreground h-full flex items-center justify-center border rounded-lg">
            No telemetry available.
          </div>
        )}
      </div>
    </div>
  );
}
