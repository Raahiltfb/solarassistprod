import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { 
  calculateInventoryValuation, 
  recordInventoryTransaction 
} from "@/lib/inventory/inventory-engine";

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
      return NextResponse.json({ error: "Access denied: Spares inventory is restricted to administrators" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const itemId = searchParams.get("item_id");

    // Single item details with recent transactions
    if (itemId) {
      const [itemRes, txRes] = await Promise.all([
        serviceClient.from("inventory_items").select("*").eq("id", itemId).single(),
        serviceClient
          .from("inventory_transactions")
          .select("*, sites(name), profiles(full_name)")
          .eq("item_id", itemId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      if (itemRes.error) {
        return NextResponse.json({ error: itemRes.error.message }, { status: 404 });
      }

      return NextResponse.json({
        item: itemRes.data,
        transactions: txRes.data ?? [],
      });
    }

    // List items query
    let query = serviceClient
      .from("inventory_items")
      .select("*")
      .order("name", { ascending: true });

    if (category && category !== "all") {
      query = query.eq("category", category);
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
    }

    const { data: items, error: itemsErr } = await query;
    if (itemsErr) {
      return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    }

    // Fetch recent 10 transactions overall
    const { data: recentTransactions } = await serviceClient
      .from("inventory_transactions")
      .select("*, inventory_items(name, sku, unit_of_measure), sites(name), profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(10);

    const valuation = calculateInventoryValuation(items ?? []);

    return NextResponse.json({
      items: items ?? [],
      valuation,
      recentTransactions: recentTransactions ?? [],
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
      return NextResponse.json({ error: "Forbidden: Administrator role required" }, { status: 403 });
    }

    const orgId = profile.org_id || "ac763745-aed5-469d-9956-459fb00a337e";
    const body = await req.json();
    const action = body.action || "create_item";

    if (action === "record_transaction") {
      const {
        item_id,
        transaction_type,
        quantity,
        site_id,
        ticket_id,
        work_order_id,
        unit_cost_inr,
        notes,
      } = body;

      if (!item_id || !transaction_type || !quantity) {
        return NextResponse.json({ error: "Missing required transaction fields" }, { status: 400 });
      }

      const res = await recordInventoryTransaction(serviceClient, {
        orgId,
        itemId: item_id,
        transactionType: transaction_type,
        quantity: Number(quantity),
        siteId: site_id || null,
        ticketId: ticket_id || null,
        workOrderId: work_order_id || null,
        performedBy: user.id,
        unitCostInr: unit_cost_inr !== undefined ? Number(unit_cost_inr) : undefined,
        notes: notes || null,
      });

      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 422 });
      }

      return NextResponse.json(res, { status: 201 });
    }

    // Default action: Create new inventory spare part item
    const {
      sku,
      name,
      category = "inverter_spare",
      description,
      unit_of_measure = "pcs",
      unit_cost_inr = 0,
      quantity_on_hand = 0,
      min_reorder_level = 5,
      storage_location = "Central Warehouse",
    } = body;

    if (!sku || !name) {
      return NextResponse.json({ error: "SKU and part name are required" }, { status: 400 });
    }

    const { data: newItem, error: createErr } = await serviceClient
      .from("inventory_items")
      .insert({
        org_id: orgId,
        sku: sku.trim().toUpperCase(),
        name: name.trim(),
        category,
        description: description || null,
        unit_of_measure: unit_of_measure || "pcs",
        unit_cost_inr: Number(unit_cost_inr || 0),
        quantity_on_hand: Number(quantity_on_hand || 0),
        min_reorder_level: Number(min_reorder_level || 5),
        storage_location: storage_location || "Central Warehouse",
        is_active: true,
      })
      .select()
      .single();

    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 422 });
    }

    // If initial quantity > 0, log initial stock receipt transaction
    if (Number(quantity_on_hand) > 0) {
      await serviceClient.from("inventory_transactions").insert({
        org_id: orgId,
        item_id: newItem.id,
        transaction_type: "stock_in",
        quantity: Number(quantity_on_hand),
        unit_cost_inr: Number(unit_cost_inr || 0),
        performed_by: user.id,
        notes: "Initial inventory setup receipt.",
      });
    }

    return NextResponse.json({ success: true, item: newItem }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
