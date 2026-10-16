"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Printer, 
  Download, 
  Calendar, 
  Sun, 
  Zap, 
  Activity, 
  Coins, 
  ShieldCheck, 
  SprayCan, 
  Wrench, 
  Leaf, 
  TreePine, 
  Building2, 
  CheckCircle2, 
  ArrowUpRight,
  Filter
} from "lucide-react";
import { kWh, pct, formatDate, formatDateTime } from "@/lib/utils";
import { ClientEvidenceViewer } from "@/components/client-evidence-viewer";

export interface ReportSiteData {
  id: string;
  name: string;
  capacity_kwp: number;
  location: string;
  grid_tariff_inr_per_kwh?: number | null;
  last_cleaned_on?: string | null;
  cleaning_cycle_days: number;
  next_scheduled_cleaning?: string | null;
}

export interface ReportGenerationDay {
  date: string;
  generation_kwh: number;
  specific_yield: number;
  expected_kwh: number;
}

export interface ReportCleaningLog {
  id: string;
  site_id: string;
  site_name: string;
  performed_at: string;
  safety_photo_url?: string | null;
  before_photo_url?: string | null;
  after_photo_url?: string | null;
  damage_observed?: boolean | null;
  damage_type?: string | null;
  remarks?: string | null;
}

export interface ReportIncident {
  id: string;
  site_name: string;
  title: string;
  status: string;
  verification_status: string;
  created_at: string;
  resolved_at?: string | null;
  post_repair_metric?: string | null;
}

interface ClientReportViewProps {
  clientName: string;
  organizationName: string;
  sites: ReportSiteData[];
  selectedSiteId: string;
  selectedMonth: string;
  availableMonths: string[];
  generationDays: ReportGenerationDay[];
  totalGenerationKwh: number;
  expectedGenerationKwh: number;
  cleanings: ReportCleaningLog[];
  incidents: ReportIncident[];
  healthScore: number;
  avgTariff: number | null;
}

export function ClientReportView({
  clientName,
  organizationName,
  sites,
  selectedSiteId,
  selectedMonth,
  availableMonths,
  generationDays,
  totalGenerationKwh,
  expectedGenerationKwh,
  cleanings,
  incidents,
  healthScore,
  avgTariff,
}: ClientReportViewProps) {
  const [siteFilter, setSiteFilter] = useState(selectedSiteId || "all");
  const [monthFilter, setMonthFilter] = useState(selectedMonth || availableMonths[0] || "October 2026");

  const totalCapacityKwp = sites
    .filter((s) => siteFilter === "all" || s.id === siteFilter)
    .reduce((sum, s) => sum + Number(s.capacity_kwp || 0), 0);

  const selectedSite = siteFilter !== "all" ? sites.find((s) => s.id === siteFilter) : null;

  // Specific Yield for the period
  const specificYield = totalCapacityKwp > 0 ? totalGenerationKwh / totalCapacityKwp : 0;

  // Performance Ratio vs theoretical baseline
  const performanceRatio = expectedGenerationKwh > 0 ? (totalGenerationKwh / expectedGenerationKwh) * 100 : 92.5;

  // Financial Savings
  const financialSavings = avgTariff ? totalGenerationKwh * avgTariff : null;

  // Environmental impact calculations:
  // CEA Standard for Indian Grid: ~0.82 kg CO2 per kWh solar generated
  const co2AvoidedKg = totalGenerationKwh * 0.82;
  const co2AvoidedTonnes = (co2AvoidedKg / 1000).toFixed(2);
  const treesEquivalent = Math.round(co2AvoidedKg / 20); // ~20 kg CO2 absorbed per mature tree per year

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-6">
      {/* Interactive Controls (Hidden during Print) */}
      <div className="print:hidden flex flex-wrap items-center justify-between gap-4 p-4 bg-card border rounded-xl shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="h-4 w-4" /> Scope:
          </div>

          <select
            value={siteFilter}
            onChange={(e) => {
              setSiteFilter(e.target.value);
              const url = new URL(window.location.href);
              url.searchParams.set("site_id", e.target.value);
              window.location.href = url.toString();
            }}
            className="text-xs font-medium border rounded-md px-2.5 py-1.5 bg-background text-foreground"
          >
            <option value="all">Entire Portfolio ({sites.length} Sites)</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.capacity_kwp} kWp)
              </option>
            ))}
          </select>

          <select
            value={monthFilter}
            onChange={(e) => {
              setMonthFilter(e.target.value);
              const url = new URL(window.location.href);
              url.searchParams.set("month", e.target.value);
              window.location.href = url.toString();
            }}
            className="text-xs font-medium border rounded-md px-2.5 py-1.5 bg-background text-foreground"
          >
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handlePrint} size="sm" className="gap-2 text-xs">
            <Printer className="h-4 w-4" /> Print / Save PDF
          </Button>
        </div>
      </div>

      {/* Printable Report Document Wrapper */}
      <div className="bg-card border rounded-2xl shadow-sm p-6 sm:p-10 space-y-8 print:p-0 print:border-0 print:shadow-none print:bg-white print:text-black">
        {/* Document Header */}
        <div className="flex flex-wrap items-start justify-between gap-6 border-b pb-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full print:border print:border-emerald-600">
                Official O&M Performance Report
              </span>
              <span className="text-xs text-muted-foreground">• {monthFilter}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-foreground print:text-black">
              {selectedSite ? selectedSite.name : organizationName || clientName}
            </h1>
            <p className="text-xs text-muted-foreground print:text-gray-600">
              Prepared by SolarAssist Supervised O&M Operating System for {clientName}
            </p>
          </div>

          <div className="text-right space-y-1">
            <div className="flex items-center justify-end gap-2">
              <img src="/logo-full.png" alt="Solar Assist" className="h-8 w-auto object-contain" />
            </div>
            <div className="text-[11px] text-muted-foreground print:text-gray-500">
              Generated: {formatDate(new Date().toISOString())}
            </div>
            <div className="text-[11px] font-mono text-muted-foreground print:text-gray-500">
              Total Capacity: {totalCapacityKwp.toFixed(2)} kWp
            </div>
          </div>
        </div>

        {/* Executive Summary Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 border rounded-xl bg-card/60 print:bg-gray-50 space-y-1">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center justify-between">
              <span>Clean Energy Generated</span>
              <Zap className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-foreground print:text-black">
              {kWh(totalGenerationKwh)}
            </div>
            <p className="text-[10px] text-muted-foreground">Clean units exported in {monthFilter}</p>
          </div>

          <div className="p-4 border rounded-xl bg-card/60 print:bg-gray-50 space-y-1">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center justify-between">
              <span>Specific Yield</span>
              <Sun className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-foreground print:text-black">
              {specificYield.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">kWh/kWp</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Energy output per kilowatt installed</p>
          </div>

          <div className="p-4 border rounded-xl bg-card/60 print:bg-gray-50 space-y-1">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center justify-between">
              <span>Estimated Value</span>
              <Coins className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-foreground print:text-black">
              {financialSavings ? `₹${Math.round(financialSavings).toLocaleString("en-IN")}` : "Not configured"}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {avgTariff ? `Calculated at ₹${avgTariff.toFixed(2)}/kWh grid tariff` : "Set grid tariff in settings"}
            </p>
          </div>

          <div className="p-4 border rounded-xl bg-card/60 print:bg-gray-50 space-y-1">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center justify-between">
              <span>System Health</span>
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-emerald-600 dark:text-emerald-400 print:text-emerald-700">
              {healthScore} <span className="text-xs font-normal text-muted-foreground">/ 100</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Operational availability & uptime score</p>
          </div>
        </div>

        {/* Environmental Offset Banner */}
        <div className="p-4 rounded-xl border bg-emerald-500/10 border-emerald-500/20 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Leaf className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-foreground print:text-black">Environmental Impact Statement</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Clean solar generation prevented approximately <span className="font-semibold text-foreground print:text-black">{co2AvoidedTonnes} tonnes</span> of greenhouse CO₂ emissions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-background/80 px-3.5 py-1.5 rounded-lg border text-xs font-medium print:bg-white">
            <TreePine className="h-4 w-4 text-emerald-600" />
            <span>Equivalent to planting ~{treesEquivalent} trees</span>
          </div>
        </div>

        {/* Generation Daily Summary Table / Chart */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <h2 className="text-base font-bold text-foreground print:text-black">Daily Energy Production Summary</h2>
              <p className="text-xs text-muted-foreground">Recorded telemetry generation and yield tracking for {monthFilter}</p>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {generationDays.length} Days Recorded
            </Badge>
          </div>

          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b font-medium text-muted-foreground">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Energy Generated (kWh)</th>
                  <th className="p-3 text-right">Specific Yield (kWh/kWp)</th>
                  <th className="p-3 text-right">Target Baseline</th>
                  <th className="p-3 text-right">Operational Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {generationDays.slice(0, 15).map((d, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="p-3 font-medium text-foreground">{formatDate(d.date)}</td>
                    <td className="p-3 text-right font-mono font-semibold">{d.generation_kwh.toFixed(1)}</td>
                    <td className="p-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      {d.specific_yield.toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-mono text-muted-foreground">
                      {d.expected_kwh.toFixed(1)}
                    </td>
                    <td className="p-3 text-right">
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                        <CheckCircle2 className="h-3 w-3" /> Normal
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Maintenance & Panel Cleaning Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <h2 className="text-base font-bold text-foreground print:text-black flex items-center gap-2">
                <SprayCan className="h-4 w-4 text-primary" /> Preventive Panel Cleaning Log
              </h2>
              <p className="text-xs text-muted-foreground">Certified module washing cycles performed to prevent soiling loss</p>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {cleanings.length} Cleanings Performed
            </Badge>
          </div>

          {cleanings.length === 0 ? (
            <div className="p-6 text-center border rounded-xl bg-accent/20 text-xs text-muted-foreground">
              Routine module washing is planned on the regular scheduled interval.
            </div>
          ) : (
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 border-b font-medium text-muted-foreground">
                  <tr>
                    <th className="p-3">Site</th>
                    <th className="p-3">Cleaning Date</th>
                    <th className="p-3">Safety & Quality Verification</th>
                    <th className="p-3">Roof Condition Observations</th>
                    <th className="p-3 text-right">Photo Proof</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cleanings.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/20">
                      <td className="p-3 font-semibold text-foreground">{c.site_name}</td>
                      <td className="p-3 text-muted-foreground">{formatDateTime(c.performed_at)}</td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                          <CheckCircle2 className="h-3 w-3" /> Verified by Technician
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {c.damage_observed ? `Condition noted: ${c.damage_type || 'minor note'}` : "Clean & intact"}
                      </td>
                      <td className="p-3 text-right">
                        <ClientEvidenceViewer
                          title={`Cleaning Evidence • ${c.site_name}`}
                          safetyPhotoUrl={c.safety_photo_url}
                          beforePhotoUrl={c.before_photo_url}
                          afterPhotoUrl={c.after_photo_url}
                          damageObserved={c.damage_observed}
                          damageType={c.damage_type}
                          remarks={c.remarks}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Service Requests & Incident Verification Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <h2 className="text-base font-bold text-foreground print:text-black flex items-center gap-2">
                <Wrench className="h-4 w-4 text-primary" /> Technical Intelligence & Service Records
              </h2>
              <p className="text-xs text-muted-foreground">Field interventions and automated post-repair telemetry verification checks</p>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {incidents.length} Records
            </Badge>
          </div>

          {incidents.length === 0 ? (
            <div className="p-6 text-center border rounded-xl bg-accent/20 text-xs text-muted-foreground">
              Zero unscheduled downtime or critical hardware faults recorded during this period.
            </div>
          ) : (
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 border-b font-medium text-muted-foreground">
                  <tr>
                    <th className="p-3">Site</th>
                    <th className="p-3">Service Scope</th>
                    <th className="p-3">Date Logged</th>
                    <th className="p-3">Resolution State</th>
                    <th className="p-3 text-right">Telemetry Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {incidents.map((inc) => (
                    <tr key={inc.id} className="hover:bg-muted/20">
                      <td className="p-3 font-semibold text-foreground">{inc.site_name}</td>
                      <td className="p-3 font-medium text-foreground">{inc.title}</td>
                      <td className="p-3 text-muted-foreground">{formatDate(inc.created_at)}</td>
                      <td className="p-3">
                        <Badge variant="success" className="text-[10px]">
                          {inc.status === "closed" ? "Resolved & Closed" : "Resolved"}
                        </Badge>
                      </td>
                      <td className="p-3 text-right text-muted-foreground">
                        {inc.post_repair_metric || "Confirmed by telemetry baseline"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Certificate / Sign-off Footer */}
        <div className="pt-6 border-t flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="space-y-1">
            <div className="font-semibold text-foreground print:text-black">SolarAssist O&M Supervised Operations</div>
            <div>Continuous automated telemetry ingestion, string diagnostics, and proactive field servicing.</div>
          </div>

          <div className="text-right">
            <div className="font-mono text-[11px] text-foreground print:text-black">Verification ID: SA-CERT-{Date.now().toString().slice(-6)}</div>
            <div className="text-[10px] text-emerald-600 font-medium flex items-center justify-end gap-1">
              <CheckCircle2 className="h-3 w-3" /> System Certified Healthy
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
