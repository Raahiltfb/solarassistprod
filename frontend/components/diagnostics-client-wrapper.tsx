"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SiteSelectorCombobox, SiteOption } from "@/components/ui/site-selector-combobox";
import { SiteHealthOverviewHeader, SiteHealthSummary } from "@/components/site-health-overview-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StringAnomalyDiagnosticSection } from "@/components/string-anomaly-diagnostic-section";
import { StringAnalyticsSection } from "@/components/string-analytics-section";
import { MultiInverterDiagnosticSection } from "@/components/multi-inverter-diagnostic-section";
import { MeterComparisonSection } from "@/components/meter-comparison-section";
import { HistoricalResolvedAnomaliesSection, ResolvedAnomalyRecord } from "@/components/historical-resolved-anomalies-section";
import { Activity, Zap, Cpu, BarChart3, AlertTriangle, Layers, History, ShieldCheck } from "lucide-react";
import { StringAnomaly } from "@/lib/string-anomaly-engine";

export function DiagnosticsClientWrapper({
  sites,
  selectedSite,
  inverters,
  strings,
  telemetry,
  stringTelemetry,
  latestTelemetryMap,
  anomalies,
  resolvedRecords,
}: {
  sites: SiteOption[];
  selectedSite: SiteOption;
  inverters: any[];
  strings: any[];
  telemetry: any[];
  stringTelemetry: any[];
  latestTelemetryMap: Map<string, any>;
  anomalies: StringAnomaly[];
  resolvedRecords: ResolvedAnomalyRecord[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<string>("anomalies");

  function handleSelectSite(site: SiteOption) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("site_id", site.id);
    router.push(`/diagnostics?${params.toString()}`);
  }

  // Calculate high-level site health summary
  const totalInverters = inverters.length || 1;
  const invertersAffectedSet = new Set(anomalies.map((a) => a.inverter_id));
  const stringsAffectedCount = anomalies.length;
  const totalLossInr = anomalies.reduce((sum, a) => sum + a.estimated_loss_inr, 0);
  const totalLossKwh = anomalies.reduce((sum, a) => sum + a.estimated_loss_kwh, 0);

  // Health score calculation
  const healthScore = Math.max(
    0,
    Math.min(100, Math.round(100 - (anomalies.length * 12 + invertersAffectedSet.size * 15)))
  );

  const healthStatus = healthScore >= 90 ? "optimal" : healthScore >= 75 ? "warning" : "critical";

  const topAction =
    anomalies.length > 0
      ? anomalies[0].recommended_action
      : "All site inverters and string telemetry performing within optimal baseline parameters.";

  const healthSummary: SiteHealthSummary = {
    site_id: selectedSite.id,
    site_name: selectedSite.name,
    health_score: healthScore,
    active_issues_count: anomalies.length,
    inverters_affected: invertersAffectedSet.size,
    total_inverters: totalInverters,
    strings_affected: stringsAffectedCount,
    potential_loss_kwh: totalLossKwh,
    potential_loss_inr: totalLossInr,
    top_recommended_action: topAction,
    health_status: healthStatus,
  };

  return (
    <div className="space-y-6" data-testid="diagnostics-client-wrapper">
      {/* Top Header & Site Combobox Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider mb-1">
            <Cpu className="h-4 w-4 text-primary" />
            <span>Technical Intelligence</span>
          </div>
          <h1 className="text-2xl font-bold font-display tracking-tight text-foreground">
            Technical Intelligence
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Automated string anomaly benchmarking, multi-string overlays, inverter yield matrix, and utility meter loss comparison.
          </p>
        </div>

        {/* Searchable Combobox Site Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-semibold shrink-0">Site Selector:</span>
          <SiteSelectorCombobox
            sites={sites}
            selectedSiteId={selectedSite.id}
            onSelectSite={handleSelectSite}
          />
        </div>
      </div>

      {/* Top High-Level Site Health Summary */}
      <SiteHealthOverviewHeader
        summary={healthSummary}
        onNavigateToTab={(tab) => setActiveTab(tab)}
      />

      {/* Main 5 Diagnostic Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1 p-1 bg-muted rounded-lg border">
          <TabsTrigger value="anomalies" className="text-xs gap-1.5 py-2 px-3">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Active String Diagnostics ({anomalies.length})</span>
          </TabsTrigger>
          <TabsTrigger value="multi-string" className="text-xs gap-1.5 py-2 px-3">
            <Layers className="h-3.5 w-3.5" />
            <span>Multi-String Overlay Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="multi-inverter" className="text-xs gap-1.5 py-2 px-3">
            <Cpu className="h-3.5 w-3.5" />
            <span>Multi-Inverter Comparison ({inverters.length})</span>
          </TabsTrigger>
          <TabsTrigger value="meter-loss" className="text-xs gap-1.5 py-2 px-3">
            <Zap className="h-3.5 w-3.5" />
            <span>Utility Meter Energy Balance</span>
          </TabsTrigger>
          <TabsTrigger value="historical" className="text-xs gap-1.5 py-2 px-3">
            <History className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Historical & Resolved Issues ({resolvedRecords.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: String Anomaly Detection */}
        <TabsContent value="anomalies" className="pt-4">
          <StringAnomalyDiagnosticSection
            telemetry={stringTelemetry}
            strings={strings}
            inverters={inverters}
            sites={sites}
          />
        </TabsContent>

        {/* Tab 2: Multi-String Analytics Overlay */}
        <TabsContent value="multi-string" className="pt-4">
          <StringAnalyticsSection inverters={inverters} />
        </TabsContent>

        {/* Tab 3: Multi-Inverter Diagnostic Comparison */}
        <TabsContent value="multi-inverter" className="pt-4">
          <MultiInverterDiagnosticSection
            inverters={inverters}
            latestTelemetryMap={latestTelemetryMap}
          />
        </TabsContent>

        {/* Tab 4: Utility Meter vs Inverter Energy Balance */}
        <TabsContent value="meter-loss" className="pt-4">
          <MeterComparisonSection
            site={selectedSite}
            telemetry={telemetry}
          />
        </TabsContent>

        {/* Tab 5: Historical & Resolved Issues */}
        <TabsContent value="historical" className="pt-4">
          <HistoricalResolvedAnomaliesSection
            resolvedRecords={resolvedRecords}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
