"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  CheckCircle2,
  ArrowLeft,
  Settings,
  Rocket,
  Plus,
  Wrench,
  Check,
  AlertTriangle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Site,
  SiteCleaningRule,
  TechnicianTeam,
  CleaningPlan,
  CleaningPlanAssignment,
  PlanStatus,
} from "@/lib/types";
import { PlannerMatrix } from "@/components/cleaning/planner-matrix";
import { SiteRuleDialog } from "@/components/cleaning/site-rule-dialog";
import { BulkRuleDialog } from "@/components/cleaning/bulk-rule-dialog";
import { validateAssignmentConstraint } from "@/lib/cleaning-scheduler";

export default function CleaningPlannerPage() {
  const sb = createClient();

  const [currentDate, setCurrentDate] = useState<Date>(new Date(2026, 8, 1)); // Default Sept 2026
  const [sites, setSites] = useState<Site[]>([]);
  const [rules, setRules] = useState<SiteCleaningRule[]>([]);
  const [teams, setTeams] = useState<TechnicianTeam[]>([]);
  const [plan, setPlan] = useState<CleaningPlan | null>(null);
  const [assignments, setAssignments] = useState<CleaningPlanAssignment[]>([]);
  const [serviceRequests, setServiceRequests] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Results banner state after automatic planning
  const [planResultSummary, setPlanResultSummary] = useState<string | null>(null);

  // Dialogs
  const [singleRuleSite, setSingleRuleSite] = useState<Site | null>(null);
  const [singleRuleOpen, setSingleRuleOpen] = useState(false);
  const [bulkRuleOpen, setBulkRuleOpen] = useState(false);

  const [usePrevMonthTemplate, setUsePrevMonthTemplate] = useState(true);
  const [executionWos, setExecutionWos] = useState<any[]>([]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const monthName = currentDate.toLocaleString("en-IN", { month: "long" });

  async function loadData() {
    setLoading(true);
    try {
      const [{ data: s }, { data: r }, { data: t }, { data: wo }] = await Promise.all([
        sb.from("sites").select("*").order("name"),
        sb.from("site_cleaning_rules").select("*"),
        sb.from("technician_teams").select("*, technician_team_members(*, profiles(*))").eq("is_active", true).order("name"),
        sb.from("work_orders").select("*, sites(name)"),
      ]);

      setSites((s as Site[]) ?? []);
      setRules((r as SiteCleaningRule[]) ?? []);
      setTeams((t as TechnicianTeam[]) ?? []);
      setExecutionWos(wo?.filter(w => w.type === "cleaning") ?? []);
      setServiceRequests(wo?.filter(w => w.type !== "cleaning" && w.team_id) ?? []);

      // Fetch or create plan for this month
      const { data: p } = await sb
        .from("cleaning_plans")
        .select("*")
        .eq("year", year)
        .eq("month", month)
        .maybeSingle();

      if (p) {
        setPlan(p as CleaningPlan);
        const { data: a } = await sb
          .from("cleaning_plan_assignments")
          .select("*, sites(*), technician_teams(*)")
          .eq("plan_id", p.id)
          .order("scheduled_date", { ascending: true })
          .order("sequence_order", { ascending: true });

        setAssignments((a as CleaningPlanAssignment[]) ?? []);
      } else {
        setPlan(null);
        setAssignments([]);
      }
    } catch (err) {
      console.error("Error loading planner data:", err);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    setPlanResultSummary(null);
  }, [year, month]);

  // Compute Month Performance KPIs (Plan vs Actual)
  const totalPlanned = assignments.length;
  let completedCount = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  let missedCount = 0;
  let totalDelayDays = 0;

  const todayStr = new Date().toISOString().split("T")[0];

  assignments.forEach((assign) => {
    const matchedWo = executionWos.find(
      (wo) => wo.site_id === assign.site_id && (wo.scheduled_date === assign.scheduled_date || wo.scheduled_date === assign.target_date)
    );

    if (matchedWo?.status === "completed") {
      completedCount++;
      if (matchedWo.completed_at && assign.scheduled_date) {
        const compDate = matchedWo.completed_at.split("T")[0];
        if (compDate <= assign.scheduled_date) {
          onTimeCount++;
        } else {
          lateCount++;
          const diffDays = Math.round((new Date(compDate).getTime() - new Date(assign.scheduled_date).getTime()) / 86400_000);
          totalDelayDays += Math.max(0, diffDays);
        }
      } else {
        onTimeCount++;
      }
    } else if (assign.scheduled_date < todayStr) {
      missedCount++;
    }
  });

  const completionRate = totalPlanned > 0 ? Math.round((completedCount / totalPlanned) * 100) : 0;
  const avgDelay = completedCount > 0 ? (totalDelayDays / completedCount).toFixed(1) : "0.0";

  // Rule map lookup
  const ruleMap = new Map<string, SiteCleaningRule>();
  rules.forEach((r) => ruleMap.set(r.site_id, r));

  const unconfiguredSites = sites.filter((s) => {
    const r = ruleMap.get(s.id);
    return !r || !r.is_configured;
  });

  const conflictsCount = assignments.filter((a) => a.constraint_state !== "valid").length;

  // Month navigation range: Previous Month, Current Month, +1, +2, +3 Months
  const baseDate = new Date(2026, 8, 1); // Sept 2026
  const monthNavItems = [
    { label: "Aug 2026", year: 2026, month: 8 },
    { label: "Sep 2026", year: 2026, month: 9 },
    { label: "Oct 2026", year: 2026, month: 10 },
    { label: "Nov 2026", year: 2026, month: 11 },
    { label: "Dec 2026", year: 2026, month: 12 },
  ];

  // Trigger Automatic Optimizer
  async function handlePlanAutomatically() {
    setGenerating(true);
    setPlanResultSummary(null);

    try {
      const res = await fetch("/api/cleaning/planner/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          month,
          planning_capacity_mins: plan?.planning_capacity_mins || 480,
          scheduling_tolerance_days: plan?.scheduling_tolerance_days || 2,
          use_previous_month_template: usePrevMonthTemplate,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to plan month automatically");
      } else {
        const summaryMsg = `${monthName} planned: ${data.assignmentsCount} cleaning visits · ${teams.length} teams · ${data.unscheduledSitesCount} unscheduled`;
        setPlanResultSummary(summaryMsg);
        toast.success(summaryMsg);
        loadData();
      }
    } catch (err: any) {
      toast.error(err?.message || "Server error planning month");
    }
    setGenerating(false);
  }

  // Trigger Idempotent Publish API
  async function handlePublishSchedule() {
    if (!plan) return;
    setPublishing(true);
    try {
      const res = await fetch("/api/cleaning/planner/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: plan.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to publish schedule");
      } else {
        toast.success(data.message || "Schedule published! Today's field work dispatched.");
        loadData();
      }
    } catch (err: any) {
      toast.error(err?.message || "Server error publishing schedule");
    }
    setPublishing(false);
  }

  async function handleUpdatePlanStatus(newStatus: PlanStatus) {
    if (!plan) return;
    const { error } = await sb.from("cleaning_plans").update({ status: newStatus }).eq("id", plan.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Plan moved to ${newStatus.toUpperCase()}`);
      loadData();
    }
  }

  // Handle Manual Assignment Modifications
  async function handleUpdateAssignment(assignmentId: string, newTeamId: string, newDateStr: string) {
    const targetAssign = assignments.find((a) => a.id === assignmentId);
    if (!targetAssign) return;

    const siteObj = sites.find((s) => s.id === targetAssign.site_id);
    const rule = ruleMap.get(targetAssign.site_id);

    const sameDayTeamAssigns = assignments.filter(
      (a) => a.team_id === newTeamId && a.scheduled_date === newDateStr && a.id !== assignmentId
    );

    let dayMins = 0;
    sameDayTeamAssigns.forEach(
      (a) => (dayMins += (a.estimated_cleaning_mins || 90) + (a.estimated_travel_mins || 0))
    );
    dayMins += (targetAssign.estimated_cleaning_mins || 90) + 30;

    const validation = validateAssignmentConstraint(
      siteObj!,
      rule,
      targetAssign.target_date,
      newDateStr,
      dayMins,
      plan?.planning_capacity_mins || 480
    );

    const { error } = await sb
      .from("cleaning_plan_assignments")
      .update({
        team_id: newTeamId,
        scheduled_date: newDateStr,
        constraint_state: validation.state,
        constraint_notes: validation.notes,
        scheduler_rationale: `Manually reassigned to ${teams.find((t) => t.id === newTeamId)?.name || "Team"} on ${newDateStr}.`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", assignmentId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Updated visit for ${targetAssign.sites?.name || "Site"}`);
      loadData();
    }
  }

  async function handleRemoveAssignment(assignmentId: string) {
    const { error } = await sb.from("cleaning_plan_assignments").delete().eq("id", assignmentId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Visit removed from plan");
      loadData();
    }
  }

  async function handleAddManualAssignment(siteId: string, teamId: string, dateStr: string) {
    if (!plan) {
      const { data: newPlan, error: pErr } = await sb
        .from("cleaning_plans")
        .insert({
          org_id: "c1e566ff-c676-4ceb-a2f1-c904783e2fa5",
          year,
          month,
          status: "draft",
        })
        .select()
        .single();

      if (pErr || !newPlan) return toast.error(pErr?.message || "Failed to create plan");
      setPlan(newPlan as CleaningPlan);
    }

    const targetPlanId = plan?.id;
    if (!targetPlanId) return;

    const siteObj = sites.find((s) => s.id === siteId);
    const rule = ruleMap.get(siteId);

    const validation = validateAssignmentConstraint(
      siteObj!,
      rule,
      dateStr,
      dateStr,
      120,
      plan?.planning_capacity_mins || 480
    );

    const { error } = await sb.from("cleaning_plan_assignments").insert({
      plan_id: targetPlanId,
      site_id: siteId,
      team_id: teamId,
      target_date: dateStr,
      scheduled_date: dateStr,
      estimated_cleaning_mins: rule?.estimated_cleaning_mins || 90,
      estimated_travel_mins: 30,
      estimated_distance_km: 15,
      constraint_state: validation.state,
      constraint_notes: validation.notes,
      scheduler_rationale: `Manually added to ${teams.find((t) => t.id === teamId)?.name || "Team"} on ${dateStr}.`,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Added cleaning visit for ${siteObj?.name}`);
      loadData();
    }
  }

  return (
    <div className="space-y-6 pb-12" data-testid="cleaning-planner-page">
      {/* Header & Multi-Month Selector Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs">
              <Link href="/cleaning">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back to Cleaning
              </Link>
            </Button>
            <h1 className="text-2xl lg:text-3xl font-display font-bold tracking-tight text-foreground">
              {monthName} {year} Cleaning
            </h1>
          </div>
          <p className="text-xs text-muted-foreground">
            {sites.length} sites · {assignments.length} planned visits · {teams.length} teams
          </p>
        </div>

        {/* Multi-Month Navigation Strip */}
        <div className="flex items-center gap-1.5 bg-muted/40 p-1 border rounded-xl shadow-sm">
          {monthNavItems.map((mItem) => {
            const isSelected = mItem.year === year && mItem.month === month;
            return (
              <button
                key={`${mItem.year}-${mItem.month}`}
                type="button"
                onClick={() => setCurrentDate(new Date(mItem.year, mItem.month - 1, 1))}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono transition-colors ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background hover:text-foreground"
                }`}
              >
                {mItem.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* MONTH PERFORMANCE KPI BAR (PLAN vs ACTUAL PERFORMANCE) */}
      <div className="space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
          <span>Month Performance Metrics ({monthName} {year})</span>
          <span className="font-mono text-xs text-foreground font-normal">
            Status: <strong className="uppercase font-semibold">{plan?.status || "Draft"}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <Card className="border shadow-sm bg-card">
            <CardContent className="p-3 space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Planned</span>
              <div className="text-xl font-bold font-mono text-foreground">{totalPlanned}</div>
              <span className="text-[10px] text-muted-foreground">Visits</span>
            </CardContent>
          </Card>

          <Card className="border shadow-sm bg-card">
            <CardContent className="p-3 space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Completed</span>
              <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">{completedCount}</div>
              <span className="text-[10px] text-emerald-600 font-medium">{completionRate}% rate</span>
            </CardContent>
          </Card>

          <Card className="border shadow-sm bg-card">
            <CardContent className="p-3 space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">On-Time</span>
              <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">{onTimeCount}</div>
              <span className="text-[10px] text-muted-foreground">Schedule adherence</span>
            </CardContent>
          </Card>

          <Card className="border shadow-sm bg-card">
            <CardContent className="p-3 space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Late Visits</span>
              <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">{lateCount}</div>
              <span className="text-[10px] text-muted-foreground">Delayed execution</span>
            </CardContent>
          </Card>

          <Card className="border shadow-sm bg-card">
            <CardContent className="p-3 space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Missed</span>
              <div className="text-xl font-bold font-mono text-destructive">{missedCount}</div>
              <span className="text-[10px] text-muted-foreground">Outstanding</span>
            </CardContent>
          </Card>

          <Card className="border shadow-sm bg-card">
            <CardContent className="p-3 space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Avg Delay</span>
              <div className="text-xl font-bold font-mono text-foreground">{avgDelay}d</div>
              <span className="text-[10px] text-muted-foreground">Days per visit</span>
            </CardContent>
          </Card>

          <Card className="border shadow-sm bg-card">
            <CardContent className="p-3 space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Conflicts</span>
              <div className="text-xl font-bold font-mono text-amber-600">{conflictsCount}</div>
              <span className="text-[10px] text-muted-foreground">Rules to review</span>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Primary Operations Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-muted/30 p-4 rounded-xl border">
        <div className="flex flex-wrap items-center gap-4">
          <Button
            onClick={handlePlanAutomatically}
            disabled={generating || plan?.status === "published"}
            variant="default"
            size="sm"
            className="text-xs h-9 gap-2 shadow-sm"
          >
            <Calendar className="h-4 w-4 text-primary-foreground" />
            <span>{generating ? "Planning Month..." : `Plan ${monthName}`}</span>
          </Button>

          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={usePrevMonthTemplate}
              onChange={(e) => setUsePrevMonthTemplate(e.target.checked)}
              className="rounded text-primary"
            />
            <span>Use previous month as starting point</span>
          </label>
        </div>

        {/* Dispatch Action */}
        {assignments.length > 0 && plan && (
          <div className="flex items-center gap-3 bg-card px-3 py-1.5 rounded-md border">
            <div className="flex items-center gap-2 border-r pr-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Status:</span>
              <Badge variant={plan.status === "published" ? "success" : "secondary"} className="uppercase tracking-wide">
                {plan.status}
              </Badge>
            </div>
            {plan.status === "draft" && (
              <Button size="sm" onClick={() => handleUpdatePlanStatus("review")} variant="outline" className="h-8 text-xs">
                Submit for Review
              </Button>
            )}
            {plan.status === "review" && (
              <Button size="sm" onClick={() => handleUpdatePlanStatus("approved")} variant="outline" className="h-8 text-xs bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 border-amber-500/30">
                <Check className="h-3 w-3 mr-1" /> Approve Plan
              </Button>
            )}
            {plan.status === "approved" && (
              <Button
                onClick={handlePublishSchedule}
                disabled={publishing}
                size="sm"
                variant="default"
                className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm"
              >
                <Rocket className="h-3.5 w-3.5" />
                <span>{publishing ? "Publishing..." : "Publish to Workforce"}</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Automatic Planning Result Banner */}
      {planResultSummary && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 font-medium">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>{planResultSummary}</span>
          </div>
          <button onClick={() => setPlanResultSummary(null)} className="hover:underline text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Interactive Matrix Calendar */}
      {loading ? (
        <div className="h-96 border border-dashed rounded-xl flex items-center justify-center bg-card">
          <span className="text-xs text-muted-foreground animate-pulse">Loading monthly cleaning schedule...</span>
        </div>
      ) : (
        <PlannerMatrix
          year={year}
          month={month}
          teams={teams}
          sites={sites}
          assignments={assignments}
          serviceRequests={serviceRequests}
          planningCapacityMins={plan?.planning_capacity_mins || 480}
          schedulingToleranceDays={plan?.scheduling_tolerance_days || 2}
          onUpdateAssignment={handleUpdateAssignment}
          onRemoveAssignment={handleRemoveAssignment}
          onAddManualAssignment={handleAddManualAssignment}
        />
      )}

      {/* Bulk Site Rule Dialog */}
      <BulkRuleDialog
        open={bulkRuleOpen}
        onOpenChange={setBulkRuleOpen}
        sites={sites}
        rules={rules}
        onSaved={loadData}
      />

      {/* Individual Site Rule Dialog */}
      <SiteRuleDialog
        open={singleRuleOpen}
        onOpenChange={setSingleRuleOpen}
        site={singleRuleSite}
        rule={singleRuleSite ? ruleMap.get(singleRuleSite.id) || null : null}
        onSaved={loadData}
      />
    </div>
  );
}
