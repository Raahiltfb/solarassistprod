"use client";

import { useState, useEffect } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, parseISO, startOfDay, subDays, startOfMonth, startOfYear, endOfDay, isSameDay } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";
import { MiniCalendarPicker } from "@/components/ui/mini-calendar-picker";

interface PerformanceProps {
  inverterId?: string;
  siteId?: string;
  siteIds?: string[];
  isSite?: boolean;
  isPortfolio?: boolean;
  isClientView?: boolean;
  initialInverterIds?: string[];
  initialTotalCapacity?: number;
}

export function PerformanceAnalyticsSection({
  inverterId,
  siteId,
  siteIds,
  isSite = false,
  isPortfolio = false,
  isClientView = false,
  initialInverterIds,
  initialTotalCapacity,
}: PerformanceProps) {
  const sb = createClient();
  const [range, setRange] = useState<"today" | "week" | "month" | "year" | "lifetime">("today");
  const [referenceDate, setReferenceDate] = useState<Date>(new Date());
  const [customRange, setCustomRange] = useState<{ start: Date; end: Date } | null>(null);
  const [metric, setMetric] = useState<"power" | "generation" | "specific_yield">("generation");
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Reset reference date to current period when range changes
  const handleRangeChange = (newRange: typeof range) => {
    setRange(newRange);
    setReferenceDate(new Date());
    setCustomRange(null);
  };

  // Calculate start/end boundaries and dynamic label
  let startDate = new Date();
  let endDate = new Date();
  let dateLabel = "";

  const refStart = startOfDay(referenceDate);

  if (customRange) {
    startDate = customRange.start;
    endDate = customRange.end;
    dateLabel = isSameDay(startDate, endDate)
      ? format(startDate, "d MMM yyyy")
      : `${format(startDate, "d MMM")} - ${format(endDate, "d MMM yyyy")}`;
  } else if (range === "today") {
    startDate = refStart;
    endDate = new Date(refStart.getTime() + 24 * 60 * 60 * 1000 - 1);
    dateLabel = format(referenceDate, "d MMM yyyy");
  } else if (range === "week") {
    startDate = subDays(refStart, 6);
    endDate = new Date(refStart.getTime() + 24 * 60 * 60 * 1000 - 1);
    dateLabel = `${format(startDate, "d MMM")} - ${format(endDate, "d MMM yyyy")}`;
  } else if (range === "month") {
    startDate = startOfMonth(referenceDate);
    const endOfMonthDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
    endDate = new Date(endOfMonthDate.getTime() + 24 * 60 * 60 * 1000 - 1);
    dateLabel = format(referenceDate, "MMMM yyyy");
  } else if (range === "year") {
    startDate = startOfYear(referenceDate);
    const endOfYearDate = new Date(referenceDate.getFullYear(), 11, 31);
    endDate = new Date(endOfYearDate.getTime() + 24 * 60 * 60 * 1000 - 1);
    dateLabel = format(referenceDate, "yyyy");
  } else {
    startDate = new Date("2020-01-01T00:00:00Z");
    endDate = new Date();
    dateLabel = "System Lifetime";
  }

  // Determine effective aggregation range for PostgreSQL RPC
  const isSingleDayView = isSameDay(startDate, endDate);
  const effectiveRange = customRange 
    ? (isSingleDayView ? "today" : "week")
    : range;

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        let inverterIds: string[] = initialInverterIds ?? [];
        let totalCapacity = initialTotalCapacity ?? 1.0;

        // Only query inverters if initial props are not provided
        if (inverterIds.length === 0) {
          if (siteIds && siteIds.length > 0) {
            const { data: invs } = await sb.from("inverters").select("id, capacity_kw").in("site_id", siteIds);
            inverterIds = (invs ?? []).map((i) => i.id);
            totalCapacity = (invs ?? []).reduce((sum, i) => sum + Number(i.capacity_kw || 0), 0) || 1.0;
          } else if (isSite && siteId) {
            const { data: invs } = await sb.from("inverters").select("id, capacity_kw").eq("site_id", siteId);
            inverterIds = (invs ?? []).map((i) => i.id);
            totalCapacity = (invs ?? []).reduce((sum, i) => sum + Number(i.capacity_kw || 0), 0) || 1.0;
          } else if (inverterId) {
            inverterIds = [inverterId];
            const { data: inv } = await sb.from("inverters").select("capacity_kw").eq("id", inverterId).single();
            totalCapacity = Number(inv?.capacity_kw || 0) || 1.0;
          } else {
            const { data: invs } = await sb.from("inverters").select("id, capacity_kw");
            inverterIds = (invs ?? []).map((i) => i.id);
            totalCapacity = (invs ?? []).reduce((sum, i) => sum + Number(i.capacity_kw || 0), 0) || 1.0;
          }
        }

        // Fast Database Aggregation RPC Call
        const { data: rpcData, error: rpcError } = await sb.rpc("get_telemetry_analytics", {
          p_inverter_ids: inverterIds,
          p_range: effectiveRange,
          p_start_date: startDate.toISOString(),
          p_end_date: endDate.toISOString(),
          p_total_capacity: totalCapacity,
        });

        if (rpcError) {
          console.error("Error executing get_telemetry_analytics RPC:", rpcError);
          setChartData([]);
        } else {
          const formatted = (rpcData ?? []).map((r: any) => ({
            timestamp: r.timestamp,
            power: Number(r.power || 0),
            generation: Number(r.generation || 0),
            specific_yield: Number(r.specific_yield || 0),
          }));
          setChartData(formatted);
        }
      } catch (err) {
        console.error("Error loading performance charts data:", err);
      }
      setLoading(false);
    }
    loadData();
  }, [effectiveRange, startDate.getTime(), endDate.getTime(), inverterId, siteId, siteIds, isSite]);

  // Determine chart configurations
  const metricConfigs = {
    power: { 
      label: isClientView ? "Power Output" : "AC Power Output", 
      unit: "kW", 
      stroke: "hsl(var(--primary))", 
      key: "power" 
    },
    generation: {
      label: isClientView ? "Energy Produced" : "Energy Generation",
      unit: "kWh",
      stroke: "#10b981",
      key: "generation",
    },
    specific_yield: { 
      label: isClientView ? (isSingleDayView ? "Today's Specific Yield" : "Specific Yield") : "Specific Yield", 
      unit: "kWh/kWp", 
      stroke: "#f59e0b", 
      key: "specific_yield" 
    },
  };

  const activeMetric = metricConfigs[metric];

  // Dynamic header title based on active date range
  const currentTitle = isClientView
    ? `Solar Production (${dateLabel})`
    : isSingleDayView
    ? `Generation & Power · ${dateLabel}`
    : `Daily Generation · ${dateLabel}`;

  const rangeLabels = isClientView
    ? [
        { id: "today", label: "Daily" },
        { id: "week", label: "Weekly" },
        { id: "month", label: "Monthly" },
        { id: "year", label: "Yearly" },
        { id: "lifetime", label: "Lifetime" },
      ]
    : [
        { id: "today", label: "Today" },
        { id: "week", label: "Week" },
        { id: "month", label: "Month" },
        { id: "year", label: "Year" },
        { id: "lifetime", label: "Lifetime" },
      ];

  return (
    <div className="space-y-4" data-testid="performance-analytics-section">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-accent/30 p-3.5 rounded-xl border border-border/40">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-semibold tracking-tight">{currentTitle}</h4>
          <MiniCalendarPicker
            startDate={startDate}
            endDate={endDate}
            onChange={(start, end) => {
              setCustomRange({ start, end });
            }}
          />
        </div>

        <div className="flex items-center gap-1.5">
          {rangeLabels.map((r) => (
            <Button
              key={r.id}
              size="sm"
              variant={range === r.id ? "default" : "outline"}
              onClick={() => handleRangeChange(r.id as typeof range)}
              className="text-xs h-7 px-3"
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-[280px] flex items-center justify-center border border-dashed rounded-xl bg-card">
          <span className="text-xs text-muted-foreground animate-pulse">Retrieving production history...</span>
        </div>
      ) : chartData.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {range === "today" && (
                <Button
                  size="sm"
                  variant={metric === "power" ? "default" : "outline"}
                  onClick={() => setMetric("power")}
                  className="text-xs h-7 px-3"
                >
                  Power Output (kW)
                </Button>
              )}
              <Button
                size="sm"
                variant={metric === "generation" ? "default" : "outline"}
                onClick={() => setMetric("generation")}
                className="text-xs h-7 px-3"
              >
                {isClientView ? "Energy Produced (kWh)" : "Generation (kWh)"}
              </Button>
              <Button
                size="sm"
                variant={metric === "specific_yield" ? "default" : "outline"}
                onClick={() => setMetric("specific_yield")}
                className="text-xs h-7 px-3"
              >
                {isClientView 
                  ? (range === "today" ? "Today's Specific Yield (kWh/kWp)" : "Specific Yield (kWh/kWp)")
                  : "Specific Yield (kWh/kWp)"}
              </Button>
            </div>

            {isClientView && metric === "specific_yield" && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-primary/5 px-2.5 py-1 rounded-md border border-primary/10">
                <Info className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>How much electricity your solar system produced {range === "today" ? "today" : "per day"} relative to its size.</span>
              </div>
            )}
          </div>

          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              {range === "today" ? (
                <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="perfMetricGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={activeMetric.stroke} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={activeMetric.stroke} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(t) => {
                      try {
                        if (range === "today") return format(parseISO(t), "HH:mm");
                        if (range === "week" || range === "month") return format(parseISO(t), "d MMM");
                        if (range === "year" || range === "lifetime") return format(parseISO(t), "MMM yy");
                        return format(parseISO(t), "yyyy");
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
                        if (range === "today") return format(parseISO(String(t)), "MMM d, HH:mm");
                        if (range === "week" || range === "month") return format(parseISO(String(t)), "EEEE, MMM d, yyyy");
                        if (range === "year" || range === "lifetime") return format(parseISO(String(t)), "MMMM yyyy");
                        return format(parseISO(String(t)), "yyyy");
                      } catch {
                        return String(t);
                      }
                    }}
                    formatter={(v: number) => [`${v} ${activeMetric.unit}`, activeMetric.label]}
                  />
                  <Area
                    type="monotone"
                    dataKey={activeMetric.key}
                    stroke={activeMetric.stroke}
                    fill="url(#perfMetricGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              ) : (
                <BarChart data={chartData} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="perfMetricGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={activeMetric.stroke} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={activeMetric.stroke} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(t) => {
                      try {
                        if (range === "week" || range === "month") return format(parseISO(t), "d MMM");
                        if (range === "year" || range === "lifetime") return format(parseISO(t), "MMM yy");
                        return format(parseISO(t), "yyyy");
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
                        if (range === "week" || range === "month") return format(parseISO(String(t)), "EEEE, MMM d, yyyy");
                        if (range === "year" || range === "lifetime") return format(parseISO(String(t)), "MMMM yyyy");
                        return format(parseISO(String(t)), "yyyy");
                      } catch {
                        return String(t);
                      }
                    }}
                    formatter={(v: number) => [`${v} ${activeMetric.unit}`, activeMetric.label]}
                  />
                  <Bar
                    dataKey={activeMetric.key}
                    fill="url(#perfMetricGrad)"
                    stroke={activeMetric.stroke}
                    strokeWidth={1}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="h-[280px] flex items-center justify-center border border-dashed rounded-xl bg-card">
          <span className="text-xs text-muted-foreground">No generation data recorded for this time range.</span>
        </div>
      )}
    </div>
  );
}
