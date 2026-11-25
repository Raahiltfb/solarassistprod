import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { 
  validateOnboardingPayload, 
  executePlantOnboarding, 
  OnboardingRequest 
} from "@/lib/onboarding/onboarding-engine";

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
      .select("role, org_id")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "super_admin" && profile.role !== "epc_admin")) {
      return NextResponse.json({ error: "Forbidden: Admin privileges required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    // Pre-flight check for duplicate name
    if (action === "check-name") {
      const name = searchParams.get("name");
      if (!name) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
      }
      const { data: existing } = await serviceClient
        .from("sites")
        .select("id, name")
        .ilike("name", name.trim())
        .limit(1);

      return NextResponse.json({
        available: !existing || existing.length === 0,
        existing: existing?.[0] || null,
      });
    }

    // Pre-flight check for duplicate inverter serial number
    if (action === "check-serial") {
      const sn = searchParams.get("sn");
      if (!sn) {
        return NextResponse.json({ error: "Serial number is required" }, { status: 400 });
      }
      const { data: existing } = await serviceClient
        .from("inverters")
        .select("id, serial_number, site_id, sites(name)")
        .ilike("serial_number", sn.trim())
        .limit(1);

      return NextResponse.json({
        available: !existing || existing.length === 0,
        existing: existing?.[0] || null,
      });
    }

    // Default: Return onboarding metadata helpers (cleaning locations, client profiles)
    const orgId = profile.org_id;
    const [locationsRes, clientsRes] = await Promise.all([
      serviceClient.from("cleaning_locations").select("id, name, address").order("name"),
      serviceClient.from("profiles").select("id, full_name, email, role").eq("role", "client").order("full_name"),
    ]);

    return NextResponse.json({
      cleaningLocations: locationsRes.data ?? [],
      clientProfiles: clientsRes.data ?? [],
      defaultOrgId: orgId,
    });
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
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("role, org_id")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "super_admin" && profile.role !== "epc_admin")) {
      return NextResponse.json({ error: "Forbidden: Admin privileges required" }, { status: 403 });
    }

    const body: OnboardingRequest = await req.json();

    // 1. Validate payload
    const validation = validateOnboardingPayload(body);
    if (!validation.isValid) {
      return NextResponse.json({ 
        error: "Validation failed", 
        details: validation.errors 
      }, { status: 400 });
    }

    // 2. Execute provisioning
    const orgId = profile.org_id || "ac763745-aed5-469d-9956-459fb00a337e";
    const result = await executePlantOnboarding(serviceClient, orgId, body);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
