import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyTicketResolution } from "@/lib/verification-engine";

export async function GET(request: Request) {
  try {
    const sb = await createClient();

    // Fetch resolved / completed tickets or tickets pending verification
    const { data: tickets, error: ticketErr } = await sb
      .from("tickets")
      .select("*, inverters(*)")
      .in("status", ["resolved", "completed"])
      .order("updated_at", { ascending: false });

    if (ticketErr) throw ticketErr;

    const results = [];

    for (const ticket of tickets || []) {
      const inv = ticket.inverters;
      const invId = ticket.inverter_id;

      let postRepairTel: any[] = [];
      let peerTel: any[] = [];

      if (invId) {
        // Fetch recent post-repair string telemetry
        const { data: stData } = await sb
          .from("string_telemetry")
          .select("*")
          .order("timestamp", { ascending: false })
          .limit(20);

        postRepairTel = (stData || []).filter((t: any) => {
          if (!t.timestamp || !ticket.resolved_at) return true;
          return new Date(t.timestamp).getTime() >= new Date(ticket.resolved_at).getTime() - 15 * 60 * 1000;
        });

        peerTel = (stData || []).filter((t: any) => (t.current_a || 0) > 0.5);
      }

      const evalResult = verifyTicketResolution({
        ticket: {
          id: ticket.id,
          title: ticket.title,
          description: ticket.description,
          status: ticket.status,
          priority: ticket.priority,
          resolved_at: ticket.resolved_at || ticket.updated_at,
          created_at: ticket.created_at,
          reopened_count: ticket.reopened_count || 0,
          verification_status: ticket.verification_status,
        },
        postRepairTelemetry: postRepairTel,
        peerTelemetry: peerTel,
        inverter: inv
          ? {
              id: inv.id,
              status: inv.status,
              last_seen_at: inv.last_seen_at,
              serial_number: inv.serial_number,
            }
          : undefined,
      });

      // Apply DB state updates if verification state changed
      if (evalResult.verification_status !== ticket.verification_status || evalResult.new_status !== ticket.status) {
        const updateData: any = {
          verification_status: evalResult.verification_status,
          status: evalResult.new_status,
          pre_repair_metric: evalResult.pre_repair_metric,
          post_repair_metric: evalResult.post_repair_metric,
          verification_notes: evalResult.explanation_notes,
          reopened_count: evalResult.reopened_count,
        };

        if (evalResult.is_recovered) {
          updateData.verified_at = new Date().toISOString();
        }
        if (evalResult.new_status === "open") {
          updateData.reopened_at = new Date().toISOString();
          if (evalResult.new_priority) {
            updateData.priority = evalResult.new_priority;
          }
        }

        await sb.from("tickets").update(updateData).eq("id", ticket.id);
      }

      results.push(evalResult);
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      evaluated_count: results.length,
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
