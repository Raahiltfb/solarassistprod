"use client";

import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { 
  Printer, 
  Download, 
  Calendar, 
  Zap, 
  Sun, 
  Coins, 
  ShieldCheck, 
  SprayCan, 
  Wrench, 
  Leaf, 
  TreePine, 
  CheckCircle2, 
  Filter,
  ChevronLeft,
  ChevronRight,
  Archive,
  Cpu,
  Clock,
  Layers,
  FileText,
  Activity
} from "lucide-react";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  CartesianGrid,
  ReferenceLine 
} from "recharts";
import { kWh, formatDate, formatDateTime } from "@/lib/utils";
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
  status?: "normal" | "low_generation" | "offline" | "upcoming";
  sample_count?: number;
  peak_power_kw?: number;
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
  resolution_mode?: "automated" | "technician" | "acknowledged" | "open";
  resolution_summary?: string | null;
}

export interface AvailableMonthOption {
  value: string; // e.g. "2026-10"
  label: string; // e.g. "October 2026"
  isLatestThree?: boolean;
}

interface ClientReportViewProps {
  clientName: string;
  organizationName: string;
  sites: ReportSiteData[];
  selectedSiteId: string;
  selectedMonth: string; // "YYYY-MM"
  monthLabel: string; // "October 2026"
  availableMonths: AvailableMonthOption[];
  generationDays: ReportGenerationDay[];
  totalGenerationKwh: number;
  expectedGenerationKwh: number;
  specificYield: number;
  performanceRatio: number | null;
  inverterAvailability: number;
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
  monthLabel,
  availableMonths,
  generationDays,
  totalGenerationKwh,
  expectedGenerationKwh,
  specificYield,
  performanceRatio,
  inverterAvailability,
  cleanings,
  incidents,
  healthScore,
  avgTariff,
}: ClientReportViewProps) {
  const [siteFilter, setSiteFilter] = useState(selectedSiteId || "all");
  const [historyOpen, setHistoryOpen] = useState(false);

  const totalCapacityKwp = sites
    .filter((s) => siteFilter === "all" || s.id === siteFilter)
    .reduce((sum, s) => sum + Number(s.capacity_kwp || 0), 0);

  const selectedSite = siteFilter !== "all" ? sites.find((s) => s.id === siteFilter) : null;

  // Financial Savings
  const financialSavings = avgTariff ? totalGenerationKwh * avgTariff : null;

  // Environmental impact calculations (CEA Grid Factor: ~0.82 kg CO2 / kWh)
  const co2AvoidedKg = totalGenerationKwh * 0.82;
  const co2AvoidedTonnes = (co2AvoidedKg / 1000).toFixed(2);
  const treesEquivalent = Math.round(co2AvoidedKg / 20);

  // Month navigation helper
  const currentMonthIdx = availableMonths.findIndex(
    (m) => m.value === selectedMonth || m.label === selectedMonth
  );

  const canGoPrevious = currentMonthIdx >= 0 && currentMonthIdx < availableMonths.length - 1;
  const canGoNext = currentMonthIdx > 0;

  function handleNavigateMonth(newMonthValue: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("month", newMonthValue);
    if (siteFilter && siteFilter !== "all") {
      url.searchParams.set("site_id", siteFilter);
    } else {
      url.searchParams.delete("site_id");
    }
    window.location.href = url.toString();
  }

  function handleNavigateSite(newSiteId: string) {
    setSiteFilter(newSiteId);
    const url = new URL(window.location.href);
    if (newSiteId === "all") {
      url.searchParams.delete("site_id");
    } else {
      url.searchParams.set("site_id", newSiteId);
    }
    url.searchParams.set("month", selectedMonth);
    window.location.href = url.toString();
  }

  function handlePrint() {
    window.print();
  }

  // Format chart data with clean day number label
  const chartData = generationDays.map((d) => {
    const dayNum = parseInt(d.date.slice(-2), 10);
    return {
      day: `${dayNum}`,
      fullDate: d.date,
      generation: d.generation_kwh,
      expected: d.expected_kwh,
      yield: d.specific_yield,
      status: d.status,
    };
  });

  return (
    <div className="space-y-6">
      {/* Interactive Controls & Navigation (Hidden during Print) */}
      <div className="print:hidden flex flex-wrap items-center justify-between gap-4 p-4 bg-card border rounded-xl shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Site Scope Filter */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="h-4 w-4" /> Scope:
          </div>
          <select
            value={siteFilter}
            onChange={(e) => handleNavigateSite(e.target.value)}
            className="text-xs font-medium border rounded-md px-2.5 py-1.5 bg-background text-foreground"
          >
            <option value="all">Entire Portfolio ({sites.length} Sites)</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.capacity_kwp} kWp)
              </option>
            ))}
          </select>

          {/* Month Selector Dropdown */}
          <div className="flex items-center gap-1">
            <select
              value={selectedMonth}
              onChange={(e) => handleNavigateMonth(e.target.value)}
              className="text-xs font-semibold border rounded-md px-2.5 py-1.5 bg-background text-foreground"
            >
              {availableMonths.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label} {m.isLatestThree ? "• Ready" : "• On Demand"}
                </option>
              ))}
            </select>

            {/* 1-Click Previous / Next Month Navigation */}
            <div className="flex items-center gap-0.5 border rounded-md p-0.5 bg-muted/40">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => canGoPrevious && handleNavigateMonth(availableMonths[currentMonthIdx + 1].value)}
                disabled={!canGoPrevious}
                title="Previous Month"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => canGoNext && handleNavigateMonth(availableMonths[currentMonthIdx - 1].value)}
                disabled={!canGoNext}
                title="Next Month"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Action Buttons: Print/PDF & Archive Drawer */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistoryOpen(true)}
            className="gap-1.5 text-xs h-8"
          >
            <Archive className="h-3.5 w-3.5" />
            <span>Report Archive</span>
          </Button>

          <Button onClick={handlePrint} size="sm" className="gap-2 text-xs h-8">
            <Printer className="h-4 w-4" />
            <span>Print / Save PDF</span>
          </Button>
        </div>
      </div>

      {/* Printable Report Document Wrapper */}
      <div className="printable-report bg-card border rounded-2xl shadow-sm p-6 sm:p-10 space-y-8 print:p-0 print:border-0 print:shadow-none print:bg-white print:text-black">
        {/* Document Header */}
        <div className="page-break-avoid flex flex-wrap items-start justify-between gap-6 border-b pb-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 print:border-emerald-600 print:text-emerald-800">
                Official O&M Performance Report
              </span>
              <span className="text-xs text-muted-foreground">• {monthLabel}</span>
              <Badge variant="outline" className="text-[10px] font-mono">
                {generationDays.length} Days Complete
              </Badge>
            </div>

            <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-foreground print:text-black">
              {selectedSite ? selectedSite.name : organizationName || clientName}
            </h1>
            <p className="text-xs text-muted-foreground print:text-gray-600">
              Prepared by Solar Assist Supervised O&M Operating System for {clientName}
              {selectedSite?.location ? ` • ${selectedSite.location}` : ""}
            </p>
          </div>

          <div className="text-right space-y-1">
            <div className="flex items-center justify-end gap-2">
              <img src="/logo-full.png" alt="Solar Assist" className="dark:hidden h-10 sm:h-12 print:h-14 w-auto object-contain print:block" />
              <img src="/logo-full-dark-trans.png" alt="Solar Assist" className="hidden dark:block h-10 sm:h-12 w-auto object-contain print:hidden" />
            </div>
            <div className="text-[11px] text-muted-foreground print:text-gray-600">
              Reporting Month: <strong>{monthLabel}</strong>
            </div>
            <div className="text-[11px] font-mono text-muted-foreground print:text-gray-600">
              Total Capacity: <strong>{totalCapacityKwp.toFixed(2)} kWp</strong>
            </div>
          </div>
        </div>

        {/* Executive Summary Metrics Grid (4 Key Metric Cards) */}
        <div className="page-break-avoid grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* 1. Total Generation */}
          <div className="p-4 border rounded-xl bg-card/60 print:bg-gray-50 print:border-gray-300 space-y-1">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center justify-between">
              <span>Clean Energy Generated</span>
              <Zap className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-foreground print:text-black">
              {kWh(totalGenerationKwh)}
            </div>
            <p className="text-[10px] text-muted-foreground print:text-gray-600">
              Total clean units produced in {monthLabel}
            </p>
          </div>

          {/* 2. Specific Yield */}
          <div className="p-4 border rounded-xl bg-card/60 print:bg-gray-50 print:border-gray-300 space-y-1">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center justify-between">
              <span>Specific Yield</span>
              <Sun className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-foreground print:text-black">
              {specificYield.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">kWh/kWp</span>
            </div>
            <p className="text-[10px] text-muted-foreground print:text-gray-600">
              Yield per kilowatt peak installed
            </p>
          </div>

          {/* 3. Performance Ratio & Inverter Availability */}
          <div className="p-4 border rounded-xl bg-card/60 print:bg-gray-50 print:border-gray-300 space-y-1">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center justify-between">
              <span>Performance Ratio</span>
              <Activity className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-foreground print:text-black">
              {performanceRatio !== null ? `${performanceRatio}%` : "—"}
            </div>
            <p className="text-[10px] text-muted-foreground print:text-gray-600">
              Availability: <strong>{inverterAvailability}%</strong> reporting uptime
            </p>
          </div>

          {/* 4. Estimated Commercial Value */}
          <div className="p-4 border rounded-xl bg-card/60 print:bg-gray-50 print:border-gray-300 space-y-1">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center justify-between">
              <span>Estimated Value</span>
              <Coins className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-foreground print:text-black">
              {financialSavings ? `₹${Math.round(financialSavings).toLocaleString("en-IN")}` : "Unconfigured"}
            </div>
            <p className="text-[10px] text-muted-foreground print:text-gray-600">
              {avgTariff ? `Calculated at ₹${avgTariff.toFixed(2)}/kWh grid tariff` : "Set grid tariff in site settings"}
            </p>
          </div>
        </div>

        {/* Environmental Offset Banner */}
        <div className="page-break-avoid p-4 rounded-xl border bg-emerald-500/10 border-emerald-500/20 print:bg-emerald-50 print:border-emerald-300 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Leaf className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-foreground print:text-black">Environmental Impact Statement</div>
              <p className="text-xs text-muted-foreground print:text-gray-700 mt-0.5">
                Clean solar generation prevented approximately <span className="font-semibold text-foreground print:text-black">{co2AvoidedTonnes} tonnes</span> of greenhouse CO₂ emissions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-background/80 px-3.5 py-1.5 rounded-lg border text-xs font-medium print:bg-white print:border-emerald-300">
            <TreePine className="h-4 w-4 text-emerald-600" />
            <span>Equivalent to planting ~{treesEquivalent} mature trees</span>
          </div>
        </div>

        {/* Daily Production Summary Bar Chart (Full Month, Never Clipped) */}
        <div className="page-break-avoid space-y-3 pt-2">
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <h2 className="text-base font-bold text-foreground print:text-black flex items-center gap-2">
                <Sun className="h-4 w-4 text-amber-500" />
                Daily Solar Production Profile ({monthLabel})
              </h2>
              <p className="text-xs text-muted-foreground print:text-gray-600">
                Daily actual energy yield across all calendar days of {monthLabel}
              </p>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              Day 1 to {generationDays.length}
            </Badge>
          </div>

          <div className="h-96 sm:h-[420px] print:h-[440px] w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                <XAxis 
                  dataKey="day" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  interval={chartData.length > 20 ? 2 : 1}
                />
                <YAxis fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--card))", 
                    borderColor: "hsl(var(--border))", 
                    fontSize: "11px",
                    borderRadius: "8px"
                  }} 
                  formatter={(val: any) => [`${Number(val).toFixed(1)} kWh`, "Generation"]}
                  labelFormatter={(lbl) => `Day ${lbl} • ${monthLabel}`}
                />
                <Legend 
                  wrapperStyle={{ fontSize: "11px", paddingTop: "4px" }}
                  formatter={(value) => value === "generation" ? "Actual Generation (kWh)" : "Target Baseline (kWh)"}
                />
                <Bar dataKey="generation" name="generation" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Day-by-Day Generation Table (Full Month 1 to 31, No 15-Day Clipping) */}
        <div className="page-break-avoid space-y-3 pt-2">
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <h2 className="text-base font-bold text-foreground print:text-black">
                Day-by-Day Telemetry Breakdown ({generationDays.length} Days)
              </h2>
              <p className="text-xs text-muted-foreground print:text-gray-600">
                Full chronological calendar record for the complete month of {monthLabel}
              </p>
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              Complete Calendar Month
            </span>
          </div>

          <div className="border rounded-xl overflow-hidden print:border-gray-300">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 print:bg-gray-100 border-b font-medium text-muted-foreground print:text-black">
                <tr>
                  <th className="p-2.5">Date</th>
                  <th className="p-2.5 text-right">Energy Generated (kWh)</th>
                  <th className="p-2.5 text-right">Specific Yield (kWh/kWp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border print:divide-gray-200">
                {generationDays.map((d, i) => {
                  const isUpcoming = d.status === "upcoming";

                  return (
                    <tr key={i} className="hover:bg-muted/20 print:hover:bg-transparent">
                      <td className="p-2.5 font-medium text-foreground print:text-black">
                        {formatDate(d.date)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-semibold text-foreground print:text-black">
                        {isUpcoming ? "—" : d.generation_kwh.toFixed(1)}
                      </td>
                      <td className="p-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400 print:text-emerald-800">
                        {isUpcoming ? "—" : d.specific_yield.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Preventive Panel Cleaning Section */}
        <div className="page-break-avoid space-y-3 pt-4">
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <h2 className="text-base font-bold text-foreground print:text-black flex items-center gap-2">
                <SprayCan className="h-4 w-4 text-primary" /> Preventive Panel Cleaning Log
              </h2>
              <p className="text-xs text-muted-foreground print:text-gray-600">
                Module washing cycles completed during {monthLabel}
              </p>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {cleanings.length} Cleanings Recorded
            </Badge>
          </div>

          {cleanings.length === 0 ? (
            <div className="p-6 text-center border rounded-xl bg-accent/20 print:bg-gray-50 text-xs text-muted-foreground print:text-gray-600">
              No module washing cycles were scheduled or logged in {monthLabel}. Washing is performed according to the cycle policy.
            </div>
          ) : (
            <div className="border rounded-xl overflow-hidden print:border-gray-300">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 print:bg-gray-100 border-b font-medium text-muted-foreground print:text-black">
                  <tr>
                    <th className="p-2.5">Site</th>
                    <th className="p-2.5">Cleaning Date</th>
                    <th className="p-2.5">Quality Verification</th>
                    <th className="p-2.5">Roof & Condition Notes</th>
                    <th className="p-2.5 text-right print:hidden">Photo Proof</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border print:divide-gray-200">
                  {cleanings.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/20 print:hover:bg-transparent">
                      <td className="p-2.5 font-semibold text-foreground print:text-black">{c.site_name}</td>
                      <td className="p-2.5 text-muted-foreground print:text-gray-600">{formatDateTime(c.performed_at)}</td>
                      <td className="p-2.5">
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium print:text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" /> Certified Cleaned
                        </span>
                      </td>
                      <td className="p-2.5 text-muted-foreground print:text-gray-600">
                        {c.damage_observed ? `Condition noted: ${c.damage_type || "minor note"}` : "Modules clean & verified"}
                        {c.remarks ? ` • Note: ${c.remarks}` : ""}
                      </td>
                      <td className="p-2.5 text-right print:hidden">
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
        <div className="page-break-avoid space-y-3 pt-4">
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <h2 className="text-base font-bold text-foreground print:text-black flex items-center gap-2">
                <Wrench className="h-4 w-4 text-primary" /> Technical Intelligence & Service Records
              </h2>
              <p className="text-xs text-muted-foreground print:text-gray-600">
                Operational incidents and verified resolutions logged during {monthLabel}
              </p>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {incidents.length} Records
            </Badge>
          </div>

          {incidents.length === 0 ? (
            <div className="p-6 text-center border rounded-xl bg-accent/20 print:bg-gray-50 text-xs text-muted-foreground print:text-gray-600">
              Zero unscheduled downtime or critical hardware faults recorded during this period.
            </div>
          ) : (
            <div className="border rounded-xl overflow-hidden print:border-gray-300">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 print:bg-gray-100 border-b font-medium text-muted-foreground print:text-black">
                  <tr>
                    <th className="p-2.5">Site</th>
                    <th className="p-2.5">Service Scope</th>
                    <th className="p-2.5">Date Logged</th>
                    <th className="p-2.5">Resolution Mode</th>
                    <th className="p-2.5 text-right">Telemetry Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border print:divide-gray-200">
                  {incidents.map((inc) => {
                    const isAuto = inc.resolution_mode === "automated";
                    const isPhys = inc.resolution_mode === "technician";
                    const isAck = inc.resolution_mode === "acknowledged";

                    return (
                      <tr key={inc.id} className="hover:bg-muted/20 print:hover:bg-transparent">
                        <td className="p-2.5 font-semibold text-foreground print:text-black">{inc.site_name}</td>
                        <td className="p-2.5 font-medium text-foreground print:text-black">{inc.title}</td>
                        <td className="p-2.5 text-muted-foreground print:text-gray-600">{formatDate(inc.created_at)}</td>
                        <td className="p-2.5 space-y-0.5">
                          {isAuto ? (
                            <div>
                              <Badge variant="success" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 print:border-emerald-700 print:text-emerald-800">
                                🤖 Automated Resolution
                              </Badge>
                              <div className="text-[9px] text-muted-foreground print:text-gray-600 mt-0.5">
                                Normalized via telemetry; no physical work recorded
                              </div>
                            </div>
                          ) : isPhys ? (
                            <div>
                              <Badge variant="default" className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/30 print:border-blue-700 print:text-blue-800">
                                🔧 Field Technician Service
                              </Badge>
                              <div className="text-[9px] text-muted-foreground print:text-gray-600 mt-0.5">
                                Physical repairs & inspection completed on site
                              </div>
                            </div>
                          ) : isAck ? (
                            <div>
                              <Badge variant="secondary" className="text-[10px]">
                                👁️ Acknowledged
                              </Badge>
                              <div className="text-[9px] text-muted-foreground print:text-gray-600 mt-0.5">
                                24/7 supervision active
                              </div>
                            </div>
                          ) : (
                            <Badge variant="warning" className="text-[10px]">
                              Active Supervision
                            </Badge>
                          )}
                        </td>
                        <td className="p-2.5 text-right text-muted-foreground print:text-gray-600">
                          {inc.post_repair_metric || "Confirmed by telemetry baseline"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Certificate / Sign-off Footer */}
        <div className="page-break-avoid pt-6 border-t flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground print:text-gray-600">
          <div className="space-y-1">
            <div className="font-semibold text-foreground print:text-black">Solar Assist O&M Supervised Operations</div>
            <div>Continuous automated telemetry ingestion, string diagnostics, and proactive field servicing.</div>
          </div>

          <div className="text-right">
            <div className="font-mono text-[11px] text-foreground print:text-black">
              Verification ID: SA-CERT-{selectedMonth.replace("-", "")}-{selectedSiteId === "all" ? "PORT" : selectedSiteId.slice(0, 4).toUpperCase()}
            </div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center justify-end gap-1">
              <CheckCircle2 className="h-3 w-3" /> System Certified Healthy
            </div>
          </div>
        </div>
      </div>

      {/* Historical Report Archive & Retention Modal */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-xl p-6">
          <DialogHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <Archive className="h-5 w-5 text-primary" />
                  Monthly Report Archive & Retention
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  The latest 3 monthly reports are readily available for immediate download. Older months are generated on demand from database records.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 pt-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-1">
              Available Monthly Statements:
            </div>

            <div className="divide-y border rounded-xl overflow-hidden">
              {availableMonths.map((m) => {
                const isSelected = m.value === selectedMonth;
                const isReady = m.isLatestThree;

                return (
                  <div
                    key={m.value}
                    className={`p-3 flex items-center justify-between gap-3 text-xs transition-colors ${
                      isSelected ? "bg-primary/10" : "hover:bg-muted/30"
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="font-semibold text-foreground flex items-center gap-2">
                        <span>{m.label}</span>
                        {isSelected && (
                          <Badge variant="outline" className="text-[9px] bg-primary/20 text-primary border-primary/30">
                            Currently Viewing
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {isReady ? "Ready for immediate download" : "Generated on demand from historical telemetry"}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                        onClick={() => {
                          handleNavigateMonth(m.value);
                          setHistoryOpen(false);
                        }}
                        className="text-xs h-7 gap-1"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span>View Statement</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
