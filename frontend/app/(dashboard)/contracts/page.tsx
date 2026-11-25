import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ContractsBillingView } from "@/components/contracts/contracts-billing-view";
import { calculateSlaPerformance } from "@/lib/contracts/contracts-engine";
import { FileCheck2, ShieldCheck } from "lucide-react";
import { Contract } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
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

  const [contractsRes, invoicesRes, sitesRes] = await Promise.all([
    serviceClient
      .from("contracts")
      .select("*, sites(id, name, capacity_kwp, location), sla_policies(*)")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    serviceClient
      .from("billing_invoices")
      .select("*, sites(name, capacity_kwp), contracts(contract_number, contract_type, sla_tier)")
      .eq("org_id", orgId)
      .order("invoice_date", { ascending: false }),
    serviceClient.from("sites").select("id, name, capacity_kwp").order("name"),
  ]);

  const rawContracts = contractsRes.data ?? [];
  const siteIds = rawContracts.map((c) => c.site_id);

  let allTickets: any[] = [];
  if (siteIds.length > 0) {
    const { data: tData } = await serviceClient
      .from("tickets")
      .select("id, site_id, priority, status, created_at, resolved_at, sla_due_at")
      .in("site_id", siteIds);
    allTickets = tData ?? [];
  }

  // Compute live SLA performance report for each contract
  const contractsWithPerformance = rawContracts.map((contract: Contract) => {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-primary font-semibold uppercase tracking-wider mb-1">
            <FileCheck2 className="h-4 w-4" />
            <span>Operational Infrastructure</span>
          </div>
          <h1 className="text-2xl font-bold font-display tracking-tight text-foreground flex items-center gap-2.5">
            <span>SLA Tracking, Contracts & Billing</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono font-medium flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" /> AMC Governance
            </span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage annual maintenance agreements, track MTTR and uptime SLA guarantees in real time, and generate automated billing invoices.
          </p>
        </div>
      </div>

      <ContractsBillingView
        initialContracts={contractsWithPerformance}
        initialInvoices={invoicesRes.data ?? []}
        sites={sitesRes.data ?? []}
      />
    </div>
  );
}
