"use client";

import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { format, parseISO, subDays, startOfDay } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const STRING_COLORS = [
  "#3b82f6", // Blue
  "#eab308", // Yellow
  "#10b981", // Green
  "#ec4899", // Pink
  "#f97316", // Orange
  "#8b5cf6", // Purple
  "#06b6d4", // Cyan
  "#ef4444", // Red
  "#a855f7", // Violet
  "#14b8a6", // Teal
  "#f43f5e", // Rose
  "#6366f1", // Indigo
  "#84cc16", // Lime
  "#e11d48", // Crimson
  "#4f46e5"  // Royal Blue
];

export function StringAnalyticsSection({ inverters }: { inverters: any[] }) {
  const sb = createClient();

  const [selectedInvId, setSelectedInvId] = useState<string>(inverters[0]?.id || "");
  const [strings, setStrings] = useState<any[]>([]);
  const [selectedStrIds, setSelectedStrIds] = useState<string[]>([]);
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
        // Select all strings by default for comprehensive monitoring
        setSelectedStrIds(strList.map((s) => s.id));
      } else {
        setSelectedStrIds([]);
      }
    }
    loadStrings();
  }, [selectedInvId]);

  // Fetch string telemetry when string or range changes
  useEffect(() => {
    if (selectedStrIds.length === 0) {
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
          .select("timestamp, string_id, voltage_v, current_a, power_kw")
          .in("string_id", selectedStrIds)
          .gte("timestamp", startDate.toISOString())
          .order("timestamp", { ascending: true });

        setTelemetry(data ?? []);
      } catch (err) {
        console.error("Failed to load string telemetry:", err);
      }
      setLoading(false);
    }
    loadTelemetry();
  }, [selectedStrIds, range]);

  const defaultMetrics = [
    { key: "voltage_v", label: "Voltage", unit: "V" },
    { key: "current_a", label: "Current", unit: "A" },
    { key: "power_kw", label: "Power", unit: "kW" }
  ];

  const activeMetricConfig = defaultMetrics.find((m) => m.key === metric) || defaultMetrics[0];

  // Group telemetry records by timestamp for Recharts overlay
  const timeMap = new Map<string, Record<string, number>>();
  for (const r of telemetry) {
    const strObj = strings.find((s) => s.id === r.string_id);
    if (!strObj) continue;
    
    const label = `String #${strObj.string_index}`;
    const existing = timeMap.get(r.timestamp) ?? {};
    existing[label] = Number(r[metric] || 0);
    timeMap.set(r.timestamp, existing);
  }

  const chartData = Array.from(timeMap.entries()).map(([timestamp, values]) => ({
    timestamp,
    ...values
  })).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const toggleStringSelection = (id: string) => {
    setSelectedStrIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const selectAllStrings = () => {
    setSelectedStrIds(strings.map((s) => s.id));
  };

  const clearStringSelection = () => {
    setSelectedStrIds([]);
  };

  // Find strings selected for display line elements
  const selectedStringsInfo = strings.filter((s) => selectedStrIds.includes(s.id));

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
            <div className="flex flex-wrap gap-1.5 items-center bg-card/65 px-3 py-1.5 rounded-lg border border-border/50">
              <span className="text-xs text-muted-foreground mr-1.5 font-medium">Strings:</span>
              <button 
                type="button" 
                onClick={selectAllStrings} 
                className="h-6 text-[10px] px-1.5 rounded bg-transparent hover:bg-muted font-medium text-muted-foreground hover:text-foreground transition-all"
              >
                All
              </button>
              <button 
                type="button" 
                onClick={clearStringSelection} 
                className="h-6 text-[10px] px-1.5 rounded bg-transparent hover:bg-muted font-medium text-muted-foreground hover:text-foreground mr-1.5 transition-all"
              >
                Clear
              </button>
              <div className="flex flex-wrap gap-1">
                {strings.map((str) => {
                  const isSelected = selectedStrIds.includes(str.id);
                  return (
                    <button
                      key={str.id}
                      type="button"
                      onClick={() => toggleStringSelection(str.id)}
                      className={`text-xs h-6 px-2.5 rounded font-semibold transition-all duration-150 active:scale-95 ${
                        isSelected 
                          ? "bg-primary text-primary-foreground shadow-sm" 
                          : "bg-background text-muted-foreground border border-border/60 hover:text-foreground hover:bg-accent/40"
                      }`}
                    >
                      #{str.string_index}
                    </button>
                  );
                })}
              </div>
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
        <div className="h-[320px] flex items-center justify-center border border-dashed rounded-xl bg-card">
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

          <div className="h-[320px] bg-card p-4 rounded-xl border border-border/30 shadow-sm">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
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
                />
                <Legend 
                  verticalAlign="top" 
                  height={36} 
                  iconType="circle" 
                  iconSize={8} 
                  wrapperStyle={{ fontSize: 10, fontWeight: 500 }} 
                />
                {selectedStringsInfo.map((str, idx) => (
                  <Line 
                    key={str.id}
                    type="monotone" 
                    dataKey={`String #${str.string_index}`}
                    stroke={STRING_COLORS[idx % STRING_COLORS.length]} 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="h-[320px] flex items-center justify-center border border-dashed rounded-xl bg-card">
          <span className="text-xs text-muted-foreground">No historical string telemetry found for this time range.</span>
        </div>
      )}
    </div>
  );
}

