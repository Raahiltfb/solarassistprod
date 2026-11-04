import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyTicketResolution } from "@/lib/verification-engine";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const secret = req.nextUrl.searchParams.get("secret");
    const cronSecret = process.env.CRON_SECRET;

    const isAuthorized =
      !cronSecret ||
      secret === cronSecret ||
      authHeader === `Bearer ${cronSecret}`;

    if (!isAuthorized) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const sb = createServiceClient();

    // Fetch resolved / completed tickets pending verification or currently under verification.
    // Order by created_at ASC to ensure FIFO processing and prevent older tickets from being starved.
    const { data: tickets, error: ticketErr } = await sb
      .from("tickets")
      .select(`
        *,
        alerts (
          id,
          code,
          title,
          inverter_id,
          inverters (
            id,
            status,
            last_seen_at,
            serial_number,
            model
          )
        )
      `)
      .eq("status", "resolved")
      .in("verification_status", ["pending", "under_verification"])
      .order("created_at", { ascending: true })
      .limit(50);

    if (ticketErr) throw ticketErr;

    const results = [];

    for (const ticket of tickets || []) {
      const alert = Array.isArray(ticket.alerts) ? ticket.alerts[0] : ticket.alerts;
      const inv = alert?.inverters || null;
      const invId = alert?.inverter_id || ticket.inverter_id || null;

      let postRepairTel: any[] = [];
      let peerTel: any[] = [];

      if (invId) {
        // Fetch string IDs belonging to this inverter
        const { data: invStrings } = await sb
          .from("strings")
          .select("id")
          .eq("inverter_id", invId);

        const strIds = (invStrings || []).map((s: any) => s.id);

        if (strIds.length > 0) {
          // Fetch recent post-repair string telemetry for this specific inverter's strings
          const { data: stData } = await sb
            .from("string_telemetry")
            .select("*")
            .in("string_id", strIds)
            .order("timestamp", { ascending: false })
            .limit(40);

          postRepairTel = (stData || []).filter((t: any) => {
            if (!t.timestamp || !ticket.resolved_at) return true;
            return new Date(t.timestamp).getTime() >= new Date(ticket.resolved_at).getTime() - 15 * 60 * 1000;
          });

          peerTel = (stData || []).filter((t: any) => (t.current_a || 0) > 0.5);
        }
      }

      const evalResult = verifyTicketResolution({
        ticket: {
          id: ticket.id,
          title: ticket.title,
          description: ticket.description,
          status: ticket.status,
          priority: ticket.priority,
          resolved_at: ticket.resolved_at || ticket.created_at,
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
