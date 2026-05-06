"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/utils";
import type { Alert } from "@/lib/types";
import { Check } from "lucide-react";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [severity, setSeverity] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState("");
  const sb = createClient();

  async function load() {
    let query = sb.from("alerts").select("*").order("triggered_at", { ascending: false }).limit(200);
    if (severity !== "all") query = query.eq("severity", severity);
    if (status !== "all") query = query.eq("status", status);
    const { data } = await query;
    setAlerts((data as Alert[]) ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [severity, status]);

  async function acknowledge(id: string) {
    const { error } = await sb.from("alerts").update({ status: "acknowledged", acknowledged_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Alert acknowledged");
    load();
  }

  const filtered = alerts.filter((a) => !q || a.title.toLowerCase().includes(q.toLowerCase()) || a.code.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6" data-testid="alerts-page">
      <div>
        <h1 className="text-3xl font-display font-semibold">Alerts</h1>
        <p className="text-sm text-muted-foreground mt-1">Unified alert stream — inverter faults, string underperformance, missed cleanings.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search title or code…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" data-testid="alert-search" />
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-40" data-testid="alert-severity-filter"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            {["all","critical","high","medium","low"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            {["all","open","acknowledged","resolved"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Code</TableHead><TableHead>Title</TableHead><TableHead>Severity</TableHead>
            <TableHead>Status</TableHead><TableHead>Triggered</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((a) => (
              <TableRow key={a.id} data-testid={`alert-row-${a.id}`}>
                <TableCell className="font-mono text-xs">{a.code}</TableCell>
                <TableCell className="max-w-sm truncate">{a.title}</TableCell>
                <TableCell><Badge variant={a.severity === "critical" ? "destructive" : a.severity === "high" ? "warning" : "secondary"} className="capitalize">{a.severity}</Badge></TableCell>
                <TableCell className="capitalize">{a.status}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDateTime(a.triggered_at)}</TableCell>
                <TableCell className="text-right">
                  {a.status === "open" && (
                    <Button size="sm" variant="outline" onClick={() => acknowledge(a.id)} data-testid={`alert-ack-${a.id}`}>
                      <Check className="h-3.5 w-3.5 mr-1" /> Acknowledge
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No alerts match the filter.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
