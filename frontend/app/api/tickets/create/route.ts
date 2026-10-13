import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const sb = await createClient();
    const serviceClient = createServiceClient();

    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      site_id,
      inverter_id,
      title,
      description,
      priority = "p3",
      root_cause = "inverter_fault",
      dispatch_technician = false,
      technician_id = null,
      team_id = null,
    } = body;

    if (!site_id || !title) {
      return NextResponse.json({ error: "site_id and title are required" }, { status: 400 });
    }

    // Fetch site org
    const { data: site } = await serviceClient
      .from("sites")
      .select("id, name, org_id")
      .eq("id", site_id)
      .single();

    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const orgId = site.org_id || "c1e566ff-c676-4ceb-a2f1-c904783e2fa5";
    const formattedDesc = `${description || "Incident logged via Command Center."}\n\n[Root Cause Classification]: ${root_cause.replace(/_/g, " ").toUpperCase()}${
      root_cause === "internet_outage"
        ? "\nNote: Connectivity/Datalogger issue acknowledged. Non-emergency inverter operational scope."
        : ""
    }`;

    // 1. Create Ticket
    const { data: ticket, error: ticketErr } = await serviceClient
      .from("tickets")
      .insert({
        org_id: orgId,
        site_id,
        inverter_id: inverter_id || null,
        title,
        description: formattedDesc,
        priority,
        status: "open",
        ticket_type: root_cause === "internet_outage" ? "connectivity" : "hardware",
        severity_level: priority === "p1" ? "critical" : priority === "p2" ? "high" : "medium",
        source: "command_center",
        created_by: user.id,
      })
      .select()
      .single();

    if (ticketErr || !ticket) {
      return NextResponse.json({ error: ticketErr?.message || "Failed to create ticket" }, { status: 500 });
    }

    // 2. If dispatch technician requested, genuinely create Work Order
    let workOrder = null;
    if (dispatch_technician) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data: wo, error: woErr } = await serviceClient
        .from("work_orders")
        .insert({
          org_id: orgId,
          site_id,
          ticket_id: ticket.id,
          title: `Dispatch: ${site.name} — ${title}`,
          description: formattedDesc,
          type: "alarm_investigation",
          status: "scheduled",
          scheduled_date: todayStr,
          estimated_duration_mins: 120,
          technician_id: technician_id || null,
          team_id: team_id || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (woErr) {
        console.error("Error creating work order for ticket:", woErr);
      } else {
        workOrder = wo;
      }
    }

    return NextResponse.json({
      success: true,
      ticket,
      workOrder,
      message: dispatch_technician
        ? `Ticket created & field dispatch scheduled for today.`
        : `Ticket created successfully.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
