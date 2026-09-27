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

    const body = await req.json();
    const { plan_id } = body;

    if (!plan_id) {
      return NextResponse.json({ error: "plan_id is required" }, { status: 400 });
    }

    // 1. Fetch Plan Header
    const { data: plan } = await sb.from("cleaning_plans").select("*").eq("id", plan_id).single();

    if (!plan) {
      return NextResponse.json({ error: "Cleaning plan not found" }, { status: 404 });
    }

    if (plan.status !== "approved" && plan.status !== "published") {
      return NextResponse.json(
        { error: "Plan must be in APPROVED state before publishing operational schedule." },
        { status: 400 }
      );
    }

    // 2. Fetch Assignments with Team and Site details
    const { data: assignments } = await sb
      .from("cleaning_plan_assignments")
      .select("*, sites(name, org_id), technician_teams(*, technician_team_members(technician_id))")
      .eq("plan_id", plan_id)
      .order("scheduled_date", { ascending: true })
      .order("sequence_order", { ascending: true });

    if (!assignments || assignments.length === 0) {
      return NextResponse.json({ error: "No assignments found in this monthly plan to publish." }, { status: 400 });
    }

    let publishedWorkOrdersCount = 0;
    let updatedWorkOrdersCount = 0;

    // 3. Batch Process Assignments into Work Orders & Daily Routes (IDEMPOTENT)
    for (const assign of assignments) {
      const teamMembers = assign.technician_teams?.technician_team_members || [];
      const teamLeadTechId = teamMembers[0]?.technician_id || user.id;

      // Check existing Work Order by site_id and scheduled_date for cleaning type
      const { data: existingWo } = await sb
        .from("work_orders")
        .select("id")
        .eq("site_id", assign.site_id)
        .eq("scheduled_date", assign.scheduled_date)
        .eq("type", "cleaning")
        .maybeSingle();

      let woId: string;

      if (existingWo) {
        // Update existing work order idempotently
        await sb
          .from("work_orders")
          .update({
            scheduled_date: assign.scheduled_date,
            technician_id: teamLeadTechId,
            team_id: assign.team_id,
            plan_assignment_id: assign.id,
            status: "scheduled",
            estimated_duration_mins: assign.estimated_cleaning_mins,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingWo.id);

        woId = existingWo.id;
        updatedWorkOrdersCount++;
      } else {
        // Insert new work order
        const { data: newWo, error: woErr } = await sb
          .from("work_orders")
          .insert({
            org_id: plan.org_id,
            site_id: assign.site_id,
            team_id: assign.team_id,
            plan_assignment_id: assign.id,
            technician_id: teamLeadTechId,
            created_by: user.id,
            title: `Module Cleaning: ${assign.sites?.name || "Site"}`,
            description: assign.scheduler_rationale || `Monthly planned cleaning visit for ${assign.sites?.name}`,
            type: "cleaning",
            status: "scheduled",
            scheduled_date: assign.scheduled_date,
            estimated_duration_mins: assign.estimated_cleaning_mins,
          })
          .select("id")
          .single();

        if (woErr || !newWo) {
          console.error("Error inserting work order for plan assignment:", woErr);
          continue;
        }

        woId = newWo.id;
        publishedWorkOrdersCount++;
      }

      // Upsert Daily Route for EVERY Team Member on Scheduled Date
      for (const member of teamMembers) {
        const routePayload = {
          org_id: plan.org_id,
          technician_id: member.technician_id,
          team_id: assign.team_id,
          date: assign.scheduled_date,
          status: "published" as const,
        };

        const { data: routeRow } = await sb
          .from("daily_routes")
          .upsert(routePayload, { onConflict: "technician_id,date" })
          .select("id")
          .single();

        if (routeRow) {
          // Upsert Route Stop
          await sb.from("route_stops").upsert(
            {
              route_id: routeRow.id,
              work_order_id: woId,
              sequence_order: assign.sequence_order,
              travel_time_mins: assign.estimated_travel_mins,
              distance_km: assign.estimated_distance_km,
            },
            { onConflict: "route_id,sequence_order" }
          );
        }
      }
    }

    // 4. Update Plan Header Status to Published
    await sb
      .from("cleaning_plans")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", plan_id);

    return NextResponse.json({
      success: true,
      publishedWorkOrdersCount,
      updatedWorkOrdersCount,
      message: `Published ${publishedWorkOrdersCount + updatedWorkOrdersCount} work orders and daily routes for ${assignments.length} assignments.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Server error publishing cleaning plan" }, { status: 500 });
  }
}
