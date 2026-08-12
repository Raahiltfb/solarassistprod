"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
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
import { Check, Ticket } from "lucide-react";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [severity, setSeverity] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState("");
  const sb = createClient();

  async function load() {
    let query = sb.from("alerts").select("*, sites(name), inverters(serial_number, model)").order("triggered_at", { ascending: false }).limit(200);
    if (severity !== "all") query = query.eq("severity", severity);
    if (status !== "all") query = query.eq("status", status);
    const { data } = await query;
    setAlerts(data ?? []);
  }
  useEffect(() => { load(); }, [severity, status]);

  async function acknowledge(id: string) {
    const { error } = await sb.from("alerts").update({ status: "acknowledged", acknowledged_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Alert acknowledged");
    load();
  }

  async function createTicketForAlert(alert: any) {
    const { data: ticketData, error: ticketError } = await sb
      .from("tickets")
      .insert({
        org_id: alert.org_id,
        site_id: alert.site_id,
        inverter_id: alert.inverter_id,
        alert_id: alert.id,
        title: `Ticket for: ${alert.title}`,
        description: `Alert: ${alert.description || alert.title}\nOEM Code: ${alert.alarm_code || alert.code}\nRecommended Action: ${alert.recommended_action || "Check inverter operational manual."}`,
        status: "open",
        priority: alert.severity === "critical" ? "p1" : alert.severity === "high" ? "p2" : "p3",
      })
      .select()
      .single();

    if (ticketError) return toast.error(ticketError.message);

    const { error: alertError } = await sb
      .from("alerts")
      .update({
        ticket_id: ticketData.id,
        status: "acknowledged"
      })
      .eq("id", alert.id);

    if (alertError) return toast.error(alertError.message);

    await sb.from("ticket_activity").insert({
      ticket_id: ticketData.id,
      activity_type: "creation",
      message: `Ticket created from Alert: ${alert.title}`
    });

    toast.success("Ticket created and linked successfully");
    load();
  }

  const filtered = alerts.filter((a) => !q || a.title.toLowerCase().includes(q.toLowerCase()) || a.code.toLowerCase().includes(q.toLowerCase()) || (a.alarm_code && a.alarm_code.toLowerCase().includes(q.toLowerCase())));

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
            {["all", "critical", "high", "medium", "low"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            {["all", "open", "acknowledged", "resolved"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Code (OEM)</TableHead>
            <TableHead>Originating Asset</TableHead>
            <TableHead>Title & Action</TableHead>
            <TableHead>Category & Flags</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Triggered</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((a) => (
              <TableRow key={a.id} data-testid={`alert-row-${a.id}`}>
                <TableCell className="font-mono text-xs font-semibold">
                  <div>{a.code}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">{a.oem || "solis"} {a.alarm_code ? `(${a.alarm_code})` : ""}</div>
                </TableCell>
                <TableCell className="text-xs">
                  <div className="font-semibold text-primary">{a.sites?.name || "Unknown Site"}</div>
                  {a.inverters?.serial_number && <div className="font-mono text-muted-foreground">SN: {a.inverters.serial_number}</div>}
                </TableCell>
                <TableCell className="max-w-xs">
                  <div className="font-medium text-sm">{a.title}</div>
                  {a.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{a.description}</div>}
                  {a.recommended_action && (
                    <div className="text-[11px] text-primary bg-primary/5 rounded border border-primary/10 px-2 py-0.5 mt-1.5 inline-block">
                      <b>Action:</b> {a.recommended_action}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <Badge variant="outline" className="text-[10px] uppercase font-mono">{a.category || "inverter"}</Badge>
                    {a.is_auto_resolvable && <div className="text-[10px] text-green-600 font-medium">Auto-resolvable</div>}
                    {a.requires_technician && <div className="text-[10px] text-orange-600 font-medium">Tech Required</div>}
                  </div>
                </TableCell>
                <TableCell><Badge variant={a.severity === "critical" ? "destructive" : a.severity === "high" ? "warning" : "secondary"} className="capitalize">{a.severity}</Badge></TableCell>
                <TableCell className="capitalize">{a.status}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDateTime(a.triggered_at)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5">
                    {a.status === "open" && (
                      <Button size="sm" variant="outline" onClick={() => acknowledge(a.id)} data-testid={`alert-ack-${a.id}`}>
                        <Check className="h-3.5 w-3.5 mr-1" /> Ack
                      </Button>
                    )}
                    {!a.ticket_id ? (
                      <Button size="sm" variant="outline" className="bg-primary/5 hover:bg-primary/10 border-primary/20" onClick={() => createTicketForAlert(a)}>
                        <Ticket className="h-3.5 w-3.5 mr-1" /> Ticket
                      </Button>
                    ) : (
                      <Badge variant="outline" className="text-xs shrink-0 py-1">
                        <Link href={`/tickets/${a.ticket_id}`}>View Ticket</Link>
                      </Badge>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No alerts match the filter.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
