import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    const year = Number(body.year);
    const month = Number(body.month);

    if (!year || !month) {
      return NextResponse.json({ error: "Year and month are required" }, { status: 400 });
    }

    const cyclePeriod = `${year}-${String(month).padStart(2, "0")}`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthStartStr = `${cyclePeriod}-01`;
    const monthEndStr = `${cyclePeriod}-${String(daysInMonth).padStart(2, "0")}`;

    // 1. Fetch cleaning plan for this month
    const { data: existingPlan } = await sb
      .from("cleaning_plans")
      .select("*")
      .eq("org_id", orgId)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (existingPlan) {
      // Delete plan assignments
      await sb.from("cleaning_plan_assignments").delete().eq("plan_id", existingPlan.id);
      // Delete plan header
      await sb.from("cleaning_plans").delete().eq("id", existingPlan.id);
    }

    // 2. Reset uncompleted `cleaning_visits` for this cycle_period
    const { error: visitResetErr } = await sb
      .from("cleaning_visits")
      .update({
        scheduled_date: null,
        assigned_team_id: null,
        assigned_technician_id: null,
        status: "unscheduled",
        unscheduled_reason: "admin_cleared",
        planner_rationale: "Schedule cleared by Admin.",
        constraint_state: "valid",
        constraint_notes: null,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", orgId)
      .eq("cycle_period", cyclePeriod)
      .neq("status", "completed");

    if (visitResetErr) {
      console.error("Error resetting cleaning visits:", visitResetErr);
    }

    // 3. Delete uncompleted generated work orders (cleaning type) for this month
    const { error: woErr } = await sb
      .from("work_orders")
      .delete()
      .eq("org_id", orgId)
      .eq("type", "cleaning")
      .gte("scheduled_date", monthStartStr)
      .lte("scheduled_date", monthEndStr)
      .neq("status", "completed");

    if (woErr) {
      console.error("Error clearing work orders:", woErr);
    }

    // 4. Delete uncompleted generated routes for this month
    const { data: monthRoutes } = await sb
      .from("routes")
      .select("id")
      .eq("org_id", orgId)
      .gte("scheduled_date", monthStartStr)
      .lte("scheduled_date", monthEndStr)
      .neq("status", "completed");

    if (monthRoutes && monthRoutes.length > 0) {
      const routeIds = monthRoutes.map((r) => r.id);
      await sb.from("route_stops").delete().in("route_id", routeIds);
      await sb.from("routes").delete().in("id", routeIds);
    }

    return NextResponse.json({
      success: true,
      message: `Successfully cleared cleaning schedule for ${cyclePeriod}. Historical completed logs and evidence preserved.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Server error clearing schedule" }, { status: 500 });
  }
}
