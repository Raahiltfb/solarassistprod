"use client";

import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, parseISO, startOfDay, subDays, startOfWeek, startOfMonth, startOfYear } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

interface PerformanceProps {
  inverterId?: string;
  siteId?: string;
  isSite?: boolean;
}

export function PerformanceAnalyticsSection({ inverterId, siteId, isSite = false }: PerformanceProps) {
  const sb = createClient();
  const [range, setRange] = useState<"today" | "week" | "month" | "year" | "lifetime">("today");
  const [metric, setMetric] = useState<"power" | "generation" | "specific_yield">("generation");
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // 1. Get inverters list
        let inverterIds: string[] = [];
        let totalCapacity = 1.0;
        
        if (isSite && siteId) {
          const { data: invs } = await sb.from("inverters").select("id, capacity_kw").eq("site_id", siteId);
          inverterIds = (invs ?? []).map((i) => i.id);
          totalCapacity = (invs ?? []).reduce((sum, i) => sum + Number(i.capacity_kw || 0), 0) || 1.0;
        } else if (inverterId) {
          inverterIds = [inverterId];
          const { data: inv } = await sb.from("inverters").select("capacity_kw").eq("id", inverterId).single();
          totalCapacity = Number(inv?.capacity_kw || 0) || 1.0;
        }

        if (inverterIds.length === 0) {
          setChartData([]);
          setLoading(false);
          return;
        }

        // 2. Determine date filter based on selected range
        let startDate = new Date();
        if (range === "today") {
          startDate = startOfDay(new Date());
        } else if (range === "week") {
          startDate = subDays(startOfDay(new Date()), 7);
        } else if (range === "month") {
          startDate = subDays(startOfDay(new Date()), 30);
        } else if (range === "year") {
          startDate = subDays(startOfDay(new Date()), 365);
        } else {
          startDate = new Date("2020-01-01T00:00:00Z"); // lifetime
        }

        // 3. Query telemetry data
        const { data: telemetry } = await sb
          .from("telemetry")
          .select("timestamp, ac_power_kw, daily_generation_kwh, total_generation_kwh, specific_yield, inverter_id")
          .in("inverter_id", inverterIds)
          .gte("timestamp", startDate.toISOString())
          .order("timestamp", { ascending: true });

        const records = telemetry ?? [];

        // 4. Process and aggregate based on range
        if (range === "today") {
          // Intraday 15-minute intervals summed across inverters
          const timeMap = new Map<string, { power: number; gen: number }>();
          for (const r of records) {
            // Group by 15-minute slot (e.g. 2026-08-12 14:15)
            const dt = new Date(r.timestamp);
            const minutes = Math.floor(dt.getMinutes() / 15) * 15;
            dt.setMinutes(minutes);
            dt.setSeconds(0);
            dt.setMilliseconds(0);
            const bucketStr = dt.toISOString();

            const existing = timeMap.get(bucketStr) ?? { power: 0, gen: 0 };
            existing.power += Number(r.ac_power_kw || 0);
            existing.gen += Number(r.daily_generation_kwh || 0);
            timeMap.set(bucketStr, existing);
          }

          const formatted = Array.from(timeMap.entries()).map(([time, val]) => ({
            timestamp: time,
            power: +val.power.toFixed(2),
            generation: +val.gen.toFixed(2),
            specific_yield: +(val.gen / totalCapacity).toFixed(2),
          })).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

          setChartData(formatted);

        } else if (range === "week" || range === "month") {
          // Daily values: for each calendar day, sum the max daily_generation of each inverter
          const dayMap = new Map<string, Map<string, { max_gen: number; max_yield: number; max_total: number }>>();

          for (const r of records) {
            const dateStr = r.timestamp.slice(0, 10); // YYYY-MM-DD
            if (!dayMap.has(dateStr)) {
              dayMap.set(dateStr, new Map());
            }
            const invMap = dayMap.get(dateStr)!;
            const current = invMap.get(r.inverter_id) ?? { max_gen: 0, max_yield: 0, max_total: 0 };
            
            invMap.set(r.inverter_id, {
              max_gen: Math.max(current.max_gen, Number(r.daily_generation_kwh || 0)),
              max_yield: Math.max(current.max_yield, Number(r.specific_yield || 0)),
              max_total: Math.max(current.max_total, Number(r.total_generation_kwh || 0)),
            });
          }

          const formatted = Array.from(dayMap.entries()).map(([date, invMap]) => {
            let totalGen = 0;
            let sumYield = 0;
            
            for (const metrics of invMap.values()) {
              totalGen += metrics.max_gen;
              sumYield += metrics.max_yield;
            }

            return {
              timestamp: `${date}T12:00:00Z`, // midday timestamp for charts
              generation: +totalGen.toFixed(1),
              specific_yield: +(totalGen / totalCapacity).toFixed(2),
              power: 0, // Not applicable for daily charts
            };
          }).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

          setChartData(formatted);

        } else if (range === "year") {
          // Monthly totals: sum daily maximums inside the month
          const monthMap = new Map<string, Map<string, Map<string, number>>>(); // YYYY-MM -> inverter_id -> dateStr -> max_gen

          for (const r of records) {
            const monthStr = r.timestamp.slice(0, 7); // YYYY-MM
            const dateStr = r.timestamp.slice(0, 10); // YYYY-MM-DD
            
            if (!monthMap.has(monthStr)) {
              monthMap.set(monthStr, new Map());
            }
            const invMap = monthMap.get(monthStr)!;
            if (!invMap.has(r.inverter_id)) {
              invMap.set(r.inverter_id, new Map());
            }
            const dateMap = invMap.get(r.inverter_id)!;
            const current = dateMap.get(dateStr) ?? 0;
            dateMap.set(dateStr, Math.max(current, Number(r.daily_generation_kwh || 0)));
          }

          const formatted = Array.from(monthMap.entries()).map(([month, invMap]) => {
            let sumGen = 0;
            for (const dateMap of invMap.values()) {
              for (const gen of dateMap.values()) {
                sumGen += gen;
              }
            }
            return {
              timestamp: `${month}-01T12:00:00Z`,
              generation: +sumGen.toFixed(1),
              specific_yield: +(sumGen / totalCapacity).toFixed(2),
              power: 0,
            };
          }).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

          setChartData(formatted);

        } else {
          // Lifetime: Annual totals
          const yearMap = new Map<string, Map<string, Map<string, number>>>(); // YYYY -> inverter_id -> dateStr -> max_gen

          for (const r of records) {
            const yearStr = r.timestamp.slice(0, 4); // YYYY
            const dateStr = r.timestamp.slice(0, 10);
            
            if (!yearMap.has(yearStr)) {
              yearMap.set(yearStr, new Map());
            }
            const invMap = yearMap.get(yearStr)!;
            if (!invMap.has(r.inverter_id)) {
              invMap.set(r.inverter_id, new Map());
            }
            const dateMap = invMap.get(r.inverter_id)!;
            const current = dateMap.get(dateStr) ?? 0;
            dateMap.set(dateStr, Math.max(current, Number(r.daily_generation_kwh || 0)));
          }

          const formatted = Array.from(yearMap.entries()).map(([year, invMap]) => {
            let sumGen = 0;
            for (const dateMap of invMap.values()) {
              for (const gen of dateMap.values()) {
                sumGen += gen;
              }
            }
            return {
              timestamp: `${year}-01-01T12:00:00Z`,
              generation: +(sumGen / 1000.0).toFixed(2), // Convert to MWh for long term views
              specific_yield: +(sumGen / totalCapacity).toFixed(2),
              power: 0,
            };
          }).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

          setChartData(formatted);
        }

        // Adjust default metric selection based on range
        if (range === "today" && metric !== "power" && metric !== "generation") {
          setMetric("power");
        } else if (range !== "today" && metric === "power") {
          setMetric("generation");
        }

      } catch (err) {
        console.error("Error loading performance charts data:", err);
      }
      setLoading(false);
    }
    loadData();
  }, [range, inverterId, siteId, isSite]);

  // Determine chart configurations
  const metricConfigs = {
    power: { label: "AC Power Output", unit: "kW", stroke: "hsl(var(--primary))", key: "power" },
    generation: { 
      label: "Energy Generation", 
      unit: range === "lifetime" ? "MWh" : "kWh", 
      stroke: "#22c55e", 
      key: "generation" 
    },
    specific_yield: { label: "Specific Yield", unit: "kWh/kWp", stroke: "#eab308", key: "specific_yield" }
  };

  const activeMetric = metricConfigs[metric];

  // Dynamic titles
  const rangeTitles = {
    today: `Generation & Power · Today`,
    week: `Daily Generation · Last 7 Days`,
    month: `Daily Generation · Last 30 Days`,
    year: `Monthly Generation · This Year`,
    lifetime: `Annual Yield · System Lifetime`
  };

  return (
    <div className="space-y-4" data-testid="performance-analytics-section">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-accent/30 p-3.5 rounded-xl border border-border/40">
        <h4 className="text-sm font-semibold tracking-tight">{rangeTitles[range]}</h4>
        
        <div className="flex items-center gap-1.5">
          {(["today", "week", "month", "year", "lifetime"] as const).map((r) => (
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
          <span className="text-xs text-muted-foreground animate-pulse">Retrieving historical time series data...</span>
        </div>
      ) : chartData.length > 0 ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            {range === "today" && (
              <Button
                size="sm"
                variant={metric === "power" ? "default" : "outline"}
                onClick={() => setMetric("power")}
                className="text-xs h-7 px-3"
              >
                Power (kW)
              </Button>
            )}
            <Button
              size="sm"
              variant={metric === "generation" ? "default" : "outline"}
              onClick={() => setMetric("generation")}
              className="text-xs h-7 px-3"
            >
              Generation ({range === "lifetime" ? "MWh" : "kWh"})
            </Button>
            <Button
              size="sm"
              variant={metric === "specific_yield" ? "default" : "outline"}
              onClick={() => setMetric("specific_yield")}
              className="text-xs h-7 px-3"
            >
              Specific Yield (kWh/kWp)
            </Button>
          </div>

          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
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
                      if (range === "year") return format(parseISO(t), "MMM");
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
                      if (range === "year") return format(parseISO(String(t)), "MMMM yyyy");
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
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="h-[280px] flex items-center justify-center border border-dashed rounded-xl bg-card">
          <span className="text-xs text-muted-foreground">No yield analytics recorded for this time range.</span>
        </div>
      )}
    </div>
  );
}
