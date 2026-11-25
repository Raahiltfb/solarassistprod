"use client";

import { useState } from "react";
import { 
  FileCheck2, 
  Receipt, 
  ShieldCheck, 
  AlertTriangle, 
  Clock, 
  Plus, 
  CheckCircle2, 
  Printer, 
  Search,
  DollarSign,
  TrendingUp,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { 
  Contract, 
  BillingInvoice, 
  SlaPolicy,
  ContractType,
  BillingFrequency,
  SlaTier 
} from "@/lib/types";
import { SlaPerformanceReport } from "@/lib/contracts/contracts-engine";

interface ContractWithPerformance extends Contract {
  slaPerformance?: SlaPerformanceReport;
}

interface ContractsBillingViewProps {
  initialContracts: ContractWithPerformance[];
  initialInvoices: BillingInvoice[];
  sites: Array<{ id: string; name: string; capacity_kwp: number }>;
}

export function ContractsBillingView({
  initialContracts,
  initialInvoices,
  sites,
}: ContractsBillingViewProps) {
  const [activeTab, setActiveTab] = useState<"contracts" | "sla" | "billing">("contracts");
  const [contracts, setContracts] = useState<ContractWithPerformance[]>(initialContracts);
  const [invoices, setInvoices] = useState<BillingInvoice[]>(initialInvoices);
  const [search, setSearch] = useState("");

  // Modals
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isNewContractOpen, setIsNewContractOpen] = useState(false);
  const [selectedInvoiceForView, setSelectedInvoiceForView] = useState<BillingInvoice | null>(null);

  // New Invoice Form
  const [invContractId, setInvContractId] = useState("");
  const [invNumber, setInvNumber] = useState(`INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
  const [invDueDate, setInvDueDate] = useState(new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10));
  const [invStart, setInvStart] = useState("2026-11-01");
  const [invEnd, setInvEnd] = useState("2026-11-30");
  const [invSpares, setInvSpares] = useState<number | "">(0);
  const [invPenalty, setInvPenalty] = useState<number | "">(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // KPI Calculations
  const totalContracts = contracts.length;
  const activeContracts = contracts.filter((c) => c.status === "active").length;
  const totalARR = contracts.reduce((sum, c) => sum + (c.status === "active" ? Number(c.contract_value_inr || 0) : 0), 0);
  const compliantCount = contracts.filter((c) => c.slaPerformance?.compliance_status === "COMPLIANT").length;
  const compliancePct = totalContracts > 0 ? Math.round((compliantCount / totalContracts) * 100) : 100;
  const unpaidInvoices = invoices.filter((i) => i.status === "issued" || i.status === "overdue");
  const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + Number(i.total_amount_inr || 0), 0);

  // Filtered lists
  const filteredContracts = contracts.filter((c) => {
    const q = search.trim().toLowerCase();
    const siteName = c.sites?.name?.toLowerCase() || "";
    const num = c.contract_number.toLowerCase();
    return !q || siteName.includes(q) || num.includes(q);
  });

  const filteredInvoices = invoices.filter((i) => {
    const q = search.trim().toLowerCase();
    const siteName = i.sites?.name?.toLowerCase() || "";
    const num = i.invoice_number.toLowerCase();
    return !q || siteName.includes(q) || num.includes(q);
  });

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!invContractId || !invNumber) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/contracts/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contract_id: invContractId,
          invoice_number: invNumber,
          due_date: invDueDate,
          period_start: invStart,
          period_end: invEnd,
          spares_amount_inr: Number(invSpares) || 0,
          penalty_credit_inr: Number(invPenalty) || 0,
        }),
      });

      const data = await res.json();
      if (res.ok && data.invoice) {
        setInvoices((prev) => [data.invoice, ...prev]);
        setIsInvoiceModalOpen(false);
      } else {
        alert(data.error || "Failed to generate invoice");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMarkInvoicePaid(invId: string) {
    try {
      const res = await fetch("/api/contracts/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: invId,
          status: "paid",
          payment_reference: `NEFT-REC-${Math.floor(100000 + Math.random() * 900000)}`,
        }),
      });

      const data = await res.json();
      if (res.ok && data.invoice) {
        setInvoices((prev) => prev.map((i) => (i.id === invId ? { ...i, status: "paid" } : i)));
      }
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Portfolio KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border bg-card/60 shadow-xs space-y-1">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center justify-between">
            <span>Annual Recurring Revenue</span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            ₹{Math.round(totalARR).toLocaleString("en-IN")}
          </div>
          <p className="text-[10px] text-muted-foreground">{activeContracts} active AMC contracts</p>
        </div>

        <div className="p-4 rounded-xl border bg-card/60 shadow-xs space-y-1">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center justify-between">
            <span>Fleet SLA Compliance</span>
            <ShieldCheck className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">{compliancePct}%</div>
          <p className="text-[10px] text-muted-foreground">{compliantCount} of {totalContracts} plants 100% compliant</p>
        </div>

        <div className="p-4 rounded-xl border bg-card/60 shadow-xs space-y-1">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center justify-between">
            <span>Pending Receivables</span>
            <DollarSign className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
            ₹{Math.round(unpaidTotal).toLocaleString("en-IN")}
          </div>
          <p className="text-[10px] text-muted-foreground">{unpaidInvoices.length} outstanding invoices</p>
        </div>

        <div className="p-4 rounded-xl border bg-card/60 shadow-xs space-y-1">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center justify-between">
            <span>Total Invoices</span>
            <Receipt className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">{invoices.length} Issued</div>
          <p className="text-[10px] text-muted-foreground">Historical billing statements</p>
        </div>
      </div>

      {/* Main Tab Controls & Quick Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-1.5 self-start">
          <button
            type="button"
            onClick={() => setActiveTab("contracts")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "contracts"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Active Contracts ({contracts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("sla")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "sla"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Live SLA Performance
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("billing")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "billing"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Invoices & Billing ({invoices.length})
          </button>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-60">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search plant or contract..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-background"
            />
          </div>

          {activeTab === "billing" && (
            <Button
              size="sm"
              onClick={() => setIsInvoiceModalOpen(true)}
              className="gap-1.5 text-xs h-8 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Invoice</span>
            </Button>
          )}
        </div>
      </div>

      {/* TAB 1: CONTRACTS TABLE */}
      {activeTab === "contracts" && (
        <div className="border rounded-xl bg-card overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b font-medium text-muted-foreground">
                <tr>
                  <th className="p-3">Contract #</th>
                  <th className="p-3">Solar Plant</th>
                  <th className="p-3">Agreement Type</th>
                  <th className="p-3">SLA Tier</th>
                  <th className="p-3 text-right">Annual Value</th>
                  <th className="p-3 text-right">Cycle Billing</th>
                  <th className="p-3">Term Period</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredContracts.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                    <td className="p-3 font-mono font-semibold text-foreground">{c.contract_number}</td>
                    <td className="p-3">
                      <div className="font-medium text-foreground">{c.sites?.name || "Solar Site"}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{c.sites?.capacity_kwp} kWp</div>
                    </td>
                    <td className="p-3 capitalize text-muted-foreground">{c.contract_type.replace(/_/g, " ")}</td>
                    <td className="p-3">
                      <Badge variant="outline" className={`text-[10px] uppercase font-bold ${
                        c.sla_tier === "premium" ? "bg-primary/10 text-primary border-primary/30" : "bg-muted text-muted-foreground"
                      }`}>
                        {c.sla_tier}
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-foreground">
                      ₹{Number(c.contract_value_inr).toLocaleString("en-IN")}
                    </td>
                    <td className="p-3 text-right font-mono text-muted-foreground">
                      ₹{Number(c.billing_amount_per_cycle_inr).toLocaleString("en-IN")}/{c.billing_frequency === "monthly" ? "mo" : "qtr"}
                    </td>
                    <td className="p-3 text-muted-foreground font-mono text-[11px]">
                      {c.start_date} → {c.end_date}
                    </td>
                    <td className="p-3 text-center">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 uppercase">
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: LIVE SLA PERFORMANCE */}
      {activeTab === "sla" && (
        <div className="border rounded-xl bg-card overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b font-medium text-muted-foreground">
                <tr>
                  <th className="p-3">Solar Plant & SLA Tier</th>
                  <th className="p-3 text-center">Incidents</th>
                  <th className="p-3 text-center">P1 / P2 / P3</th>
                  <th className="p-3 text-center">Breaches</th>
                  <th className="p-3 text-right">Avg MTTR</th>
                  <th className="p-3 text-right">Guaranteed vs Actual Uptime</th>
                  <th className="p-3 text-right">Penalty Credit</th>
                  <th className="p-3 text-center">Compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredContracts.map((c) => {
                  const perf = c.slaPerformance;
                  const isCompliant = perf?.compliance_status === "COMPLIANT";
                  const isBreached = perf?.compliance_status === "BREACHED";

                  return (
                    <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3">
                        <div className="font-semibold text-foreground">{c.sites?.name || "Solar Site"}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {c.contract_number} • <span className="uppercase font-bold text-primary">{c.sla_tier}</span>
                        </div>
                      </td>
                      <td className="p-3 text-center font-mono font-medium">{perf?.total_incidents ?? 0}</td>
                      <td className="p-3 text-center font-mono text-muted-foreground">
                        {perf?.p1_count ?? 0} / {perf?.p2_count ?? 0} / {perf?.p3_count ?? 0}
                      </td>
                      <td className="p-3 text-center font-mono font-bold">
                        <span className={(perf?.total_breaches ?? 0) > 0 ? "text-rose-600" : "text-emerald-600"}>
                          {perf?.total_breaches ?? 0}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono font-medium">{perf?.avg_mttr_hours ?? 0} hrs</td>
                      <td className="p-3 text-right font-mono">
                        <span className="text-muted-foreground">{perf?.sla_uptime_target_pct}% / </span>
                        <span className={perf?.uptime_breached ? "text-rose-600 font-bold" : "text-emerald-600 font-bold"}>
                          {perf?.actual_uptime_pct}%
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold">
                        <span className={(perf?.penalty_credit_inr ?? 0) > 0 ? "text-rose-600" : "text-muted-foreground"}>
                          ₹{(perf?.penalty_credit_inr ?? 0).toLocaleString("en-IN")}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {isCompliant ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600">
                            <CheckCircle2 className="h-3 w-3" /> Compliant
                          </span>
                        ) : isBreached ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600">
                            <AlertTriangle className="h-3 w-3" /> Breached
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600">
                            <Clock className="h-3 w-3" /> At Risk
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: BILLING & INVOICES */}
      {activeTab === "billing" && (
        <div className="border rounded-xl bg-card overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b font-medium text-muted-foreground">
                <tr>
                  <th className="p-3">Invoice #</th>
                  <th className="p-3">Solar Plant</th>
                  <th className="p-3">Period</th>
                  <th className="p-3 text-right">AMC Base</th>
                  <th className="p-3 text-right">Spares Billed</th>
                  <th className="p-3 text-right">SLA Credit</th>
                  <th className="p-3 text-right">18% GST</th>
                  <th className="p-3 text-right">Total Payable</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredInvoices.map((inv) => {
                  const isPaid = inv.status === "paid";

                  return (
                    <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3 font-mono font-semibold text-foreground">{inv.invoice_number}</td>
                      <td className="p-3 font-medium text-foreground">{inv.sites?.name || "Solar Site"}</td>
                      <td className="p-3 text-muted-foreground font-mono text-[11px]">
                        {inv.period_start} → {inv.period_end}
                      </td>
                      <td className="p-3 text-right font-mono">₹{Number(inv.base_amount_inr).toLocaleString("en-IN")}</td>
                      <td className="p-3 text-right font-mono text-muted-foreground">
                        ₹{Number(inv.spares_amount_inr || 0).toLocaleString("en-IN")}
                      </td>
                      <td className="p-3 text-right font-mono text-rose-600">
                        {Number(inv.penalty_credit_inr) > 0 ? `-₹${Number(inv.penalty_credit_inr).toLocaleString("en-IN")}` : "₹0"}
                      </td>
                      <td className="p-3 text-right font-mono text-muted-foreground">
                        ₹{Number(inv.tax_amount_inr).toLocaleString("en-IN")}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-foreground">
                        ₹{Number(inv.total_amount_inr).toLocaleString("en-IN")}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          isPaid ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"
                        }`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isPaid && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleMarkInvoicePaid(inv.id)}
                              className="h-7 text-[11px] text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                            >
                              Mark Paid
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedInvoiceForView(inv)}
                            className="h-7 text-[11px] gap-1"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span>Statement</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredInvoices.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-muted-foreground text-xs">
                      No invoices found matching criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Generate Invoice */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-popover border text-popover-foreground rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="border-b pb-3">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" /> Generate AMC Billing Statement
              </h3>
              <p className="text-xs text-muted-foreground">Calculate billing amount based on AMC contract, logged spares, and SLA credits.</p>
            </div>

            <form onSubmit={handleCreateInvoice} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-medium">Select AMC Contract *</label>
                <select
                  value={invContractId}
                  onChange={(e) => setInvContractId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-2.5 py-1 text-xs"
                  required
                >
                  <option value="">Choose Contract</option>
                  {contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.contract_number} — {c.sites?.name} (₹{c.billing_amount_per_cycle_inr}/mo)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium">Invoice Number *</label>
                  <Input value={invNumber} onChange={(e) => setInvNumber(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <label className="font-medium">Due Date *</label>
                  <Input type="date" value={invDueDate} onChange={(e) => setInvDueDate(e.target.value)} required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium">Billing Period Start</label>
                  <Input type="date" value={invStart} onChange={(e) => setInvStart(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <label className="font-medium">Billing Period End</label>
                  <Input type="date" value={invEnd} onChange={(e) => setInvEnd(e.target.value)} required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium">Billed Spare Parts (₹)</label>
                  <Input type="number" value={invSpares} onChange={(e) => setInvSpares(e.target.value === "" ? "" : Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <label className="font-medium">SLA Penalty Credit Deduction (₹)</label>
                  <Input type="number" value={invPenalty} onChange={(e) => setInvPenalty(e.target.value === "" ? "" : Number(e.target.value))} />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsInvoiceModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? "Generating..." : "Issue Invoice"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Statement */}
      {selectedInvoiceForView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-popover border text-popover-foreground rounded-2xl shadow-2xl w-full max-w-xl p-8 space-y-6">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Official Billing Statement</span>
                <h3 className="font-bold text-xl">{selectedInvoiceForView.invoice_number}</h3>
              </div>
              <Badge variant="outline" className="text-xs uppercase font-bold text-emerald-600 bg-emerald-500/10">
                {selectedInvoiceForView.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground block">Customer & Plant:</span>
                <strong className="text-foreground text-sm">{selectedInvoiceForView.sites?.name}</strong>
              </div>
              <div className="text-right">
                <span className="text-muted-foreground block">Billing Period:</span>
                <strong className="text-foreground font-mono">{selectedInvoiceForView.period_start} → {selectedInvoiceForView.period_end}</strong>
              </div>
            </div>

            <div className="p-4 rounded-xl border bg-muted/20 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b">
                <span>Comprehensive O&M Fixed AMC Fee:</span>
                <span className="font-mono font-semibold">₹{Number(selectedInvoiceForView.base_amount_inr).toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span>Material / Spares Consumed:</span>
                <span className="font-mono">₹{Number(selectedInvoiceForView.spares_amount_inr || 0).toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between py-1 border-b text-rose-600">
                <span>SLA Uptime / Response Penalty Credit:</span>
                <span className="font-mono">-₹{Number(selectedInvoiceForView.penalty_credit_inr || 0).toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span>Integrated GST (18%):</span>
                <span className="font-mono font-semibold">₹{Number(selectedInvoiceForView.tax_amount_inr).toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between pt-2 text-sm font-bold text-foreground">
                <span>Total Amount Due:</span>
                <span className="font-mono text-primary text-base">₹{Number(selectedInvoiceForView.total_amount_inr).toLocaleString("en-IN")}</span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedInvoiceForView(null)}>
                Close
              </Button>
              <Button size="sm" onClick={() => window.print()} className="gap-2">
                <Printer className="h-4 w-4" />
                <span>Print Statement</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
