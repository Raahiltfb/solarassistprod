import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateMonthlyCleaningPlan } from "@/lib/cleaning-scheduler";

export async function POST(req: Request) {
  try {
    const sb = await createClient();

    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await sb
      .from("profiles")
      .select("id, org_id, role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "epc_admin" && profile.role !== "super_admin")) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const orgId = profile.org_id || "c1e566ff-c676-4ceb-a2f1-c904783e2fa5";
    const body = await req.json();

    const year = Number(body.year) || new Date().getFullYear();
    const month = Number(body.month) || new Date().getMonth() + 1;
    const planningCapacityMins = Number(body.planning_capacity_mins) || 480;
    const schedulingToleranceDays = Number(body.scheduling_tolerance_days) || 2;

    // 1. Check existing plan state
    const { data: existingPlan } = await sb
      .from("cleaning_plans")
      .select("*")
      .eq("org_id", orgId)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (existingPlan && existingPlan.status === "published") {
      return NextResponse.json(
        { error: "Plan is already published. Unpublish or revert to draft to re-generate." },
        { status: 400 }
      );
    }

    const usePrevTemplate = body.use_previous_month_template !== false;
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;

    // 2. Fetch Sites, Rules, Teams, and Previous Month Data
    const [sitesRes, rulesRes, teamsRes, prevPlanRes, cleaningLogsRes] = await Promise.all([
      sb.from("sites").select("*").eq("org_id", orgId).order("name"),
      sb.from("site_cleaning_rules").select("*"),
      sb.from("technician_teams").select("*, technician_team_members(*, profiles(*))").eq("org_id", orgId).eq("is_active", true),
      sb.from("cleaning_plans").select("*, cleaning_plan_assignments(*)").eq("org_id", orgId).eq("year", prevYear).eq("month", prevMonth).maybeSingle(),
      sb.from("cleaning_logs").select("*").order("performed_at", { ascending: false }),
    ]);

    const sites = sitesRes.data ?? [];
    const rules = rulesRes.data ?? [];
    const teams = teamsRes.data ?? [];
    const prevPlan = prevPlanRes.data ?? null;
    const cleaningLogs = cleaningLogsRes.data ?? [];

    // Map latest actual cleaning log per site
    const latestCleanedMap = new Map<string, string>();
    for (const log of cleaningLogs) {
      if (log.site_id && !latestCleanedMap.has(log.site_id)) {
        latestCleanedMap.set(log.site_id, log.performed_at.split("T")[0]);
      }
    }

    // Enhance sites with actual last_cleaned_on if missing
    const enhancedSites = sites.map((s) => ({
      ...s,
      last_cleaned_on: s.last_cleaned_on || latestCleanedMap.get(s.id) || null,
    }));

    // 3. Run Macro Scheduler
    const result = generateMonthlyCleaningPlan({
      year,
      month,
      sites: enhancedSites,
      rules,
      teams,
      planningCapacityMins,
      schedulingToleranceDays,
    });

    // 4. Upsert `cleaning_plans` Header
    const planPayload = {
      org_id: orgId,
      year,
      month,
      status: "draft" as const,
      planning_capacity_mins: planningCapacityMins,
      scheduling_tolerance_days: schedulingToleranceDays,
      created_by: user.id,
      notes: `Generated on ${new Date().toISOString().split("T")[0]} via Assistant Macro-Scheduler`,
    };

    const { data: planRow, error: planErr } = await sb
      .from("cleaning_plans")
      .upsert(planPayload, { onConflict: "org_id,year,month" })
      .select()
      .single();

    if (planErr || !planRow) {
      return NextResponse.json({ error: planErr?.message || "Failed to save cleaning plan" }, { status: 500 });
    }

    // 5. Replace `cleaning_plan_assignments`
    await sb.from("cleaning_plan_assignments").delete().eq("plan_id", planRow.id);

    if (result.assignments.length > 0) {
      const dbAssignments = result.assignments.map((a) => ({
        plan_id: planRow.id,
        site_id: a.site_id,
        team_id: a.team_id,
        target_date: a.target_date,
        scheduled_date: a.scheduled_date,
        sequence_order: a.sequence_order,
        estimated_cleaning_mins: a.estimated_cleaning_mins,
        estimated_travel_mins: a.estimated_travel_mins,
        estimated_distance_km: a.estimated_distance_km,
        constraint_state: a.constraint_state,
        constraint_notes: a.constraint_notes,
        scheduler_rationale: a.scheduler_rationale,
      }));

      const { error: assignErr } = await sb.from("cleaning_plan_assignments").insert(dbAssignments);
      if (assignErr) {
        return NextResponse.json({ error: assignErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      plan: planRow,
      assignmentsCount: result.assignments.length,
      unconfiguredSitesCount: result.unconfiguredSites.length,
      unscheduledSitesCount: result.unscheduledSites.length,
      unconfiguredSites: result.unconfiguredSites,
      unscheduledSites: result.unscheduledSites,
      rationaleLog: result.rationaleLog,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Server error during plan generation" }, { status: 500 });
  }
}
