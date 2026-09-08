"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Camera, Plus, Calendar, CheckCircle2, AlertCircle, Wrench, Clock, ShieldAlert, Settings } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { CleaningLog, Site, Profile, SiteCleaningRule } from "@/lib/types";
import { SiteRuleDialog } from "@/components/cleaning/site-rule-dialog";
import { BulkRuleDialog } from "@/components/cleaning/bulk-rule-dialog";

export default function CleaningPage() {
  const [logs, setLogs] = useState<(CleaningLog & { sites?: { name: string; cleaning_cycle_days: number; last_cleaned_on: string | null } })[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [rules, setRules] = useState<SiteCleaningRule[]>([]);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [openLogDialog, setOpenLogDialog] = useState(false);
  const [openScheduleDialog, setOpenScheduleDialog] = useState(false);
  const [openWorkOrderDialog, setOpenWorkOrderDialog] = useState(false);

  // Policy Dialogs
  const [bulkRuleOpen, setBulkRuleOpen] = useState(false);
  const [singleRuleOpen, setSingleRuleOpen] = useState(false);
  const [singleRuleSite, setSingleRuleSite] = useState<Site | null>(null);

  const [selectedSite, setSelectedSite] = useState<Site | null>(null);

  // Manual Schedule Form
  const [scheduleForm, setScheduleForm] = useState({
    next_date: "",
    schedule_notes: "",
  });

  // Work Order Creation Form
  const [woForm, setWoForm] = useState({
    technician_id: "",
    scheduled_date: "",
    notes: "",
  });

  // Log Cleaning Form
  const [logForm, setLogForm] = useState({ site_id: "", remarks: "", before: "", after: "" });

  const sb = createClient();

  async function load() {
    const [{ data: l }, { data: s }, { data: t }, { data: r }] = await Promise.all([
      sb.from("cleaning_logs").select("*, sites(name, cleaning_cycle_days, last_cleaned_on)").order("performed_at", { ascending: false }),
      sb.from("sites").select("*").order("name"),
      sb.from("profiles").select("*").eq("role", "technician").order("full_name"),
      sb.from("site_cleaning_rules").select("*"),
    ]);

    setLogs((l as any) ?? []);
    setSites((s as Site[]) ?? []);
    setTechnicians((t as Profile[]) ?? []);
    setRules((r as SiteCleaningRule[]) ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  // Calculate Suggested Date for a site strictly based on rule
  function getSuggestedDate(site: Site): { date: string | null; reason: string } {
    if (!site.last_cleaned_on) {
      return {
        date: null,
        reason: "Unable to suggest schedule: No prior cleaning log recorded for this site.",
      };
    }

    const lastCleanedMs = new Date(site.last_cleaned_on).getTime();
    if (isNaN(lastCleanedMs) || !site.cleaning_cycle_days) {
      return {
        date: null,
        reason: "Unable to suggest schedule: Invalid last cleaning date or cycle configuration.",
      };
    }

    const suggestedMs = lastCleanedMs + site.cleaning_cycle_days * 86400_000;
    const suggestedDateStr = new Date(suggestedMs).toISOString().split("T")[0];

    return {
      date: suggestedDateStr,
      reason: `Calculated automatically: Last cleaned on ${site.last_cleaned_on} + ${site.cleaning_cycle_days} day cycle.`,
    };
  }

  // Handle Option A: Save Manual Schedule Date
  async function handleSaveManualSchedule() {
    if (!selectedSite || !scheduleForm.next_date) {
      return toast.error("Please select a target cleaning date.");
    }

    const { error } = await sb
      .from("sites")
      .update({
        next_cleaning_date: scheduleForm.next_date,
        cleaning_schedule_type: "manual",
        cleaning_schedule_notes: scheduleForm.schedule_notes || "Manually scheduled by Admin",
      })
      .eq("id", selectedSite.id);

    if (error) {
      return toast.error(error.message);
    }

    toast.success(`Cleaning date manually scheduled for ${selectedSite.name}`);
    setOpenScheduleDialog(false);
    setSelectedSite(null);
    load();
  }

  // Handle Option B: Approve Suggested Schedule Date
  async function handleApproveSuggestedSchedule(site: Site, suggestedDate: string) {
    const { error } = await sb
      .from("sites")
      .update({
        next_cleaning_date: suggestedDate,
        cleaning_schedule_type: "approved",
        cleaning_schedule_notes: `Suggested cycle date approved by Admin on ${new Date().toISOString().split("T")[0]}`,
      })
      .eq("id", site.id);

    if (error) {
      return toast.error(error.message);
    }

    toast.success(`Suggested cleaning date approved for ${site.name}`);
    load();
  }

  // Create Work Order from Schedule
  async function handleCreateWorkOrder() {
    if (!selectedSite || !woForm.scheduled_date) {
      return toast.error("Scheduled date is required.");
    }

    const {
      data: { user },
    } = await sb.auth.getUser();

    const { error } = await sb.from("work_orders").insert({
      org_id: selectedSite.org_id,
      site_id: selectedSite.id,
      technician_id: woForm.technician_id || null,
      created_by: user?.id || null,
      title: `Panel Cleaning: ${selectedSite.name}`,
      description: woForm.notes || `Scheduled solar panel module cleaning work order.`,
      type: "cleaning",
      status: "scheduled",
      scheduled_date: woForm.scheduled_date,
      estimated_duration_mins: 120,
    });

    if (error) {
      return toast.error(error.message);
    }

    toast.success(`Cleaning work order created for ${selectedSite.name}`);
    setOpenWorkOrderDialog(false);
    setSelectedSite(null);
    load();
  }

  // Upload photo handler
  async function uploadPhoto(file: File, kind: "before" | "after") {
    const path = `cleaning/${crypto.randomUUID()}-${kind}-${file.name}`;
    const { error } = await sb.storage.from("solar-uploads").upload(path, file, { upsert: true });
    if (error) {
      toast.error(error.message);
      return;
    }
    const { data } = sb.storage.from("solar-uploads").getPublicUrl(path);
    setLogForm((f) => ({ ...f, [kind]: data.publicUrl }));
    toast.success(`${kind} photo uploaded`);
  }

  // Submit Cleaning Log
  async function submitLog() {
    if (!logForm.site_id) return toast.error("Select a site");
    const {
      data: { user },
    } = await sb.auth.getUser();

    const site = sites.find((s) => s.id === logForm.site_id);
    const nextDue = site ? new Date(Date.now() + site.cleaning_cycle_days * 86400_000).toISOString().slice(0, 10) : null;

    const { error } = await sb.from("cleaning_logs").insert({
      site_id: logForm.site_id,
      performed_by: user?.id ?? null,
      performed_at: new Date().toISOString(),
      next_due_on: nextDue,
      remarks: logForm.remarks,
      before_photo_url: logForm.before || null,
      after_photo_url: logForm.after || null,
    });

    if (error) return toast.error(error.message);

    await sb
      .from("sites")
      .update({
        last_cleaned_on: new Date().toISOString().slice(0, 10),
        next_cleaning_date: nextDue,
        cleaning_schedule_type: "suggested",
      })
      .eq("id", logForm.site_id);

    toast.success("Cleaning log recorded");
    setOpenLogDialog(false);
    setLogForm({ site_id: "", remarks: "", before: "", after: "" });
    load();
  }

  return (
    <div className="space-y-6 pb-12" data-testid="cleaning-page">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
            Cleaning Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Option A manual scheduling, Option B suggested cycle calculations, work order dispatches, and compliance logs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="text-xs h-9 gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
            onClick={() => setBulkRuleOpen(true)}
          >
            <Settings className="h-4 w-4 text-primary" />
            <span>Site Cleaning Policies</span>
          </Button>

          <Button asChild variant="outline" className="text-xs h-9 gap-1.5 border-muted-foreground/30 text-foreground">
            <Link href="/cleaning/planner">
              <Calendar className="h-4 w-4 text-amber-500" />
              <span>Open Monthly Workforce Planner</span>
            </Link>
          </Button>

          <Dialog open={openLogDialog} onOpenChange={setOpenLogDialog}>
            <DialogTrigger asChild>
              <Button data-testid="new-cleaning-btn" variant="default" className="text-xs h-9">
                <Plus className="h-4 w-4 mr-1.5" /> Log Cleaning Execution
              </Button>
            </DialogTrigger>
            <DialogContent>
            <DialogHeader>
              <DialogTitle>Log Completed Cleaning</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Site</Label>
                <Select value={logForm.site_id} onValueChange={(v) => setLogForm({ ...logForm, site_id: v })}>
                  <SelectTrigger data-testid="cleaning-site">
                    <SelectValue placeholder="Select site" />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Remarks</Label>
                <Textarea
                  value={logForm.remarks}
                  onChange={(e) => setLogForm({ ...logForm, remarks: e.target.value })}
                  placeholder="Notes on module cleanliness, water pressure, or structural damage..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Before Photo</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0], "before")}
                  />
                  {logForm.before && <span className="text-xs text-emerald-600 font-medium">uploaded ✓</span>}
                </div>
                <div className="space-y-1.5">
                  <Label>After Photo</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0], "after")}
                  />
                  {logForm.after && <span className="text-xs text-emerald-600 font-medium">uploaded ✓</span>}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={submitLog} data-testid="cleaning-submit">
                <Camera className="h-4 w-4 mr-1.5" /> Submit Log
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="schedules" className="space-y-6">
        <TabsList className="bg-muted p-1">
          <TabsTrigger value="schedules" className="text-xs font-semibold px-4">
            Cleaning Schedules & Work Orders
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs font-semibold px-4">
            Cleaning Log History ({logs.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Schedules & Work Orders */}
        <TabsContent value="schedules" className="space-y-6">
          <Card className="border shadow-sm">
            <CardHeader className="p-6 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-bold">Fleet Site Cleaning Schedules</CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Manage cleaning schedule dates for all 35 operational sites. Distinguish between Manual, Suggested, and Approved schedules.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader className="bg-muted/50 uppercase tracking-wider font-semibold">
                    <TableRow>
                      <TableHead className="py-3 px-6">Site</TableHead>
                      <TableHead className="py-3 px-4">Last Cleaned</TableHead>
                      <TableHead className="py-3 px-4">Cycle</TableHead>
                      <TableHead className="py-3 px-4">Suggested Next Date</TableHead>
                      <TableHead className="py-3 px-4">Current Scheduled Date</TableHead>
                      <TableHead className="py-3 px-6 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sites.map((site) => {
                      const suggestion = getSuggestedDate(site);
                      const isSuggestedAvailable = suggestion.date !== null;

                      let statusBadge = (
                        <Badge variant="outline" className="text-[10px] px-2 py-0.5 capitalize">
                          {site.cleaning_schedule_type || "Unscheduled"}
                        </Badge>
                      );

                      if (site.cleaning_schedule_type === "approved") {
                        statusBadge = (
                          <Badge variant="success" className="text-[10px] px-2 py-0.5 font-medium">
                            Approved
                          </Badge>
                        );
                      } else if (site.cleaning_schedule_type === "manual") {
                        statusBadge = (
                          <Badge variant="secondary" className="text-[10px] px-2 py-0.5 font-medium">
                            Manually Scheduled
                          </Badge>
                        );
                      } else if (site.cleaning_schedule_type === "suggested") {
                        statusBadge = (
                          <Badge variant="warning" className="text-[10px] px-2 py-0.5 font-medium">
                            Suggested
                          </Badge>
                        );
                      }

                      return (
                        <TableRow key={site.id} className="hover:bg-muted/30">
                          <TableCell className="py-3.5 px-6 font-semibold">
                            <div className="space-y-0.5">
                              <div className="text-foreground">{site.name}</div>
                              <div className="text-muted-foreground text-[11px] font-normal">{site.location}</div>
                            </div>
                          </TableCell>

                          <TableCell className="py-3.5 px-4 font-mono">
                            {site.last_cleaned_on ? (
                              formatDate(site.last_cleaned_on)
                            ) : (
                              <span className="text-muted-foreground italic">Never recorded</span>
                            )}
                          </TableCell>

                          <TableCell className="py-3.5 px-4 font-mono">
                            Every {site.cleaning_cycle_days} days
                          </TableCell>

                          <TableCell className="py-3.5 px-4">
                            {isSuggestedAvailable ? (
                              <div className="space-y-0.5">
                                <div className="font-mono font-semibold text-foreground flex items-center gap-1.5">
                                  <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <span>{suggestion.date}</span>
                                </div>
                                <div className="text-[10px] text-muted-foreground">Option B Cycle Rule</div>
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                <span className="text-amber-600 dark:text-amber-400 font-medium text-[11px] flex items-center gap-1">
                                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                  Unable to suggest schedule
                                </span>
                                <div className="text-[10px] text-muted-foreground">Admin manual date selection required</div>
                              </div>
                            )}
                          </TableCell>

                          <TableCell className="py-3.5 px-4">
                            <div className="space-y-1">
                              <div className="font-mono font-bold text-foreground">
                                {site.next_cleaning_date || (isSuggestedAvailable ? suggestion.date : "Not set")}
                              </div>
                              <div>{statusBadge}</div>
                            </div>
                          </TableCell>

                          <TableCell className="py-3.5 px-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Configure Policy CTA */}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => {
                                  setSingleRuleSite(site);
                                  setSingleRuleOpen(true);
                                }}
                              >
                                <Settings className="h-3 w-3" />
                                <span>Configure Policy</span>
                              </Button>

                              {/* Option A: Manual Schedule CTA */}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => {
                                  setSelectedSite(site);
                                  setScheduleForm({
                                    next_date: site.next_cleaning_date || suggestion.date || "",
                                    schedule_notes: site.cleaning_schedule_notes || "",
                                  });
                                  setOpenScheduleDialog(true);
                                }}
                              >
                                <Calendar className="h-3 w-3" />
                                <span>Manual Date</span>
                              </Button>

                              {/* Option B: Approve Suggested CTA */}
                              {isSuggestedAvailable && site.cleaning_schedule_type !== "approved" && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-7 text-xs gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                  onClick={() => handleApproveSuggestedSchedule(site, suggestion.date!)}
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  <span>Approve Suggested</span>
                                </Button>
                              )}

                              {/* Dispatch Work Order CTA */}
                              <Button
                                size="sm"
                                variant="default"
                                className="h-7 text-xs gap-1"
                                onClick={() => {
                                  setSelectedSite(site);
                                  setWoForm({
                                    technician_id: "",
                                    scheduled_date: site.next_cleaning_date || suggestion.date || new Date().toISOString().split("T")[0],
                                    notes: `Solar panel module cleaning work order for ${site.name}`,
                                  });
                                  setOpenWorkOrderDialog(true);
                                }}
                              >
                                <Wrench className="h-3 w-3" />
                                <span>Create Work Order</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Execution Logs History */}
        <TabsContent value="history">
          <Card className="border shadow-sm">
            <CardHeader className="p-6 pb-4">
              <CardTitle className="text-lg font-bold">Historical Cleaning Execution Logs</CardTitle>
              <CardDescription className="text-sm">
                Verified technician cleaning records with evidence photos and remarks.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table className="text-xs">
                <TableHeader className="bg-muted/50 uppercase tracking-wider font-semibold">
                  <TableRow>
                    <TableHead className="py-3 px-6">Site</TableHead>
                    <TableHead className="py-3 px-4">Performed Date</TableHead>
                    <TableHead className="py-3 px-4">Remarks & Evidence</TableHead>
                    <TableHead className="py-3 px-6 text-right">Evidence Photos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id} className="hover:bg-muted/30">
                      <TableCell className="py-3.5 px-6 font-semibold">{l.sites?.name ?? "—"}</TableCell>
                      <TableCell className="py-3.5 px-4 font-mono">{formatDate(l.performed_at)}</TableCell>
                      <TableCell className="py-3.5 px-4 text-muted-foreground max-w-sm">
                        {l.remarks ?? "Cleaned as per schedule."}
                      </TableCell>
                      <TableCell className="py-3.5 px-6 text-right">
                        <div className="flex items-center justify-end gap-3 text-xs">
                          {l.before_photo_url ? (
                            <a className="text-primary underline font-medium" href={l.before_photo_url} target="_blank" rel="noopener noreferrer">
                              Before Photo
                            </a>
                          ) : null}
                          {l.after_photo_url ? (
                            <a className="text-primary underline font-medium" href={l.after_photo_url} target="_blank" rel="noopener noreferrer">
                              After Photo
                            </a>
                          ) : null}
                          {!l.before_photo_url && !l.after_photo_url && <span className="text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {logs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                        No historical cleaning logs recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Manual Schedule Dialog (Option A) */}
      <Dialog open={openScheduleDialog} onOpenChange={setOpenScheduleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Option A: Manual Schedule Selection</DialogTitle>
          </DialogHeader>
          {selectedSite && (
            <div className="space-y-4 text-xs">
              <div className="p-3 bg-muted/40 rounded-lg border space-y-1">
                <div className="font-bold text-sm text-foreground">{selectedSite.name}</div>
                <div className="text-muted-foreground">{selectedSite.location}</div>
                <div className="text-muted-foreground">
                  Last Cleaned: {selectedSite.last_cleaned_on ? formatDate(selectedSite.last_cleaned_on) : "Never recorded"}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Target Cleaning Date (Manual)</Label>
                <Input
                  type="date"
                  value={scheduleForm.next_date}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, next_date: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Schedule Notes / Justification</Label>
                <Textarea
                  value={scheduleForm.schedule_notes}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, schedule_notes: e.target.value })}
                  placeholder="e.g. Scheduled for monsoon post-cleaning or special dust alert"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleSaveManualSchedule} variant="default">
              Save Manual Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Work Order Dialog */}
      <Dialog open={openWorkOrderDialog} onOpenChange={setOpenWorkOrderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Cleaning Work Order</DialogTitle>
          </DialogHeader>
          {selectedSite && (
            <div className="space-y-4 text-xs">
              <div className="p-3 bg-muted/40 rounded-lg border space-y-1">
                <div className="font-bold text-sm text-foreground">{selectedSite.name}</div>
                <div className="text-muted-foreground">Formal work order dispatch for execution</div>
              </div>

              <div className="space-y-1.5">
                <Label>Scheduled Date</Label>
                <Input
                  type="date"
                  value={woForm.scheduled_date}
                  onChange={(e) => setWoForm({ ...woForm, scheduled_date: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Assign Field Technician (8 Test Accounts)</Label>
                <Select
                  value={woForm.technician_id}
                  onValueChange={(v) => setWoForm({ ...woForm, technician_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select technician (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned (Queue)</SelectItem>
                    {technicians.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.full_name} ({t.base_address || "Test Account"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Work Order Instructions</Label>
                <Textarea
                  value={woForm.notes}
                  onChange={(e) => setWoForm({ ...woForm, notes: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleCreateWorkOrder} variant="default">
              Create Work Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Site Rule Dialog */}
      <BulkRuleDialog
        open={bulkRuleOpen}
        onOpenChange={setBulkRuleOpen}
        sites={sites}
        rules={rules}
        onSaved={load}
      />

      {/* Individual Site Rule Dialog */}
      <SiteRuleDialog
        open={singleRuleOpen}
        onOpenChange={setSingleRuleOpen}
        site={singleRuleSite}
        rule={singleRuleSite ? rules.find((r) => r.site_id === singleRuleSite.id) || null : null}
        onSaved={load}
      />
    </div>
  );
}
