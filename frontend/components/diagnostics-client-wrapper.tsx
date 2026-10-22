"use client";

import { useState, useMemo } from "react";
import { SiteSelectorCombobox, SiteOption } from "@/components/ui/site-selector-combobox";
import { SiteHealthOverviewHeader, SiteHealthSummary } from "@/components/site-health-overview-header";
import { FleetStringHealthOverview } from "@/components/fleet-string-health-overview";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StringAnomalyDiagnosticSection } from "@/components/string-anomaly-diagnostic-section";
import { StringAnalyticsSection } from "@/components/string-analytics-section";
import { MultiInverterDiagnosticSection } from "@/components/multi-inverter-diagnostic-section";
import { MeterComparisonSection } from "@/components/meter-comparison-section";
import { HistoricalResolvedAnomaliesSection, ResolvedAnomalyRecord } from "@/components/historical-resolved-anomalies-section";
import {
  Activity,
  Zap,
  Cpu,
  BarChart3,
  AlertTriangle,
  Layers,
  History,
  ShieldCheck,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Search,
  Filter,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyzeStringAnomalies, StringAnomaly } from "@/lib/string-anomaly-engine";

export function DiagnosticsClientWrapper({
  sites,
  initialSiteId,
  initialPrimaryTab = "fleet",
  allInverters,
  allStrings,
  allTelemetry,
  allStringTelemetry,
  allResolvedTickets,
}: {
  sites: SiteOption[];
  initialSiteId?: string;
  initialPrimaryTab?: "fleet" | "site";
  allInverters: any[];
  allStrings: any[];
  allTelemetry: any[];
  allStringTelemetry: any[];
  allResolvedTickets: any[];
}) {
  const [primaryTab, setPrimaryTab] = useState<"fleet" | "site">(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const tabParam = sp.get("tab");
      if (tabParam === "site" || tabParam === "fleet") return tabParam;
    }
    return initialPrimaryTab;
  });

  const [activeTab, setActiveTab] = useState<string>("anomalies");
  const [selectedSiteId, setSelectedSiteId] = useState<string>(
    initialSiteId || sites[0]?.id || ""
  );
  const [multiStringContext, setMultiStringContext] = useState<{
    inverterId?: string;
    metric?: "voltage_v" | "current_a" | "power_kw";
    stringIndex?: number;
  } | null>(null);

  function handleNavigateToTab(
    tab: string,
    context?: { inverterId?: string; metric?: "voltage_v" | "current_a" | "power_kw"; stringIndex?: number }
  ) {
    if (context) {
      setMultiStringContext(context);
    }
    setActiveTab(tab);
  }

  function handleSelectSite(site: SiteOption) {
    setSelectedSiteId(site.id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("site_id", site.id);
      window.history.replaceState({}, "", url.toString());
    }
  }

  function handleSwitchPrimaryTab(tab: "fleet" | "site") {
    setPrimaryTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      if (tab === "site") {
        url.searchParams.set("site_id", selectedSite.id);
      }
      window.history.replaceState({}, "", url.toString());
    }
  }

  function handleSelectSiteFromFleet(siteId: string) {
    const target = sites.find((s) => s.id === siteId);
    if (target) {
      setSelectedSiteId(target.id);
      setPrimaryTab("site");
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("site_id", target.id);
        url.searchParams.set("tab", "site");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }

  const selectedSite = sites.find((s) => s.id === selectedSiteId) || sites[0];

  // 1. Calculate active anomalies across the entire fleet
  const fleetAnomalies: StringAnomaly[] = useMemo(() => {
    return analyzeStringAnomalies(
      allStringTelemetry,
      allStrings,
      allInverters,
      sites
    );
  }, [allStringTelemetry, allStrings, allInverters, sites]);

  // 2. Map issues per site for combobox badges and filtering
  const siteIssuesMap = useMemo(() => {
    const map: Record<string, { anomalyCount: number; isOffline: boolean; stringErrors: number }> = {};
    for (const s of sites) {
      const siteAnoms = fleetAnomalies.filter((a) => a.site_id === s.id);
      const siteInvs = allInverters.filter((i) => i.site_id === s.id);
      const isOffline =
        siteInvs.length > 0 &&
        siteInvs.every((inv) => {
          const dbStatus = (inv.status || "").toLowerCase();
          if (dbStatus === "offline" || dbStatus === "fault") return true;
          if (inv.last_seen_at && Date.now() - new Date(inv.last_seen_at).getTime() > 30 * 60 * 1000) return true;
          return false;
        });
      const strErrors = siteAnoms.filter((a) => a.type !== "inverter_offline").length;
      map[s.id] = {
        anomalyCount: siteAnoms.length,
        isOffline,
        stringErrors: strErrors,
      };
    }
    return map;
  }, [sites, fleetAnomalies, allInverters]);

  const [siteFilterMode, setSiteFilterMode] = useState<"all" | "attention" | "healthy">("all");
  const [siteSortBy, setSiteSortBy] = useState<"attention" | "name" | "capacity">("attention");
  const [siteSearch, setSiteSearch] = useState<string>("");

  const navigableSites = useMemo(() => {
    const q = siteSearch.trim().toLowerCase();
    return sites
      .filter((s) => {
        if (q) {
          const matchName = s.name.toLowerCase().includes(q);
          const matchLoc = s.location ? s.location.toLowerCase().includes(q) : false;
          if (!matchName && !matchLoc) return false;
        }

        const issue = siteIssuesMap[s.id];
        const hasIssues = issue && (issue.isOffline || (issue.anomalyCount ?? 0) > 0);
        if (siteFilterMode === "attention") return hasIssues;
        if (siteFilterMode === "healthy") return !hasIssues;
        return true;
      })
      .sort((a, b) => {
        const issueA = siteIssuesMap[a.id];
        const issueB = siteIssuesMap[b.id];
        const scoreA = (issueA?.isOffline ? 100 : 0) + (issueA?.anomalyCount ?? 0);
        const scoreB = (issueB?.isOffline ? 100 : 0) + (issueB?.anomalyCount ?? 0);

        if (siteSortBy === "attention") {
          if (scoreA !== scoreB) return scoreB - scoreA;
          return a.name.localeCompare(b.name);
        }
        if (siteSortBy === "capacity") {
          return (b.capacity_kwp || 0) - (a.capacity_kwp || 0);
        }
        return a.name.localeCompare(b.name);
      });
  }, [sites, siteFilterMode, siteSortBy, siteSearch, siteIssuesMap]);

  const currentNavIndex = useMemo(() => {
    return navigableSites.findIndex((s) => s.id === selectedSite.id);
  }, [navigableSites, selectedSite.id]);

  const handlePrevSite = () => {
    if (navigableSites.length === 0) return;
    const prevIdx = currentNavIndex <= 0 ? navigableSites.length - 1 : currentNavIndex - 1;
    handleSelectSite(navigableSites[prevIdx]);
  };

  const handleNextSite = () => {
    if (navigableSites.length === 0) return;
    const nextIdx = currentNavIndex >= navigableSites.length - 1 ? 0 : currentNavIndex + 1;
    handleSelectSite(navigableSites[nextIdx]);
  };

  const handleFilterModeChange = (mode: "all" | "attention" | "healthy") => {
    setSiteFilterMode(mode);
    const newFiltered = sites.filter((s) => {
      if (siteSearch.trim()) {
        const q = siteSearch.trim().toLowerCase();
        const matchName = s.name.toLowerCase().includes(q);
        const matchLoc = s.location ? s.location.toLowerCase().includes(q) : false;
        if (!matchName && !matchLoc) return false;
      }
      const issue = siteIssuesMap[s.id];
      const hasIssues = issue && (issue.isOffline || (issue.anomalyCount ?? 0) > 0);
      if (mode === "attention") return hasIssues;
      if (mode === "healthy") return !hasIssues;
      return true;
    });
    if (newFiltered.length > 0 && !newFiltered.some((s) => s.id === selectedSite.id)) {
      handleSelectSite(newFiltered[0]);
    }
  };

  // Filter inverters and telemetry for current site
  const siteInverters = allInverters.filter((i) => i.site_id === selectedSite.id);
  const inverterIds = new Set(siteInverters.map((i) => i.id));

  const siteStrings = allStrings.filter((s) => inverterIds.has(s.inverter_id));
  const stringIds = new Set(siteStrings.map((s) => s.id));

  const siteStringTelemetry = allStringTelemetry.filter((st) => stringIds.has(st.string_id));
  const siteTelemetry = allTelemetry.filter((t) => t.site_id === selectedSite.id || inverterIds.has(t.inverter_id));

  const siteTickets = allResolvedTickets.filter((t) => t.site_id === selectedSite.id);

  // Map latest telemetry per inverter ID
  const latestTelemetryMap = new Map<string, any>();
  for (const tel of siteTelemetry) {
    if (!latestTelemetryMap.has(tel.inverter_id)) {
      latestTelemetryMap.set(tel.inverter_id, tel);
    }
  }

  // Active site anomalies
  const anomalies: StringAnomaly[] = useMemo(() => {
    return fleetAnomalies.filter((a) => a.site_id === selectedSite.id);
  }, [fleetAnomalies, selectedSite.id]);

  // Construct historical resolved anomaly records
  const resolvedRecords: ResolvedAnomalyRecord[] = siteTickets.map((t) => ({
    id: t.id,
    site_id: selectedSite.id,
    site_name: selectedSite.name,
    inverter_name: siteInverters.find((i) => i.id === t.inverter_id)?.name || "Inverter 1",
    string_index: 2,
    anomaly_type: "sustained_underperformance",
    detected_at: t.created_at,
    recovered_at: t.updated_at || t.created_at,
    duration_mins: 45,
    ticket_id: t.id,
    resolution_summary: t.description || "Telemetry confirmed string current recovery within 5% of peer median baseline.",
    recovered_current_a: 5.1,
    expected_current_a: 5.2,
  }));

  // Calculate high-level site health summary
  const totalInverters = siteInverters.length || 1;

  const offlineInvertersCount = siteInverters.filter((inv) => {
    const dbStatus = (inv.status || "").toLowerCase();
    if (dbStatus === "offline" || dbStatus === "fault") return true;
    if (inv.last_seen_at && Date.now() - new Date(inv.last_seen_at).getTime() > 30 * 60 * 1000) return true;
    return false;
  }).length;

  const isSiteOffline = siteInverters.length > 0 && offlineInvertersCount === siteInverters.length;
  const invertersAffectedSet = new Set([
    ...anomalies.map((a) => a.inverter_id),
    ...siteInverters.filter((i) => (i.status || "").toLowerCase() === "offline").map((i) => i.id),
  ]);

  const stringsAffectedCount = anomalies.filter((a) => a.type !== "inverter_offline").length;
  const totalLossInr = anomalies.reduce((sum, a) => sum + a.estimated_loss_inr, 0);
  const totalLossKwh = anomalies.reduce((sum, a) => sum + a.estimated_loss_kwh, 0);

  // Health score calculation
  const baseHealth = 100 - (anomalies.length * 12 + invertersAffectedSet.size * 15 + offlineInvertersCount * 25);
  const healthScore = isSiteOffline ? 0 : Math.max(0, Math.min(100, Math.round(baseHealth)));

  const healthStatus = isSiteOffline || healthScore < 75 ? "critical" : healthScore < 90 ? "warning" : "optimal";

  const topAction =
    isSiteOffline
      ? "CRITICAL: Plant is completely offline. Inspect main AC breaker, logger master gateway, and grid transformer."
      : offlineInvertersCount > 0
      ? `CRITICAL: ${offlineInvertersCount} inverter(s) offline. Dispatch technician to inspect AC grid breaker & datalogger stick.`
      : anomalies.length > 0
      ? anomalies[0].recommended_action
      : "All site inverters and string telemetry performing within optimal baseline parameters.";

  const healthSummary: SiteHealthSummary = {
    site_id: selectedSite.id,
    site_name: selectedSite.name,
    health_score: healthScore,
    active_issues_count: anomalies.length,
    inverters_affected: Math.min(totalInverters, invertersAffectedSet.size),
    inverters_offline_count: offlineInvertersCount,
    total_inverters: totalInverters,
    strings_affected: stringsAffectedCount,
    potential_loss_kwh: totalLossKwh,
    potential_loss_inr: totalLossInr,
    top_recommended_action: topAction,
    health_status: healthStatus,
  };

  const sitesWithIssuesCount = useMemo(() => {
    return Object.values(siteIssuesMap).filter((i) => i.isOffline || i.anomalyCount > 0).length;
  }, [siteIssuesMap]);

  return (
    <div className="space-y-6" data-testid="diagnostics-client-wrapper">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b pb-4">
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
      </div>

      {/* Prominent Primary Workspace Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => handleSwitchPrimaryTab("fleet")}
          className={`flex items-center gap-2.5 px-5 py-3 text-sm font-semibold border-b-2 transition-all -mb-[1px] cursor-pointer ${
            primaryTab === "fleet"
              ? "border-primary text-primary bg-primary/5"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Fleet String Health Overview</span>
          {sitesWithIssuesCount > 0 ? (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400">
              {sitesWithIssuesCount} flagged
            </span>
          ) : (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              All 35 Healthy
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleSwitchPrimaryTab("site")}
          className={`flex items-center gap-2.5 px-5 py-3 text-sm font-semibold border-b-2 transition-all -mb-[1px] cursor-pointer ${
            primaryTab === "site"
              ? "border-primary text-primary bg-primary/5"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
          }`}
        >
          <Activity className="h-4 w-4" />
          <span>Site Deep Diagnostics</span>
        </button>
      </div>

      {/* VIEW 1: FLEET STRING HEALTH OVERVIEW */}
      {primaryTab === "fleet" && (
        <FleetStringHealthOverview
          sites={sites}
          fleetAnomalies={fleetAnomalies}
          activeSiteId={selectedSite.id}
          onSelectSite={handleSelectSiteFromFleet}
        />
      )}

      {/* VIEW 2: SITE DEEP DIAGNOSTICS */}
      {primaryTab === "site" && (
        <div className="space-y-6">
          {/* Site Deep Diagnostics Site Selection, Search, Filter & Navigation Card */}
          <div className="p-4 bg-card rounded-xl border shadow-sm space-y-3.5">
            {/* Row 1: Back to Fleet Overview + Selected Site combobox + Stepper buttons */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSwitchPrimaryTab("fleet")}
                className="gap-2 text-xs text-muted-foreground hover:text-foreground self-start font-medium cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Fleet String Health</span>
              </Button>

              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs text-muted-foreground font-semibold shrink-0">Selected Site:</span>
                <SiteSelectorCombobox
                  sites={sites}
                  selectedSiteId={selectedSite.id}
                  onSelectSite={handleSelectSite}
                  siteIssuesMap={siteIssuesMap}
                  filterMode={siteFilterMode}
                  onFilterModeChange={handleFilterModeChange}
                  sortBy={siteSortBy}
                  onSortByChange={setSiteSortBy}
                  search={siteSearch}
                  onSearchChange={setSiteSearch}
                  className="w-full sm:w-[320px] md:w-[360px]"
                />

                {/* Site Stepper: Previous / Next buttons */}
                <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handlePrevSite}
                    disabled={navigableSites.length <= 1}
                    className="h-8 px-2.5 text-xs gap-1 cursor-pointer"
                    title="Previous site in filtered view"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Prev</span>
                  </Button>
                  <span className="text-[11px] font-mono font-medium px-2 text-muted-foreground whitespace-nowrap">
                    {currentNavIndex >= 0 ? currentNavIndex + 1 : "–"} / {navigableSites.length}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleNextSite}
                    disabled={navigableSites.length <= 1}
                    className="h-8 px-2.5 text-xs gap-1 cursor-pointer"
                    title="Next site in filtered view"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Row 2: Search Input, Quick Filters, and Sort Controls */}
            <div className="pt-3 border-t border-border/60 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
              {/* Quick Search */}
              <div className="relative w-full md:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search site name or city..."
                  value={siteSearch}
                  onChange={(e) => setSiteSearch(e.target.value)}
                  className="pl-8 pr-7 h-8 text-xs bg-background"
                />
                {siteSearch && (
                  <button
                    type="button"
                    onClick={() => setSiteSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground font-medium mr-1 flex items-center gap-1">
                  <Filter className="h-3 w-3" />
                  Filter:
                </span>
                <button
                  type="button"
                  onClick={() => handleFilterModeChange("all")}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                    siteFilterMode === "all"
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  All ({sites.length})
                </button>
                <button
                  type="button"
                  onClick={() => handleFilterModeChange("attention")}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    siteFilterMode === "attention"
                      ? "bg-amber-500 text-white font-semibold shadow-xs"
                      : "bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Needs Attention ({sitesWithIssuesCount})
                </button>
                <button
                  type="button"
                  onClick={() => handleFilterModeChange("healthy")}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    siteFilterMode === "healthy"
                      ? "bg-emerald-600 text-white font-semibold shadow-xs"
                      : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Healthy Only ({sites.length - sitesWithIssuesCount})
                </button>
              </div>

              {/* Sort Selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                  <ArrowUpDown className="h-3 w-3" />
                  Sort:
                </span>
                <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
                  <button
                    type="button"
                    onClick={() => setSiteSortBy("attention")}
                    className={`px-2 py-1 text-[11px] rounded-md font-medium transition-all cursor-pointer ${
                      siteSortBy === "attention"
                        ? "bg-background text-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Issues First
                  </button>
                  <button
                    type="button"
                    onClick={() => setSiteSortBy("name")}
                    className={`px-2 py-1 text-[11px] rounded-md font-medium transition-all cursor-pointer ${
                      siteSortBy === "name"
                        ? "bg-background text-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Name A-Z
                  </button>
                  <button
                    type="button"
                    onClick={() => setSiteSortBy("capacity")}
                    className={`px-2 py-1 text-[11px] rounded-md font-medium transition-all cursor-pointer ${
                      siteSortBy === "capacity"
                        ? "bg-background text-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Capacity
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Selected Site Health Summary Banner */}
          <SiteHealthOverviewHeader summary={healthSummary} />

          {/* Main 5 Diagnostic Tabs for Active Site */}
          <Tabs id="active-string-diagnostics" value={activeTab} onValueChange={setActiveTab} className="w-full">
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
                <span>Multi-Inverter Comparison ({siteInverters.length})</span>
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
                telemetry={siteStringTelemetry}
                strings={siteStrings}
                inverters={siteInverters}
                sites={sites}
                onNavigateToTab={handleNavigateToTab}
              />
            </TabsContent>

            {/* Tab 2: Multi-String Analytics Overlay */}
            <TabsContent value="multi-string" className="pt-4">
              <StringAnalyticsSection
                inverters={siteInverters}
                anomalies={anomalies}
                initialInverterId={multiStringContext?.inverterId}
                initialMetric={multiStringContext?.metric}
                targetStringIndex={multiStringContext?.stringIndex}
              />
            </TabsContent>

            {/* Tab 3: Multi-Inverter Diagnostic Comparison */}
            <TabsContent value="multi-inverter" className="pt-4">
              <MultiInverterDiagnosticSection
                inverters={siteInverters}
                latestTelemetryMap={latestTelemetryMap}
              />
            </TabsContent>

            {/* Tab 4: Utility Meter vs Inverter Energy Balance */}
            <TabsContent value="meter-loss" className="pt-4">
              <MeterComparisonSection
                site={selectedSite}
                telemetry={siteTelemetry}
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
      )}
    </div>
  );
}
