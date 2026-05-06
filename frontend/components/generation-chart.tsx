"use client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, parseISO } from "date-fns";

export function GenerationChart({ data }: { data: Array<{ timestamp: string; ac_power_kw: number; expected?: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="gen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.25} />
            <stop offset="95%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="timestamp" tickFormatter={(t) => format(parseISO(t), "HH:mm")} tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
          labelFormatter={(t) => format(parseISO(String(t)), "MMM d, HH:mm")}
          formatter={(v: number, name) => [`${Number(v).toFixed(2)} kW`, name === "expected" ? "Expected" : "Actual"]}
        />
        {data.some((d) => d.expected !== undefined) && (
          <Area type="monotone" dataKey="expected" stroke="hsl(var(--muted-foreground))" fill="url(#exp)" strokeDasharray="4 4" />
        )}
        <Area type="monotone" dataKey="ac_power_kw" stroke="hsl(var(--primary))" fill="url(#gen)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
