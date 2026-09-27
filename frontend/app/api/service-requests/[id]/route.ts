import { NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sb = process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceClient() : await createClient();

    const { data: woData, error } = await sb
      .from("work_orders")
      .select(`
        *,
        sites(*),
        tickets(id, title, priority, status, description, alert_id, alerts!tickets_alert_id_fkey(id, code, alarm_code, oem, title, description, severity))
      `)
      .eq("id", id)
      .maybeSingle();

    if (error || !woData) {
      return NextResponse.json({ error: "Service Request Not Found", id }, { status: 404 });
    }

    let assignedTechProfile = null;
    if (woData.technician_id) {
      const { data: techProf } = await sb
        .from("profiles")
        .select("id, full_name, email, phone")
        .eq("id", woData.technician_id)
        .maybeSingle();
      assignedTechProfile = techProf;
    }

    return NextResponse.json({
      success: true,
      work_order: {
        ...woData,
        profiles: assignedTechProfile,
      },
      service_request: {
        ...woData,
        profiles: assignedTechProfile,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}
