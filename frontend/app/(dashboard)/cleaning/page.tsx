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
import { SubNav } from "@/components/sub-nav";
import { CleaningEvidenceLinks } from "@/components/cleaning-evidence-links";

export default function CleaningPage() {
  const [logs, setLogs] = useState<(CleaningLog & { sites?: { name: string; cleaning_cycle_days: number; last_cleaned_on: string | null } })[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [rules, setRules] = useState<SiteCleaningRule[]>([]);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [canonicalVisits, setCanonicalVisits] = useState<any[]>([]);
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

  // Service Request Creation Form
  const [woForm, setWoForm] = useState({
    team_id: "",
    scheduled_date: "",
    notes: "",
  });

  // Log Cleaning Form
  const [logForm, setLogForm] = useState({ site_id: "", remarks: "", before: "", after: "" });

  const sb = createClient();

  async function load() {
    const now = new Date();
    const cyclePeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const [lRes, sRes, tRes, teamsRes, rRes, cvRes] = await Promise.all([
      sb.from("cleaning_logs").select("*, sites(name, cleaning_cycle_days, last_cleaned_on)").order("performed_at", { ascending: false }),
      sb.from("sites").select("*").order("name"),
      sb.from("profiles").select("*").eq("role", "technician").order("full_name"),
      sb.from("technician_teams").select("*").eq("is_active", true).order("name"),
      sb.from("site_cleaning_rules").select("*"),
      sb.from("cleaning_visits").select("*, sites(name, last_cleaned_on, cleaning_cycle_days), technician_teams(name)").eq("cycle_period", cyclePeriod).order("target_due_date", { ascending: true }),
    ]);

    setLogs((lRes.data as any) ?? []);
    setSites((sRes.data as Site[]) ?? []);
    setTechnicians((tRes.data as Profile[]) ?? []);
    setTeams((teamsRes.data as any) ?? []);
    setRules((rRes.data as SiteCleaningRule[]) ?? []);
    setCanonicalVisits(cvRes.data ?? []);
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

  // Create Service Request from Schedule
  async function handleCreateWorkOrder() {
    if (!selectedSite || !woForm.scheduled_date) {
      return toast.error("Scheduled date is required.");
    }

    // Duplicate check
    const { data: existing } = await sb
      .from("work_orders")
      .select("id")
      .eq("site_id", selectedSite.id)
      .eq("scheduled_date", woForm.scheduled_date)
      .eq("type", "cleaning")
      .neq("status", "cancelled")
      .maybeSingle();

    if (existing) {
      return toast.error(
        `Cleaning already scheduled for this site on ${woForm.scheduled_date}. View scheduled cleaning or edit it instead.`
      );
    }

    const {
      data: { user },
    } = await sb.auth.getUser();

    const { error } = await sb.from("work_orders").insert({
      org_id: selectedSite.org_id,
      site_id: selectedSite.id,
      team_id: woForm.team_id || null,
      created_by: user?.id || null,
      title: `Panel Cleaning: ${selectedSite.name}`,
      description: woForm.notes || `Scheduled solar panel module cleaning service request.`,
      type: "cleaning",
      status: "scheduled",
      scheduled_date: woForm.scheduled_date,
      estimated_duration_mins: 120,
    });

    if (error) {
      return toast.error(error.message);
    }

    toast.success(`Cleaning service request created for ${selectedSite.name}`);
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
      <SubNav hub="operations" />

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
            Cleaning Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Option A manual scheduling, Option B suggested cycle calculations, service request dispatches, and compliance logs.
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
      <Tabs defaultValue="canonical" className="space-y-6">
        <TabsList className="bg-muted p-1">
          <TabsTrigger value="canonical" className="text-xs font-semibold px-4">
            Canonical Active Cycle Visits ({canonicalVisits.length})
          </TabsTrigger>
          <TabsTrigger value="schedules" className="text-xs font-semibold px-4">
            Site Policy Configurations ({sites.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs font-semibold px-4">
            Execution Log History ({logs.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 0: Canonical Active Cycle Visits */}
        <TabsContent value="canonical" className="space-y-6">
          <Card className="border shadow-sm">
            <CardHeader className="p-6 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-bold">Canonical Active Cycle Visits</CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Single source of truth visit records for the active monthly cycle.
                  </CardDescription>
                </div>
                <Button asChild variant="default" size="sm" className="text-xs gap-1.5">
                  <Link href="/cleaning/planner">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Open Monthly Planner</span>
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table className="text-xs">
                <TableHeader className="bg-muted/50 uppercase tracking-wider font-semibold">
                  <TableRow>
                    <TableHead className="py-3 px-6">Site</TableHead>
                    <TableHead className="py-3 px-4">Last Cleaned</TableHead>
                    <TableHead className="py-3 px-4">Cycle Length</TableHead>
                    <TableHead className="py-3 px-4">Days Overdue</TableHead>
                    <TableHead className="py-3 px-4">Target Due</TableHead>
                    <TableHead className="py-3 px-4">Scheduled Date</TableHead>
                    <TableHead className="py-3 px-4">Assigned Team</TableHead>
                    <TableHead className="py-3 px-4">Status</TableHead>
                    <TableHead className="py-3 px-6">Planner Rationale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {canonicalVisits.map((cv: any) => {
                    const lastCleanedStr = cv.sites?.last_cleaned_on;
                    const cycleDays = cv.sites?.cleaning_cycle_days || 10;
                    let daysOverdue = 0;
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    if (cv.status !== "completed") {
                      const targetMs = cv.target_due_date ? new Date(cv.target_due_date).getTime() : 0;
                      if (targetMs && today.getTime() > targetMs) {
                        daysOverdue = Math.floor((today.getTime() - targetMs) / 86400_000);
                      }
                    }

                    return (
                      <TableRow key={cv.id} className="hover:bg-muted/30">
                        <TableCell className="py-3.5 px-6 font-semibold">{cv.sites?.name || cv.site_id}</TableCell>
                        <TableCell className="py-3.5 px-4 font-mono">
                          {lastCleanedStr ? formatDate(lastCleanedStr) : <span className="text-muted-foreground italic">Never</span>}
                        </TableCell>
                        <TableCell className="py-3.5 px-4 font-mono">{cycleDays} days</TableCell>
                        <TableCell className="py-3.5 px-4 font-mono">
                          {daysOverdue > 0 ? (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5 font-medium">
                              {daysOverdue}d overdue
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground font-mono">0d</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3.5 px-4 font-mono">{cv.target_due_date}</TableCell>
                        <TableCell className="py-3.5 px-4 font-mono">{cv.scheduled_date || "—"}</TableCell>
                        <TableCell className="py-3.5 px-4">{cv.technician_teams?.name || "Unassigned"}</TableCell>
                        <TableCell className="py-3.5 px-4">
                          <Badge
                            variant={
                              cv.status === "completed"
                                ? "success"
                                : cv.status === "published" || cv.status === "en_route" || cv.status === "in_progress"
                                  ? "default"
                                  : cv.status === "unscheduled"
                                    ? "destructive"
                                    : "secondary"
                            }
                            className="capitalize text-[10px]"
                          >
                            {cv.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3.5 px-6 text-muted-foreground max-w-xs truncate" title={cv.planner_rationale || ""}>
                          {cv.planner_rationale || cv.constraint_notes || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {canonicalVisits.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                        No active cycle visits found. Open Monthly Planner to generate schedule.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 1: Schedules & Service Requests */}
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
                      <TableHead className="py-3 px-4">Policy Config</TableHead>
                      <TableHead className="py-3 px-4">Intervals</TableHead>
                      <TableHead className="py-3 px-4">Allowed Days</TableHead>
                      <TableHead className="py-3 px-6 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sites.map((site) => {
                      const rule = rules.find((r) => r.site_id === site.id);
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

                          <TableCell className="py-3.5 px-4">
                            {rule && rule.is_configured ? (
                              <Badge variant="success" className="text-[10px] px-2 py-0.5 font-medium">Configured</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] px-2 py-0.5 font-medium">Unconfigured</Badge>
                            )}
                          </TableCell>

                          <TableCell className="py-3.5 px-4 font-mono text-xs space-y-1">
                            {rule ? (
                              <>
                                <div>Normal: <span className="font-semibold">{rule.normal_interval_days}d</span></div>
                                <div>Monsoon: <span className="font-semibold">{rule.monsoon_interval_days}d</span></div>
                              </>
                            ) : (
                              <span className="text-muted-foreground italic">Not set</span>
                            )}
                          </TableCell>

                          <TableCell className="py-3.5 px-4 text-xs">
                            {rule && rule.allowed_weekdays ? (
                              <div className="font-medium text-muted-foreground">
                                {rule.allowed_weekdays.length === 7 ? "Any day" :
                                  rule.allowed_weekdays.length === 5 && rule.allowed_weekdays.every((d: number, i: number) => d === i + 1) ? "Mon - Fri" :
                                    `${rule.allowed_weekdays.length} days selected`}
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic">Not set</span>
                            )}
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
                                    next_date: site.next_cleaning_date || "",
                                    schedule_notes: site.cleaning_schedule_notes || "",
                                  });
                                  setOpenScheduleDialog(true);
                                }}
                              >
                                <Calendar className="h-3 w-3" />
                                <span>Manual Date</span>
                              </Button>

                              {/* Dispatch Service Request CTA */}
                              <Button
                                size="sm"
                                variant="default"
                                className="h-7 text-xs gap-1"
                                onClick={() => {
                                  setSelectedSite(site);
                                  setWoForm({
                                    team_id: "",
                                    scheduled_date: site.next_cleaning_date || new Date().toISOString().split("T")[0],
                                    notes: `Solar panel module cleaning service request for ${site.name}`,
                                  });
                                  setOpenWorkOrderDialog(true);
                                }}
                              >
                                <Wrench className="h-3 w-3" />
                                <span>Create Service Request</span>
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
                        <div className="space-y-1">
                          <p>{l.remarks ?? "Cleaned as per schedule."}</p>
                          {(l as any).damage_observed && (
                            <p className="text-destructive font-medium text-[10px]">
                              Damage Observed: {(l as any).damage_type}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5 px-6 text-right">
                        <CleaningEvidenceLinks
                          safetyPhotoUrl={(l as any).safety_photo_url}
                          beforePhotoUrl={l.before_photo_url}
                          afterPhotoUrl={l.after_photo_url}
                          damagePhotoUrl={(l as any).damage_photo_url}
                          damageObserved={(l as any).damage_observed}
                          className="justify-end"
                        />
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

      {/* Create Service Request Dialog */}
      <Dialog open={openWorkOrderDialog} onOpenChange={setOpenWorkOrderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Cleaning Service Request</DialogTitle>
          </DialogHeader>
          {selectedSite && (
            <div className="space-y-4 text-xs">
              <div className="p-3 bg-muted/40 rounded-lg border space-y-1">
                <div className="font-bold text-sm text-foreground">{selectedSite.name}</div>
                <div className="text-muted-foreground">Formal service request dispatch for execution</div>
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
                <Label>Assign Cleaning Team (Required for Cleaning)</Label>
                <Select
                  value={woForm.team_id}
                  onValueChange={(v) => setWoForm({ ...woForm, team_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned (Queue)</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Service Request Instructions</Label>
                <Textarea
                  value={woForm.notes}
                  onChange={(e) => setWoForm({ ...woForm, notes: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleCreateWorkOrder} variant="default">
              Create Service Request
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
