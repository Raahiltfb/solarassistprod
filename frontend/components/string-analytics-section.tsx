"use client";

import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, parseISO, subDays, startOfDay } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function StringAnalyticsSection({ inverters }: { inverters: any[] }) {
  const sb = createClient();

  const [selectedInvId, setSelectedInvId] = useState<string>(inverters[0]?.id || "");
  const [strings, setStrings] = useState<any[]>([]);
  const [selectedStrId, setSelectedStrId] = useState<string>("");
  const [range, setRange] = useState<"today" | "week" | "month" | "year">("today");
  
  const [telemetry, setTelemetry] = useState<any[]>([]);
  const [metric, setMetric] = useState<"voltage_v" | "current_a" | "power_kw">("voltage_v");
  const [loading, setLoading] = useState<boolean>(false);

  // Fetch strings when inverter changes - Enforcing strict numeric sorting
  useEffect(() => {
    if (!selectedInvId) return;
    async function loadStrings() {
      const { data } = await sb
        .from("strings")
        .select("id, string_index")
        .eq("inverter_id", selectedInvId);
      
      // Enforce strict numeric sorting on string_index (ascending)
      const strList = (data ?? []).sort((a, b) => Number(a.string_index) - Number(b.string_index));
      setStrings(strList);
      
      if (strList.length > 0) {
        setSelectedStrId(strList[0].id);
      } else {
        setSelectedStrId("");
      }
    }
    loadStrings();
  }, [selectedInvId]);

  // Fetch string telemetry when string or range changes
  useEffect(() => {
    if (!selectedStrId) {
      setTelemetry([]);
      return;
    }
    async function loadTelemetry() {
      setLoading(true);
      try {
        let startDate = new Date();
        if (range === "today") startDate = startOfDay(new Date());
        else if (range === "week") startDate = subDays(startOfDay(new Date()), 7);
        else if (range === "month") startDate = subDays(startOfDay(new Date()), 30);
        else startDate = subDays(startOfDay(new Date()), 365);

        const { data } = await sb
          .from("string_telemetry")
          .select("*")
          .eq("string_id", selectedStrId)
          .gte("timestamp", startDate.toISOString())
          .order("timestamp", { ascending: true });

        setTelemetry(data ?? []);
      } catch (err) {
        console.error("Failed to load string telemetry:", err);
      }
      setLoading(false);
    }
    loadTelemetry();
  }, [selectedStrId, range]);

  const defaultMetrics = [
    { key: "voltage_v", label: "Voltage", unit: "V", stroke: "#eab308" },
    { key: "current_a", label: "Current", unit: "A", stroke: "#10b981" },
    { key: "power_kw", label: "Power", unit: "kW", stroke: "hsl(var(--primary))" }
  ];

  const activeMetricConfig = defaultMetrics.find((m) => m.key === metric) || defaultMetrics[0];

  const chartData = telemetry.map((row) => ({
    timestamp: row.timestamp,
    val: Number(row[activeMetricConfig.key] || 0)
  }));

  return (
    <div className="space-y-4" data-testid="string-diagnostics-section">
      <div className="flex flex-wrap items-center gap-4 justify-between bg-accent/30 p-4 rounded-xl border border-border/40">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-[180px]">
            <Select value={selectedInvId} onValueChange={setSelectedInvId}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Select inverter" /></SelectTrigger>
              <SelectContent>
                {inverters.map((inv) => (
                  <SelectItem key={inv.id} value={inv.id}>
                    {inv.oem_device_id} ({inv.model})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {strings.length > 0 && (
            <div className="w-[120px]">
              <Select value={selectedStrId} onValueChange={setSelectedStrId}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Select string" /></SelectTrigger>
                <SelectContent>
                  {strings.map((str) => (
                    <SelectItem key={str.id} value={str.id}>
                      String #{str.string_index}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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

      {loading ? (
        <div className="h-[280px] flex items-center justify-center border border-dashed rounded-xl bg-card">
          <span className="text-xs text-muted-foreground animate-pulse">Loading string telemetry...</span>
        </div>
      ) : telemetry.length > 0 ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            {defaultMetrics.map((m) => (
              <Button
                key={m.key}
                size="sm"
                variant={metric === m.key ? "default" : "outline"}
                onClick={() => setMetric(m.key as any)}
                className="text-xs h-7 px-3"
              >
                {m.label} ({m.unit})
              </Button>
            ))}
          </div>

          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="strMetricGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={activeMetricConfig.stroke} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={activeMetricConfig.stroke} stopOpacity={0} />
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
                  formatter={(v: number) => [`${v} ${activeMetricConfig.unit}`, activeMetricConfig.label]}
                />
                <Area 
                  type="monotone" 
                  dataKey="val" 
                  stroke={activeMetricConfig.stroke} 
                  fill="url(#strMetricGrad)" 
                  strokeWidth={2} 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="h-[280px] flex items-center justify-center border border-dashed rounded-xl bg-card">
          <span className="text-xs text-muted-foreground">No historical string telemetry found for this time range.</span>
        </div>
      )}
    </div>
  );
}
