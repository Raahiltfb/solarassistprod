import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceClient = createServiceClient();
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get("site_id");
    const month = searchParams.get("month"); // e.g. "2026-10"
    const action = searchParams.get("action") || "status";

    // Permission check for client
    if (profile.role === "client" && siteId && siteId !== "all") {
      const { data: site } = await serviceClient
        .from("sites")
        .select("id, client_id, client_org_id, org_id")
        .eq("id", siteId)
        .single();

      if (!site) {
        return NextResponse.json({ error: "Site not found" }, { status: 404 });
      }

      const hasAccess =
        site.client_id === profile.id ||
        (profile.org_id && (site.client_org_id === profile.org_id || site.org_id === profile.org_id));

      if (!hasAccess) {
        return NextResponse.json({ error: "Access denied to this site" }, { status: 403 });
      }
    }

    if (action === "list") {
      let query = serviceClient
        .from("monthly_report_records")
        .select("*")
        .order("year_month", { ascending: false });

      if (siteId && siteId !== "all") {
        query = query.eq("site_id", siteId);
      }

      const { data: records, error } = await query;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ reports: records ?? [] });
    }

    // Single month status check
    if (month) {
      let query = serviceClient
        .from("monthly_report_records")
        .select("*")
        .eq("year_month", month);

      if (siteId && siteId !== "all") {
        query = query.eq("site_id", siteId);
      }

      const { data: records } = await query.limit(1);
      const record = records?.[0] || null;

      return NextResponse.json({
        year_month: month,
        site_id: siteId || "all",
        exists: Boolean(record),
        record,
        readily_available: Boolean(record?.file_url),
        can_generate_on_demand: true,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceClient = createServiceClient();
    const body = await req.json();
    const {
      site_id,
      year_month,
      month_label,
      period_start,
      period_end,
      total_generation_kwh,
      specific_yield,
      performance_ratio,
      is_contractual_record = false,
      metadata = {},
    } = body;

    if (!year_month || !month_label || !period_start || !period_end) {
      return NextResponse.json({ error: "Missing required report parameters" }, { status: 400 });
    }

    // Upsert report record into monthly_report_records
    const { data: record, error } = await serviceClient
      .from("monthly_report_records")
      .upsert(
        {
          site_id: site_id && site_id !== "all" ? site_id : null,
          year_month,
          month_label,
          period_start,
          period_end,
          total_generation_kwh: Number(total_generation_kwh || 0),
          specific_yield: Number(specific_yield || 0),
          performance_ratio: performance_ratio ? Number(performance_ratio) : null,
          is_contractual_record,
          template_version: "v2",
          generation_status: "ready",
          metadata,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "site_id,year_month" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, record });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
