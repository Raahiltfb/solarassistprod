import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

    // Verify user profile & access rights
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (profile.role === "client" && profile.org_id) {
      let targetSiteId: string | null = null;

      if (isSchedule) {
        const { data: wo } = await serviceClient
          .from("work_orders")
          .select("site_id")
          .eq("id", actionId)
          .maybeSingle();
        targetSiteId = wo?.site_id || null;
      } else {
        const { data: log } = await serviceClient
          .from("cleaning_logs")
          .select("site_id")
          .eq("id", actionId)
          .maybeSingle();
        targetSiteId = log?.site_id || null;
      }

      if (targetSiteId) {
        const { data: site } = await serviceClient
          .from("sites")
          .select("client_org_id")
          .eq("id", targetSiteId)
          .maybeSingle();

        if (site && site.client_org_id !== profile.org_id) {
          return NextResponse.json({ error: "Forbidden: Access denied for this site" }, { status: 403 });
        }
      }
    }

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
