import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { actionId, isSchedule } = body;

    if (!actionId) {
      return NextResponse.json({ error: "Missing actionId" }, { status: 400 });
    }

    const serviceClient = createServiceClient();
    const nowIso = new Date().toISOString();

    if (isSchedule) {
      const { error } = await serviceClient
        .from("work_orders")
        .update({ client_acknowledged_at: nowIso })
        .eq("id", actionId);

      if (error) throw error;
    } else {
      const { error } = await serviceClient
        .from("cleaning_logs")
        .update({
          client_acknowledged: true,
          client_acknowledged_at: nowIso,
        })
        .eq("id", actionId);

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Acknowledge API error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to acknowledge" },
      { status: 500 }
    );
  }
}
