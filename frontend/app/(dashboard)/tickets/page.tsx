"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { Ticket, Site } from "@/lib/types";

export default function TicketsPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "p3", site_id: "" });
  const sb = createClient();

  async function load() {
    let query = sb.from("tickets").select("*, sites(name)").order("created_at", { ascending: false });
    if (status !== "all") query = query.eq("status", status);
    const [{ data: t }, { data: s }] = await Promise.all([query, sb.from("sites").select("id,name,org_id,location,capacity_kwp,status,latitude,longitude,commissioned_on,cleaning_cycle_days,last_cleaned_on,client_id,timezone,created_at")]);
    setTickets(t ?? []);
    setSites((s as Site[]) ?? []);
  }
  useEffect(() => { load(); }, [status]);

  async function create() {
    if (!form.title || !form.site_id) return toast.error("Title and site are required");
    const site = sites.find((s) => s.id === form.site_id);
    if (!site) return toast.error("Invalid site");
    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from("tickets").insert({
      title: form.title, description: form.description, priority: form.priority,
      site_id: form.site_id, org_id: site.org_id, created_by: user?.id ?? null,
      sla_due_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
    });
    if (error) return toast.error(error.message);
    toast.success("Ticket created");
    setOpen(false); setForm({ title: "", description: "", priority: "p3", site_id: "" });
    load();
  }

  async function updateStatus(id: string, newStatus: string) {
    const patch: Record<string, unknown> = { status: newStatus };
    if (newStatus === "resolved" || newStatus === "closed") patch.resolved_at = new Date().toISOString();
    const { error } = await sb.from("tickets").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status updated");
    load();
  }

  const filtered = tickets.filter((t) => !q || t.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6" data-testid="tickets-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-semibold">Tickets</h1>
          <p className="text-sm text-muted-foreground mt-1">O&amp;M ticket pipeline. SLAs, assignments, and escalation.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="new-ticket-btn"><Plus className="h-4 w-4 mr-1.5" /> New ticket</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create ticket</DialogTitle><DialogDescription>Raise a new O&M task against a site.</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="ticket-title" /></div>
              <div className="space-y-1.5"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Site</Label>
                  <Select value={form.site_id} onValueChange={(v) => setForm({ ...form, site_id: v })}>
                    <SelectTrigger data-testid="ticket-site"><SelectValue placeholder="Select site" /></SelectTrigger>
                    <SelectContent>{sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["p1","p2","p3","p4"].map((p) => <SelectItem key={p} value={p} className="uppercase">{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter><Button onClick={create} data-testid="ticket-create">Create ticket</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input placeholder="Search tickets…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{["all","open","in_progress","on_hold","resolved","closed"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_"," ")}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Site</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>SLA due</TableHead>
            <TableHead>Created</TableHead>
            <TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((t) => (
              <TableRow key={t.id} data-testid={`ticket-row-${t.id}`}>
                <TableCell className="max-w-md truncate">
                  <Link href={`/tickets/${t.id}`} className="font-semibold text-primary hover:underline">
                    {t.title}
                  </Link>
                </TableCell>
                <TableCell className="text-sm font-medium">{t.sites?.name || "—"}</TableCell>
                <TableCell><Badge variant="outline" className="uppercase text-[10px]">{t.priority}</Badge></TableCell>
                <TableCell><Badge variant={t.status === "resolved" || t.status === "closed" ? "success" : t.status === "on_hold" ? "warning" : "secondary"} className="capitalize">{t.status.replace("_"," ")}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{t.sla_due_at ? formatDateTime(t.sla_due_at) : "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDateTime(t.created_at)}</TableCell>
                <TableCell>
                  <Select value={t.status} onValueChange={(v) => updateStatus(t.id, v)}>
                    <SelectTrigger className="h-8 w-36" data-testid={`ticket-status-${t.id}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{["open","in_progress","on_hold","resolved","closed"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_"," ")}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No tickets.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
