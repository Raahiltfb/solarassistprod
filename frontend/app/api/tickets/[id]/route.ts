import { NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sb = process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceClient() : await createClient();

    const { data: ticketData, error } = await sb
      .from("tickets")
      .select(`
        *,
        organizations(name),
        sites(name),
        alerts!tickets_alert_id_fkey(id, title, code, alarm_code, oem, description)
      `)
      .eq("id", id)
      .maybeSingle();

    if (error || !ticketData) {
      return NextResponse.json({ error: "Ticket Not Found", id }, { status: 404 });
    }

    let assigneeProfile = null;
    if (ticketData.assignee_id) {
      const { data: profData } = await sb
        .from("profiles")
        .select("id, full_name, email, phone")
        .eq("id", ticketData.assignee_id)
        .maybeSingle();
      assigneeProfile = profData;
    }

    return NextResponse.json({
      success: true,
      ticket: {
        ...ticketData,
        profiles: assigneeProfile,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}
