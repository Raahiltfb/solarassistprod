import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { InventoryView } from "@/components/inventory/inventory-view";
import { Package, Wrench } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "super_admin" && profile.role !== "epc_admin")) {
    redirect("/dashboard");
  }

  const orgId = profile.org_id || "ac763745-aed5-469d-9956-459fb00a337e";

  const [itemsRes, txRes, sitesRes, ticketsRes] = await Promise.all([
    serviceClient
      .from("inventory_items")
      .select("*")
      .eq("org_id", orgId)
      .order("name", { ascending: true }),
    serviceClient
      .from("inventory_transactions")
      .select("*, inventory_items(name, sku, unit_of_measure), sites(name), profiles(full_name)")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20),
    serviceClient.from("sites").select("id, name").order("name"),
    serviceClient.from("tickets").select("id, title, site_id").in("status", ["open", "in_progress", "on_hold"]).limit(50),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-primary font-semibold uppercase tracking-wider mb-1">
            <Package className="h-4 w-4" />
            <span>Operational Infrastructure</span>
          </div>
          <h1 className="text-2xl font-bold font-display tracking-tight text-foreground flex items-center gap-2.5">
            <span>Inventory & Spares Tracking</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono font-medium flex items-center gap-1">
              <Wrench className="h-3 w-3" /> Field Hardware Logistics
            </span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time tracking of fuses, MC4 connectors, SPDs, replacement modules, inverter spares, and cleaning consumables.
          </p>
        </div>
      </div>

      <InventoryView
        initialItems={itemsRes.data ?? []}
        initialTransactions={txRes.data ?? []}
        sites={sitesRes.data ?? []}
        tickets={ticketsRes.data ?? []}
      />
    </div>
  );
}
