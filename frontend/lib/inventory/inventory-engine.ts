import { 
  InventoryItem, 
  InventoryTransaction, 
  InventoryTransactionType 
} from "../types";

export interface InventoryValuationSummary {
  totalValuationInr: number;
  totalSkus: number;
  totalUnits: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export type StockHealthState = "optimal" | "low_stock" | "out_of_stock";

/**
 * Returns health state of a spare part based on reorder threshold
 */
export function calculateStockStatus(item: Pick<InventoryItem, "quantity_on_hand" | "min_reorder_level">): StockHealthState {
  if (item.quantity_on_hand <= 0) {
    return "out_of_stock";
  }
  if (item.quantity_on_hand <= item.min_reorder_level) {
    return "low_stock";
  }
  return "optimal";
}

/**
 * Computes portfolio-wide valuation and stock alert counts
 */
export function calculateInventoryValuation(items: InventoryItem[]): InventoryValuationSummary {
  let totalValuationInr = 0;
  let totalUnits = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  for (const item of items) {
    const qty = Math.max(0, item.quantity_on_hand || 0);
    const cost = Number(item.unit_cost_inr || 0);
    totalValuationInr += qty * cost;
    totalUnits += qty;

    const status = calculateStockStatus(item);
    if (status === "out_of_stock") {
      outOfStockCount++;
    } else if (status === "low_stock") {
      lowStockCount++;
    }
  }

  return {
    totalValuationInr: Number(totalValuationInr.toFixed(2)),
    totalSkus: items.length,
    totalUnits,
    lowStockCount,
    outOfStockCount,
  };
}

/**
 * Filters items that require replenishment
 */
export function getLowStockAlerts(items: InventoryItem[]): InventoryItem[] {
  return items.filter((item) => item.quantity_on_hand <= item.min_reorder_level);
}

/**
 * Validates stock transaction quantities against current stock
 */
export function validateStockTransaction(
  item: Pick<InventoryItem, "quantity_on_hand">,
  type: InventoryTransactionType,
  quantity: number
): { isValid: boolean; error?: string } {
  if (typeof quantity !== "number" || quantity <= 0) {
    return { isValid: false, error: "Transaction quantity must be a positive integer" };
  }

  if (type === "consumed" || type === "transferred") {
    if (item.quantity_on_hand < quantity) {
      return {
        isValid: false,
        error: `Insufficient stock on hand (${item.quantity_on_hand} available, attempted to deduct ${quantity})`,
      };
    }
  }

  return { isValid: true };
}

export interface RecordTransactionParams {
  orgId: string;
  itemId: string;
  transactionType: InventoryTransactionType;
  quantity: number;
  siteId?: string | null;
  ticketId?: string | null;
  workOrderId?: string | null;
  performedBy?: string | null;
  unitCostInr?: number | null;
  notes?: string | null;
}

/**
 * Records an inventory transaction and updates the item's on-hand quantity atomically
 */
export async function recordInventoryTransaction(
  serviceClient: any,
  params: RecordTransactionParams
): Promise<{ success: boolean; item?: InventoryItem; transaction?: InventoryTransaction; error?: string }> {
  try {
    // 1. Fetch current item
    const { data: item, error: itemErr } = await serviceClient
      .from("inventory_items")
      .select("*")
      .eq("id", params.itemId)
      .single();

    if (itemErr || !item) {
      return { success: false, error: `Inventory item not found: ${itemErr?.message}` };
    }

    // 2. Validate transaction feasibility
    const validation = validateStockTransaction(item, params.transactionType, params.quantity);
    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }

    // 3. Compute new quantity
    let newQty = item.quantity_on_hand;
    if (params.transactionType === "stock_in" || params.transactionType === "returned") {
      newQty += params.quantity;
    } else if (params.transactionType === "consumed" || params.transactionType === "transferred") {
      newQty -= params.quantity;
    } else if (params.transactionType === "adjusted") {
      newQty = params.quantity;
    }

    // 4. Update inventory_items
    const { data: updatedItem, error: updateErr } = await serviceClient
      .from("inventory_items")
      .update({
        quantity_on_hand: newQty,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.itemId)
      .select()
      .single();

    if (updateErr) {
      return { success: false, error: `Failed to update inventory quantity: ${updateErr.message}` };
    }

    // 5. Insert transaction record
    const { data: txRecord, error: txErr } = await serviceClient
      .from("inventory_transactions")
      .insert({
        org_id: params.orgId,
        item_id: params.itemId,
        site_id: params.siteId || null,
        ticket_id: params.ticketId || null,
        work_order_id: params.workOrderId || null,
        transaction_type: params.transactionType,
        quantity: params.quantity,
        unit_cost_inr: params.unitCostInr ?? item.unit_cost_inr,
        performed_by: params.performedBy || null,
        notes: params.notes || null,
      })
      .select()
      .single();

    if (txErr) {
      return { success: false, error: `Failed to insert transaction log: ${txErr.message}` };
    }

    // 6. If linked to a ticket, record material remark
    if (params.ticketId && params.transactionType === "consumed") {
      await serviceClient.from("maintenance_remarks").insert({
        ticket_id: params.ticketId,
        technician_id: params.performedBy || null,
        remarks: `Spare part consumed: ${item.name} (${item.sku}) × ${params.quantity} ${item.unit_of_measure} @ ₹${item.unit_cost_inr}/unit.`,
      });
    }

    return {
      success: true,
      item: updatedItem,
      transaction: txRecord,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "An unexpected error occurred while recording inventory transaction",
    };
  }
}
