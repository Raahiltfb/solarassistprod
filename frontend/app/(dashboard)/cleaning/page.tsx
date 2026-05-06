"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Camera, Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { CleaningLog, Site } from "@/lib/types";

export default function CleaningPage() {
  const [logs, setLogs] = useState<(CleaningLog & { sites?: { name: string; cleaning_cycle_days: number; last_cleaned_on: string | null } })[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ site_id: "", remarks: "", before: "", after: "" });
  const sb = createClient();

  async function load() {
    const [{ data: l }, { data: s }] = await Promise.all([
      sb.from("cleaning_logs").select("*, sites(name, cleaning_cycle_days, last_cleaned_on)").order("performed_at", { ascending: false }),
      sb.from("sites").select("*"),
    ]);
    setLogs((l as any) ?? []);
    setSites((s as Site[]) ?? []);
  }
  useEffect(() => { load(); }, []);

  async function uploadPhoto(file: File, kind: "before" | "after") {
    const path = `cleaning/${crypto.randomUUID()}-${kind}-${file.name}`;
    const { error } = await sb.storage.from("solar-uploads").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const { data } = sb.storage.from("solar-uploads").getPublicUrl(path);
    setForm((f) => ({ ...f, [kind]: data.publicUrl }));
    toast.success(`${kind} photo uploaded`);
  }

  async function submit() {
    if (!form.site_id) return toast.error("Select a site");
    const { data: { user } } = await sb.auth.getUser();
    const site = sites.find((s) => s.id === form.site_id);
    const nextDue = site ? new Date(Date.now() + site.cleaning_cycle_days * 86400_000).toISOString().slice(0, 10) : null;
    const { error } = await sb.from("cleaning_logs").insert({
      site_id: form.site_id, performed_by: user?.id ?? null,
      performed_at: new Date().toISOString(), next_due_on: nextDue,
      remarks: form.remarks, before_photo_url: form.before || null, after_photo_url: form.after || null,
    });
    if (error) return toast.error(error.message);
    await sb.from("sites").update({ last_cleaned_on: new Date().toISOString().slice(0, 10) }).eq("id", form.site_id);
    toast.success("Cleaning logged");
    setOpen(false); setForm({ site_id: "", remarks: "", before: "", after: "" });
    load();
  }

  const now = Date.now();
  const overdueSites = sites.filter((s) => {
    if (!s.last_cleaned_on) return true;
    const last = new Date(s.last_cleaned_on).getTime();
    return (now - last) / 86400_000 > s.cleaning_cycle_days;
  });

  return (
    <div className="space-y-6" data-testid="cleaning-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-semibold">Cleaning</h1>
          <p className="text-sm text-muted-foreground mt-1">Module cleaning compliance, history and technician uploads.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="new-cleaning-btn"><Plus className="h-4 w-4 mr-1.5" /> Log cleaning</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Log cleaning</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Site</Label>
                <Select value={form.site_id} onValueChange={(v) => setForm({ ...form, site_id: v })}>
                  <SelectTrigger data-testid="cleaning-site"><SelectValue placeholder="Select site" /></SelectTrigger>
                  <SelectContent>{sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Remarks</Label><Textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Before photo</Label>
                  <Input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0], "before")} />
                  {form.before && <span className="text-xs text-success">uploaded ✓</span>}
                </div>
                <div className="space-y-1.5">
                  <Label>After photo</Label>
                  <Input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0], "after")} />
                  {form.after && <span className="text-xs text-success">uploaded ✓</span>}
                </div>
              </div>
            </div>
            <DialogFooter><Button onClick={submit} data-testid="cleaning-submit"><Camera className="h-4 w-4 mr-1.5" /> Submit</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {overdueSites.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm">
            <b className="text-destructive">{overdueSites.length} site(s) overdue for cleaning:</b> {overdueSites.map((s) => s.name).join(", ")}
          </CardContent>
        </Card>
      )}

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Site</TableHead><TableHead>Date</TableHead><TableHead>Remarks</TableHead><TableHead>Photos</TableHead></TableRow></TableHeader>
          <TableBody>
            {logs.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.sites?.name ?? "—"}</TableCell>
                <TableCell>{formatDate(l.performed_at)}</TableCell>
                <TableCell className="max-w-sm text-sm text-muted-foreground">{l.remarks ?? "—"}</TableCell>
                <TableCell className="space-x-2 text-xs">
                  {l.before_photo_url ? <a className="text-primary underline" href={l.before_photo_url} target="_blank" rel="noopener noreferrer">before</a> : null}
                  {l.after_photo_url ? <a className="text-primary underline" href={l.after_photo_url} target="_blank" rel="noopener noreferrer">after</a> : null}
                  {!l.before_photo_url && !l.after_photo_url && <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">No cleaning logs yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
