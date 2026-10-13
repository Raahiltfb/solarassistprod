"use client";

import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceDot } from "recharts";
import { format, parseISO, subDays, startOfDay, endOfDay, isSameDay } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { MiniCalendarPicker } from "@/components/ui/mini-calendar-picker";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { StringAnomaly } from "@/lib/string-anomaly-engine";

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

export function StringAnalyticsSection({
  inverters,
  anomalies = [],
}: {
  inverters: any[];
  anomalies?: StringAnomaly[];
}) {
  const sb = createClient();

  const [selectedInvId, setSelectedInvId] = useState<string>(inverters[0]?.id || "");
  const [strings, setStrings] = useState<any[]>([]);
  const [selectedStrIds, setSelectedStrIds] = useState<string[]>([]);
  
  const [startDate, setStartDate] = useState<Date>(startOfDay(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfDay(new Date()));

  const [telemetry, setTelemetry] = useState<any[]>([]);
  const [metric, setMetric] = useState<"voltage_v" | "current_a" | "power_kw">("voltage_v");
  const [loading, setLoading] = useState<boolean>(false);

  // Filter active anomalies for the currently selected inverter
  const invAnomalies = (anomalies || []).filter(
    (a) => a.inverter_id === selectedInvId && (a.status === "active" || !a.status)
  );

  const stringAnomalyMap = new Map<number, StringAnomaly>();
  for (const a of invAnomalies) {
    stringAnomalyMap.set(Number(a.string_index), a);
  }

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

  // Fetch string telemetry when string or date range changes
  useEffect(() => {
    if (selectedStrIds.length === 0) {
      setTelemetry([]);
      return;
    }
    async function loadTelemetry() {
      setLoading(true);
      try {
        const { data } = await sb
          .from("string_telemetry")
          .select("timestamp, string_id, voltage_v, current_a, power_kw")
          .in("string_id", selectedStrIds)
          .gte("timestamp", startDate.toISOString())
          .lte("timestamp", endDate.toISOString())
          .order("timestamp", { ascending: true });

        setTelemetry(data ?? []);
      } catch (err) {
        console.error("Failed to load string telemetry:", err);
      }
      setLoading(false);
    }
    loadTelemetry();
  }, [selectedStrIds, startDate, endDate]);

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

  const focusIssueStrings = () => {
    const issueIds = strings
      .filter((s) => stringAnomalyMap.has(Number(s.string_index)))
      .map((s) => s.id);
    if (issueIds.length > 0) {
      setSelectedStrIds(issueIds);
    }
  };

  // Find selected strings for display line elements
  const selectedStringsInfo = strings.filter((s) => selectedStrIds.includes(s.id));

  // For each flagged string, locate the point of worst deviation vs. the median of the other strings
  const [hoveredMarker, setHoveredMarker] = useState<string | null>(null);
  const anomalyMarkers = selectedStringsInfo
    .filter((s) => stringAnomalyMap.has(Number(s.string_index)))
    .map((s) => {
      const key = `String #${s.string_index}`;
      const anomaly = stringAnomalyMap.get(Number(s.string_index))!;
      let worst: { timestamp: string; value: number; peer: number; gap: number } | null = null;
      for (const row of chartData as any[]) {
        const v = row[key];
        if (typeof v !== "number") continue;
        const peers = Object.entries(row)
          .filter(([k, val]) => k !== "timestamp" && k !== key && typeof val === "number")
          .map(([, val]) => val as number)
          .sort((a, b) => a - b);
        if (peers.length === 0) continue;
        const mid = Math.floor(peers.length / 2);
        const peer = peers.length % 2 ? peers[mid] : (peers[mid - 1] + peers[mid]) / 2;
        const gap = peer - v;
        if (peer > 0 && (!worst || gap > worst.gap)) worst = { timestamp: row.timestamp, value: v, peer, gap };
      }
      if (!worst || worst.gap <= 0) return null;
      return {
        id: s.id,
        stringIndex: s.string_index,
        anomaly,
        ...worst,
        pct: worst.peer > 0 ? (worst.gap / worst.peer) * 100 : 0,
        color: anomaly.severity === "critical" || anomaly.type === "string_disconnected" ? "#ef4444" : "#f59e0b",
      };
    })
    .filter(Boolean) as Array<{
      id: string; stringIndex: number; anomaly: StringAnomaly; timestamp: string;
      value: number; peer: number; gap: number; pct: number; color: string;
    }>;
  const activeMarker = anomalyMarkers.find((m) => m.id === hoveredMarker) || null;

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
                    SN: {inv.serial_number || inv.oem_device_id} ({inv.model})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {strings.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center bg-card/65 px-3 py-1.5 rounded-lg border border-border/50">
              <span className="text-xs text-muted-foreground mr-1 font-medium">Strings:</span>
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
                className="h-6 text-[10px] px-1.5 rounded bg-transparent hover:bg-muted font-medium text-muted-foreground hover:text-foreground transition-all"
              >
                Clear
              </button>
              {invAnomalies.length > 0 && (
                <button
                  type="button"
                  onClick={focusIssueStrings}
                  className="h-6 text-[10px] px-2 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 font-semibold border border-amber-500/30 transition-all flex items-center gap-1"
                >
                  <AlertTriangle className="h-3 w-3" />
                  <span>Issues ({invAnomalies.length})</span>
                </button>
              )}
              <div className="flex flex-wrap gap-1 ml-1">
                {strings.map((str) => {
                  const isSelected = selectedStrIds.includes(str.id);
                  const anomaly = stringAnomalyMap.get(Number(str.string_index));
                  const hasIssue = !!anomaly;

                  return (
                    <button
                      key={str.id}
                      type="button"
                      title={
                        hasIssue
                          ? `⚠️ String #${str.string_index} ISSUE: ${anomaly.type.replace(/_/g, " ").toUpperCase()}${
                              anomaly.deviation_pct > 0 ? ` (-${anomaly.deviation_pct.toFixed(0)}% drop)` : ""
                            } | Action: ${anomaly.recommended_action}`
                          : `String #${str.string_index} (Optimal)`
                      }
                      onClick={() => toggleStringSelection(str.id)}
                      className={`text-xs h-6 px-2 rounded font-semibold transition-all duration-150 active:scale-95 flex items-center gap-1 ${
                        hasIssue
                          ? isSelected
                            ? "bg-amber-600 text-white shadow-sm ring-2 ring-amber-400 dark:bg-amber-700"
                            : "border-2 border-amber-500/80 text-amber-700 dark:text-amber-400 bg-amber-500/15 hover:bg-amber-500/25"
                          : isSelected 
                          ? "bg-primary text-primary-foreground shadow-sm" 
                          : "bg-background text-muted-foreground border border-border/60 hover:text-foreground hover:bg-accent/40"
                      }`}
                    >
                      {hasIssue && <AlertTriangle className="h-2.5 w-2.5 shrink-0" />}
                      <span>#{str.string_index}</span>
                      {hasIssue && (
                        <span className="text-[9px] uppercase tracking-wider font-bold opacity-90">
                          {anomaly.type === "string_disconnected" ? "OFF" : "ERR"}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <MiniCalendarPicker
            startDate={startDate}
            endDate={endDate}
            onChange={(start, end) => {
              setStartDate(start);
              setEndDate(end);
            }}
          />
        </div>
      </div>

      {/* Flagged Issue Alert Banner */}
      {invAnomalies.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <div className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <span>{invAnomalies.length} String {invAnomalies.length === 1 ? "Anomaly" : "Anomalies"} Flagged on this Inverter</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 font-mono font-medium">
                  ATTENTION NEEDED
                </span>
              </div>
              <p className="text-amber-700/90 dark:text-amber-400 text-[11px] mt-0.5">
                {invAnomalies.map((a) => (
                  <span key={a.id} className="mr-3 inline-block">
                    <strong>String #{a.string_index}</strong>: {a.type.replace(/_/g, " ")} 
                    {a.deviation_pct > 0 && ` (${a.deviation_pct.toFixed(0)}% drop)`}
                  </span>
                ))}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={focusIssueStrings}
            className="h-7 text-xs border-amber-500/40 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20"
          >
            Focus Flagged Strings Only
          </Button>
        </div>
      )}

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

          <div className="relative h-[320px] bg-card p-4 rounded-xl border border-border/30 shadow-sm">
            {activeMarker && (
              <div className="absolute top-3 right-3 z-10 w-64 rounded-lg border border-border bg-card/95 backdrop-blur p-3 shadow-lg text-[11px] pointer-events-none">
                <div className="flex items-center gap-1.5 font-semibold mb-1.5" style={{ color: activeMarker.color }}>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  String #{activeMarker.stringIndex} — {activeMarker.anomaly.type.replace(/_/g, " ")}
                </div>
                <div className="text-muted-foreground mb-2">
                  {(() => { try { return format(parseISO(activeMarker.timestamp), "d MMM, HH:mm"); } catch { return activeMarker.timestamp; } })()}
                </div>
                <div className="grid grid-cols-2 gap-y-1 font-mono">
                  <span className="text-muted-foreground font-sans">This string</span>
                  <span className="text-right font-bold">{activeMarker.value.toFixed(2)} {activeMetricConfig.unit}</span>
                  <span className="text-muted-foreground font-sans">Peer median</span>
                  <span className="text-right">{activeMarker.peer.toFixed(2)} {activeMetricConfig.unit}</span>
                  <span className="text-muted-foreground font-sans">Gap</span>
                  <span className="text-right font-bold" style={{ color: activeMarker.color }}>
                    −{activeMarker.gap.toFixed(2)} ({activeMarker.pct.toFixed(0)}%)
                  </span>
                  {activeMarker.anomaly.historical_current_a > 0 && (
                    <>
                      <span className="text-muted-foreground font-sans">Own history</span>
                      <span className="text-right">{activeMarker.anomaly.historical_current_a.toFixed(2)} A</span>
                    </>
                  )}
                </div>
              </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="timestamp" 
                  tickFormatter={(t) => {
                    try {
                      return format(parseISO(t), isSameDay(startDate, endDate) ? "HH:mm" : "d MMM HH:mm");
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
                  formatter={(value: any, name: any) => {
                    const isIssueName = String(name).includes("⚠️");
                    return [
                      <span>
                        <span className="font-mono font-bold">{Number(value).toFixed(2)} {activeMetricConfig.unit}</span>
                        {isIssueName && (
                          <span className="ml-1.5 px-1 py-0.5 text-[9px] rounded bg-amber-500/20 text-amber-700 dark:text-amber-400 font-bold">
                            ANOMALY
                          </span>
                        )}
                      </span>,
                      name,
                    ];
                  }}
                />
                <Legend 
                  verticalAlign="top" 
                  height={36} 
                  iconType="circle" 
                  iconSize={8} 
                  wrapperStyle={{ fontSize: 10, fontWeight: 500 }} 
                />
                {selectedStringsInfo.map((str, idx) => {
                  const anomaly = stringAnomalyMap.get(Number(str.string_index));
                  const isIssue = !!anomaly;
                  const lineName = isIssue
                    ? `String #${str.string_index} ⚠️ [${anomaly.type === "string_disconnected" ? "DISCONNECTED" : "ISSUE"}]`
                    : `String #${str.string_index}`;

                  return (
                    <Line 
                      key={str.id}
                      type="monotone" 
                      name={lineName}
                      dataKey={`String #${str.string_index}`}
                      stroke={
                        isIssue 
                          ? (anomaly.severity === "critical" || anomaly.type === "string_disconnected" ? "#ef4444" : "#f59e0b")
                          : STRING_COLORS[idx % STRING_COLORS.length]
                      } 
                      strokeWidth={isIssue ? 3.5 : 2}
                      strokeDasharray={isIssue && anomaly.type === "string_disconnected" ? "4 2" : undefined}
                      dot={false}
                      activeDot={{ r: isIssue ? 6 : 4 }}
                    />
                  );
                })}
                {anomalyMarkers.map((m) => (
                  <ReferenceDot
                    key={`marker-${m.id}`}
                    x={m.timestamp}
                    y={m.value}
                    ifOverflow="extendDomain"
                    shape={(props: any) => (
                      <g
                        style={{ cursor: "pointer" }}
                        onMouseEnter={() => setHoveredMarker(m.id)}
                        onMouseLeave={() => setHoveredMarker(null)}
                      >
                        <circle cx={props.cx} cy={props.cy} r={16} fill={m.color} fillOpacity={0.12} className="animate-pulse" />
                        <circle cx={props.cx} cy={props.cy} r={11} fill="none" stroke={m.color} strokeWidth={2.5} />
                        <circle cx={props.cx} cy={props.cy} r={3} fill={m.color} />
                        <text x={props.cx} y={props.cy - 18} textAnchor="middle" fontSize={10} fontWeight={700} fill={m.color}>
                          #{m.stringIndex} −{m.pct.toFixed(0)}%
                        </text>
                      </g>
                    )}
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

