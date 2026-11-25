import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { calculateInvoiceBreakdown } from "@/lib/contracts/contracts-engine";

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

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const contractId = searchParams.get("contract_id");
    const siteId = searchParams.get("site_id");

    let query = serviceClient
      .from("billing_invoices")
      .select("*, sites(name, capacity_kwp), contracts(contract_number, contract_type, sla_tier)")
      .order("invoice_date", { ascending: false });

    if (contractId) {
      query = query.eq("contract_id", contractId);
    }
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

    const { data: invoices, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ invoices: invoices ?? [] });
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
      contract_id,
      invoice_number,
      invoice_date = new Date().toISOString().slice(0, 10),
      due_date,
      period_start,
      period_end,
      spares_amount_inr = 0,
      penalty_credit_inr = 0,
      notes,
    } = body;

    if (!contract_id || !invoice_number || !due_date || !period_start || !period_end) {
      return NextResponse.json({ error: "Missing required billing invoice fields" }, { status: 400 });
    }

    // Fetch contract
    const { data: contract, error: contractErr } = await serviceClient
      .from("contracts")
      .select("*")
      .eq("id", contract_id)
      .single();

    if (contractErr || !contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    const breakdown = calculateInvoiceBreakdown({
      contract,
      sparesAmountInr: Number(spares_amount_inr || 0),
      penaltyCreditInr: Number(penalty_credit_inr || 0),
    });

    const { data: newInvoice, error: invErr } = await serviceClient
      .from("billing_invoices")
      .insert({
        org_id: orgId,
        contract_id,
        site_id: contract.site_id,
        invoice_number: invoice_number.trim().toUpperCase(),
        invoice_date,
        due_date,
        period_start,
        period_end,
        base_amount_inr: breakdown.base_amount_inr,
        spares_amount_inr: breakdown.spares_amount_inr,
        penalty_credit_inr: breakdown.penalty_credit_inr,
        tax_amount_inr: breakdown.tax_amount_inr,
        total_amount_inr: breakdown.total_amount_inr,
        status: "issued",
        notes: notes || null,
      })
      .select()
      .single();

    if (invErr) {
      return NextResponse.json({ error: invErr.message }, { status: 422 });
    }

    return NextResponse.json({ success: true, invoice: newInvoice }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
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

    const body = await req.json();
    const { id, status, payment_reference } = body;

    if (!id || !status) {
      return NextResponse.json({ error: "Invoice ID and new status are required" }, { status: 400 });
    }

    const updatePayload: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === "paid") {
      updatePayload.payment_date = new Date().toISOString();
      if (payment_reference) {
        updatePayload.payment_reference = payment_reference;
      }
    }

    const { data: updated, error } = await serviceClient
      .from("billing_invoices")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    return NextResponse.json({ success: true, invoice: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
