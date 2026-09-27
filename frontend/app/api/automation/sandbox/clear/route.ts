import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function DELETE() {
  try {
    const sb = process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceClient() : await createClient();

    // 1. Find demo work orders and delete them
    const { data: demoWos } = await sb
      .from("work_orders")
      .select("id")
      .or("title.ilike.[DEMO%,title.ilike.[DISPATCH%,title.ilike.[SCHEDULE%,title.ilike.[INVESTIGATE%,title.ilike.[ESCALATE%");

    const woIds = (demoWos || []).map((w) => w.id);
    if (woIds.length > 0) {
      await sb.from("work_orders").delete().in("id", woIds);
    }

    // 2. Find demo tickets and delete them
    const { data: demoTickets } = await sb
      .from("tickets")
      .select("id")
      .or("title.ilike.[DEMO%,title.ilike.[DISPATCH%,title.ilike.[SCHEDULE%,title.ilike.[INVESTIGATE%,title.ilike.[ESCALATE%");

    const ticketIds = (demoTickets || []).map((t) => t.id);
    if (ticketIds.length > 0) {
      await sb.from("tickets").delete().in("id", ticketIds);
    }

    // 3. Find demo alerts and delete them
    const { data: demoAlerts } = await sb
      .from("alerts")
      .select("id")
      .or("title.ilike.[DEMO%,title.ilike.[DISPATCH%,title.ilike.[SCHEDULE%,title.ilike.[INVESTIGATE%,title.ilike.[ESCALATE%");

    const alertIds = (demoAlerts || []).map((a) => a.id);
    if (alertIds.length > 0) {
      await sb.from("alerts").delete().in("id", alertIds);
    }

    return NextResponse.json({
      success: true,
      cleared: {
        alerts: alertIds.length,
        tickets: ticketIds.length,
        work_orders: woIds.length,
      },
      message: `Cleaned ${alertIds.length} demo alerts, ${ticketIds.length} demo tickets, and ${woIds.length} demo work orders.`,
    });
  } catch (err: any) {
    console.error("Sandbox clear error:", err);
    return NextResponse.json({ error: err?.message || "Failed to clear demo data" }, { status: 500 });
  }
}
