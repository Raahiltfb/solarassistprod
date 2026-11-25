"use client";

import { useState } from "react";
import { 
  Package, 
  Search, 
  Plus, 
  AlertTriangle, 
  ArrowDownRight, 
  ArrowUpRight, 
  RefreshCw, 
  History,
  Layers,
  Wrench,
  CheckCircle2,
  DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  InventoryItem, 
  InventoryTransaction, 
  InventoryCategory,
  InventoryTransactionType 
} from "@/lib/types";
import { calculateStockStatus } from "@/lib/inventory/inventory-engine";

interface InventoryViewProps {
  initialItems: InventoryItem[];
  initialTransactions: InventoryTransaction[];
  sites: Array<{ id: string; name: string }>;
  tickets: Array<{ id: string; title: string; site_id: string }>;
}

const CATEGORIES: { key: string; label: string }[] = [
  { key: "all", label: "All Spares" },
  { key: "inverter_spare", label: "Inverter Components" },
  { key: "dc_electrical", label: "DC Electrical" },
  { key: "ac_electrical", label: "AC Electrical" },
  { key: "modules", label: "PV Modules" },
  { key: "sensors_monitoring", label: "Dataloggers & Sensors" },
  { key: "cleaning_tools", label: "Cleaning Equipment" },
  { key: "consumables", label: "Cables & Consumables" },
];

export function InventoryView({ initialItems, initialTransactions, sites, tickets }: InventoryViewProps) {
  const [items, setItems] = useState<InventoryItem[]>(initialItems);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>(initialTransactions);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Modal States
  const [isNewItemOpen, setIsNewItemOpen] = useState(false);
  const [isTransactionOpen, setIsTransactionOpen] = useState(false);
  const [selectedItemForTx, setSelectedItemForTx] = useState<InventoryItem | null>(null);

  // New Item Form
  const [newSku, setNewSku] = useState("");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<InventoryCategory>("inverter_spare");
  const [newCost, setNewCost] = useState<number | "">("");
  const [newQty, setNewQty] = useState<number | "">("");
  const [newMin, setNewMin] = useState<number | "">("");
  const [newLocation, setNewLocation] = useState("Central Warehouse");
  const [newUom, setNewUom] = useState("pcs");

  // Transaction Form
  const [txType, setTxType] = useState<InventoryTransactionType>("consumed");
  const [txQty, setTxQty] = useState<number>(1);
  const [txSiteId, setTxSiteId] = useState("");
  const [txTicketId, setTxTicketId] = useState("");
  const [txNotes, setTxNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchesCat = selectedCategory === "all" || item.category === selectedCategory;
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  // KPI Calculations
  const totalValuation = items.reduce((sum, it) => sum + (it.quantity_on_hand * Number(it.unit_cost_inr || 0)), 0);
  const totalUnits = items.reduce((sum, it) => sum + it.quantity_on_hand, 0);
  const lowStockCount = items.filter((it) => it.quantity_on_hand <= it.min_reorder_level).length;

  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newSku || !newName) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_item",
          sku: newSku,
          name: newName,
          category: newCategory,
          unit_cost_inr: Number(newCost) || 0,
          quantity_on_hand: Number(newQty) || 0,
          min_reorder_level: Number(newMin) || 5,
          storage_location: newLocation,
          unit_of_measure: newUom,
        }),
      });

      const data = await res.json();
      if (res.ok && data.item) {
        setItems((prev) => [...prev, data.item]);
        setIsNewItemOpen(false);
        setNewSku("");
        setNewName("");
      } else {
        alert(data.error || "Failed to create spare item");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRecordTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedItemForTx || !txQty) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record_transaction",
          item_id: selectedItemForTx.id,
          transaction_type: txType,
          quantity: Number(txQty),
          site_id: txSiteId || null,
          ticket_id: txTicketId || null,
          notes: txNotes || null,
        }),
      });

      const data = await res.json();
      if (res.ok && data.item) {
        setItems((prev) => prev.map((it) => (it.id === data.item.id ? data.item : it)));
        if (data.transaction) {
          setTransactions((prev) => [data.transaction, ...prev]);
        }
        setIsTransactionOpen(false);
        setTxNotes("");
      } else {
        alert(data.error || "Failed to record transaction");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function openTransactionModal(item: InventoryItem, defaultType: InventoryTransactionType = "consumed") {
    setSelectedItemForTx(item);
    setTxType(defaultType);
    setTxQty(1);
    setIsTransactionOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border bg-card/60 shadow-xs space-y-1">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center justify-between">
            <span>Inventory Valuation</span>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            ₹{Math.round(totalValuation).toLocaleString("en-IN")}
          </div>
          <p className="text-[10px] text-muted-foreground">Total capitalized spares in stock</p>
        </div>

        <div className="p-4 rounded-xl border bg-card/60 shadow-xs space-y-1">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center justify-between">
            <span>Catalog Items</span>
            <Layers className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">{items.length} SKUs</div>
          <p className="text-[10px] text-muted-foreground">{totalUnits} total units tracked</p>
        </div>

        <div className="p-4 rounded-xl border bg-card/60 shadow-xs space-y-1">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center justify-between">
            <span>Reorder Alerts</span>
            <AlertTriangle className={`h-4 w-4 ${lowStockCount > 0 ? "text-amber-500" : "text-emerald-500"}`} />
          </div>
          <div className={`text-2xl font-bold font-mono ${lowStockCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
            {lowStockCount} Items
          </div>
          <p className="text-[10px] text-muted-foreground">Below minimum reorder buffer</p>
        </div>

        <div className="p-4 rounded-xl border bg-card/60 shadow-xs space-y-1">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center justify-between">
            <span>Recent Activity</span>
            <History className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">{transactions.length} Logs</div>
          <p className="text-[10px] text-muted-foreground">Stock movements recorded</p>
        </div>
      </div>

      {/* Control Bar: Search, Category Filters, and Action Buttons */}
      <div className="p-4 bg-card border rounded-xl shadow-xs space-y-3.5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search SKU or spare name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-background"
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              size="sm"
              onClick={() => setIsNewItemOpen(true)}
              className="gap-1.5 text-xs h-8"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add New Spare SKU</span>
            </Button>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => setSelectedCategory(cat.key)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                selectedCategory === cat.key
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory Items Table */}
      <div className="border rounded-xl bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/50 border-b font-medium text-muted-foreground">
              <tr>
                <th className="p-3">SKU & Spare Part</th>
                <th className="p-3">Category</th>
                <th className="p-3">Location</th>
                <th className="p-3 text-right">Unit Cost</th>
                <th className="p-3 text-right">In Stock</th>
                <th className="p-3 text-right">Min Threshold</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredItems.map((item) => {
                const status = calculateStockStatus(item);
                const isLow = status === "low_stock";
                const isOut = status === "out_of_stock";

                return (
                  <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                    <td className="p-3">
                      <div className="font-semibold text-foreground">{item.name}</div>
                      <div className="text-[11px] font-mono text-muted-foreground">{item.sku}</div>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-[10px] capitalize font-normal">
                        {item.category.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{item.storage_location}</td>
                    <td className="p-3 text-right font-mono font-medium">
                      ₹{Number(item.unit_cost_inr).toLocaleString("en-IN")}
                    </td>
                    <td className="p-3 text-right font-mono font-bold">
                      <span className={isOut ? "text-rose-600" : isLow ? "text-amber-600" : "text-foreground"}>
                        {item.quantity_on_hand} {item.unit_of_measure}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-muted-foreground">
                      {item.min_reorder_level} {item.unit_of_measure}
                    </td>
                    <td className="p-3 text-center">
                      {isOut ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600">
                          Out of Stock
                        </span>
                      ) : isLow ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600">
                          Low Stock
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600">
                          Optimal
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openTransactionModal(item, "consumed")}
                          className="h-7 text-[11px] gap-1 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                          title="Record part consumed during maintenance"
                        >
                          <Wrench className="h-3 w-3" />
                          <span>Consume</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openTransactionModal(item, "stock_in")}
                          className="h-7 text-[11px] gap-1 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                          title="Receive new stock shipment"
                        >
                          <ArrowDownRight className="h-3 w-3" />
                          <span>Receive</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground text-xs">
                    No spare parts found matching the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add New Spare Item */}
      {isNewItemOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-popover border text-popover-foreground rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="border-b pb-3">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" /> Add New Inventory Spare Part
              </h3>
              <p className="text-xs text-muted-foreground">Register an O&M replacement item into the catalog.</p>
            </div>

            <form onSubmit={handleCreateItem} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium">SKU / Part Code *</label>
                  <Input placeholder="e.g. FUSE-1000V-20A" value={newSku} onChange={(e) => setNewSku(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <label className="font-medium">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className="w-full h-9 rounded-md border border-input bg-background px-2.5 py-1 text-xs"
                  >
                    <option value="inverter_spare">Inverter Components</option>
                    <option value="dc_electrical">DC Electrical</option>
                    <option value="ac_electrical">AC Electrical</option>
                    <option value="modules">PV Modules</option>
                    <option value="sensors_monitoring">Sensors & Dataloggers</option>
                    <option value="cleaning_tools">Cleaning Tools</option>
                    <option value="consumables">Consumables</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-medium">Part Name & Specifications *</label>
                <Input placeholder="e.g. 20A 1000V DC Cartridge Fuse for Array Combiner" value={newName} onChange={(e) => setNewName(e.target.value)} required />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-medium">Unit Cost (₹)</label>
                  <Input type="number" placeholder="250" value={newCost} onChange={(e) => setNewCost(e.target.value === "" ? "" : Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <label className="font-medium">Initial Qty</label>
                  <Input type="number" placeholder="10" value={newQty} onChange={(e) => setNewQty(e.target.value === "" ? "" : Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <label className="font-medium">Min Reorder Level</label>
                  <Input type="number" placeholder="5" value={newMin} onChange={(e) => setNewMin(e.target.value === "" ? "" : Number(e.target.value))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium">Storage Location</label>
                  <Input placeholder="Central Warehouse" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="font-medium">Unit of Measure</label>
                  <Input placeholder="pcs / pairs / drums" value={newUom} onChange={(e) => setNewUom(e.target.value)} />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsNewItemOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Save Spare Part"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Record Transaction (Consume / Receive / Adjust) */}
      {isTransactionOpen && selectedItemForTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-popover border text-popover-foreground rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="border-b pb-3">
              <h3 className="font-bold text-base flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-primary" /> Stock Movement: {selectedItemForTx.name}
              </h3>
              <p className="text-xs text-muted-foreground font-mono">
                SKU: {selectedItemForTx.sku} • Current Stock: {selectedItemForTx.quantity_on_hand} {selectedItemForTx.unit_of_measure}
              </p>
            </div>

            <form onSubmit={handleRecordTransaction} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium">Transaction Type *</label>
                  <select
                    value={txType}
                    onChange={(e) => setTxType(e.target.value as any)}
                    className="w-full h-9 rounded-md border border-input bg-background px-2.5 py-1 text-xs"
                  >
                    <option value="consumed">Deduct / Consumed on Job</option>
                    <option value="stock_in">Receive New Stock (Receipt)</option>
                    <option value="transferred">Transfer to Van / Field Depot</option>
                    <option value="adjusted">Inventory Audit Count Adjustment</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-medium">Quantity ({selectedItemForTx.unit_of_measure}) *</label>
                  <Input
                    type="number"
                    min="1"
                    value={txQty}
                    onChange={(e) => setTxQty(Math.max(1, Number(e.target.value)))}
                    required
                  />
                </div>
              </div>

              {txType === "consumed" && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <label className="font-medium">Installed at Solar Plant</label>
                    <select
                      value={txSiteId}
                      onChange={(e) => setTxSiteId(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-2.5 py-1 text-xs"
                    >
                      <option value="">Select Solar Plant</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-medium">Linked Corrective Ticket</label>
                    <select
                      value={txTicketId}
                      onChange={(e) => setTxTicketId(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-2.5 py-1 text-xs"
                    >
                      <option value="">No Ticket (General Routine)</option>
                      {tickets.map((t) => (
                        <option key={t.id} value={t.id}>{t.title.slice(0, 35)}...</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="font-medium">Notes / Work Order Description</label>
                <Input
                  placeholder="e.g. Replaced burnt fuse on String #4 combiner box during morning inspection"
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsTransactionOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? "Updating..." : "Confirm Stock Adjustment"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
