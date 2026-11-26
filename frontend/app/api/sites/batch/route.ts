import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export interface BatchSiteInput {
  name: string;
  location: string;
  capacity_kwp: number;
  cleaning_cycle_days?: number;
  service_tier?: "cleaning_only" | "full_om";
  latitude?: number;
  longitude?: number;
  grid_tariff_inr_per_kwh?: number | null;
  cleaning_location_id?: string | null;
  client_id?: string | null;
  client_org_id?: string | null;
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

    const service = createServiceClient();
    const { data: userProfile } = await service
      .from("profiles")
      .select("role, org_id")
      .eq("id", user.id)
      .single();

    if (!userProfile || (userProfile.role !== "super_admin" && userProfile.role !== "epc_admin")) {
      return NextResponse.json({ error: "Forbidden: Admin privileges required" }, { status: 403 });
    }

    const body = await req.json();
    const sitesToInsert: BatchSiteInput[] = Array.isArray(body.sites) ? body.sites : [];

    if (sitesToInsert.length === 0) {
      return NextResponse.json({ error: "Payload must contain an array of sites in 'sites'" }, { status: 400 });
    }

    const orgId = userProfile.org_id || "ac763745-aed5-469d-9956-459fb00a337e";

    const siteRows = sitesToInsert.map((s) => ({
      org_id: orgId,
      name: s.name.trim(),
      location: s.location.trim(),
      capacity_kwp: Number(s.capacity_kwp) || 5.0,
      cleaning_cycle_days: Number(s.cleaning_cycle_days) || 30,
      service_tier: s.service_tier || "cleaning_only",
      latitude: typeof s.latitude === "number" ? s.latitude : 19.076,
      longitude: typeof s.longitude === "number" ? s.longitude : 72.8777,
      grid_tariff_inr_per_kwh: s.grid_tariff_inr_per_kwh ?? null,
      cleaning_location_id: s.cleaning_location_id || null,
      client_id: s.client_id || null,
      client_org_id: s.client_org_id || null,
      status: "active",
      commissioned_on: new Date().toISOString().slice(0, 10),
      timezone: "UTC+05:30",
    }));

    // 1. Batch Insert Sites
    const { data: createdSites, error: siteInsertErr } = await service
      .from("sites")
      .insert(siteRows)
      .select("id, name, capacity_kwp, cleaning_cycle_days, service_tier");

    if (siteInsertErr || !createdSites) {
      return NextResponse.json({ error: siteInsertErr?.message || "Failed to insert sites" }, { status: 500 });
    }

    // 2. Batch Provision default SiteCleaningRules for each created site
    const ruleRows = createdSites.map((site) => ({
      site_id: site.id,
      is_configured: true,
      normal_interval_days: site.cleaning_cycle_days || 30,
      monsoon_interval_days: Math.min(60, (site.cleaning_cycle_days || 30) * 2),
      monsoon_start_md: "06-01",
      monsoon_end_md: "09-30",
      allowed_weekdays: [1, 2, 3, 4, 5, 6], // Mon - Sat
      blackout_dates: [],
      estimated_cleaning_mins: 90,
      required_teams: 1,
    }));

    const { error: rulesErr } = await service
      .from("site_cleaning_rules")
      .upsert(ruleRows, { onConflict: "site_id" });

    if (rulesErr) {
      console.error("Warning: Failed to provision cleaning rules:", rulesErr);
    }

    return NextResponse.json({
      success: true,
      message: `Successfully onboarded ${createdSites.length} sites with active cleaning rules`,
      count: createdSites.length,
      sites: createdSites,
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

