import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { 
  calculateSlaPerformance, 
  calculatePortfolioContractStats 
} from "@/lib/contracts/contracts-engine";
import { generateDefaultSlaPolicy } from "@/lib/onboarding/onboarding-engine";
import { Contract } from "@/lib/types";

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
      return NextResponse.json({ error: "Access denied: Contracts and SLAs are restricted to administrators" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get("site_id");

    // Contracts query
    let query = serviceClient
      .from("contracts")
      .select("*, sites(id, name, capacity_kwp, location), sla_policies(*)")
      .order("created_at", { ascending: false });

    if (siteId) {
      query = query.eq("site_id", siteId);
    }

    // Role-based scoping for client
    if (profile.role === "client") {
      const { data: clientSites } = await serviceClient
        .from("sites")
        .select("id")
        .or(`client_id.eq.${user.id},client_org_id.eq.${profile.org_id || "null"}`);

      const allowedIds = (clientSites ?? []).map((s) => s.id);
      query = query.in("site_id", allowedIds.length > 0 ? allowedIds : ["00000000-0000-0000-0000-000000000000"]);
    }

    const { data: contracts, error: contractsErr } = await query;
    if (contractsErr) {
      return NextResponse.json({ error: contractsErr.message }, { status: 500 });
    }

    // Fetch tickets for SLA analysis across these contracts
    const siteIds = (contracts ?? []).map((c) => c.site_id);
    let allTickets: any[] = [];
    if (siteIds.length > 0) {
      const { data: tData } = await serviceClient
        .from("tickets")
        .select("id, site_id, priority, status, created_at, resolved_at, sla_due_at")
        .in("site_id", siteIds);
      allTickets = tData ?? [];
    }

    // Compute SLA performance report for each contract
    const contractsWithSla = (contracts ?? []).map((contract: Contract) => {
      const siteTickets = allTickets.filter((t) => t.site_id === contract.site_id);
      const slaPolicy = Array.isArray(contract.sla_policies) && contract.sla_policies.length > 0 
        ? contract.sla_policies[0] 
        : null;

      const slaPerformance = calculateSlaPerformance({
        contract,
        slaPolicy,
        tickets: siteTickets,
      });

      return {
        ...contract,
        slaPerformance,
      };
    });

    const portfolioStats = calculatePortfolioContractStats(contracts ?? []);

    return NextResponse.json({
      contracts: contractsWithSla,
      portfolioStats,
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

    const orgId = profile.org_id || "ac763745-aed5-469d-9956-459fb00a337e";
    const body = await req.json();

    const {
      site_id,
      client_org_id,
      contract_number,
      contract_type = "comprehensive_amc",
      start_date,
      end_date,
      billing_frequency = "monthly",
      contract_value_inr,
      billing_amount_per_cycle_inr,
      sla_tier = "standard",
      payment_terms_days = 30,
      auto_renew = false,
      terms_notes,
    } = body;

    if (!site_id || !contract_number || !start_date || !end_date) {
      return NextResponse.json({ error: "Missing required contract fields" }, { status: 400 });
    }

    // 1. Create or upsert contract
    const { data: contract, error: contractErr } = await serviceClient
      .from("contracts")
      .insert({
        org_id: orgId,
        site_id,
        client_org_id: client_org_id || null,
        contract_number: contract_number.trim().toUpperCase(),
        contract_type,
        start_date,
        end_date,
        status: "active",
        billing_frequency,
        contract_value_inr: Number(contract_value_inr || 0),
        billing_amount_per_cycle_inr: Number(billing_amount_per_cycle_inr || 0),
        sla_tier,
        payment_terms_days: Number(payment_terms_days || 30),
        auto_renew: Boolean(auto_renew),
        terms_notes: terms_notes || null,
      })
      .select()
      .single();

    if (contractErr) {
      return NextResponse.json({ error: contractErr.message }, { status: 422 });
    }

    // 2. Provision SLA policy
    const slaPolicyData = generateDefaultSlaPolicy(contract.id, orgId, sla_tier);
    await serviceClient.from("sla_policies").insert(slaPolicyData);

    return NextResponse.json({ success: true, contract }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
