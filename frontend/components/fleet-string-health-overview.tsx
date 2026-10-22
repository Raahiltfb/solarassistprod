"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  CheckCircle2,
  Search,
  Zap,
  TrendingDown,
  ArrowRight,
  ShieldAlert,
  Layers,
  LayoutGrid,
  List,
  ArrowUpDown,
  Building2,
  MapPin,
  Info,
  Check
} from "lucide-react";
import { StringAnomaly } from "@/lib/string-anomaly-engine";
import { SiteOption } from "@/components/ui/site-selector-combobox";

interface FleetStringHealthOverviewProps {
  sites: SiteOption[];
  fleetAnomalies: StringAnomaly[];
  activeSiteId: string;
  onSelectSite: (siteId: string) => void;
  onInspectString?: (siteId: string, stringId: string) => void;
}

export function FleetStringHealthOverview({
  sites,
  fleetAnomalies,
  activeSiteId,
  onSelectSite,
}: FleetStringHealthOverviewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<
    "attention" | "all" | "underperformance" | "disconnected" | "offline" | "healthy"
  >("attention");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [sortBy, setSortBy] = useState<"loss_inr" | "loss_kwh" | "issues" | "capacity" | "name">("loss_inr");

  // Group anomalies by site
  const siteAnomalyMap = useMemo(() => {
    const map = new Map<string, StringAnomaly[]>();
    for (const anom of fleetAnomalies) {
      const list = map.get(anom.site_id) || [];
      list.push(anom);
      map.set(anom.site_id, list);
    }
    return map;
  }, [fleetAnomalies]);

  // Total metrics
  const totalSites = sites.length;
  const sitesWithIssues = useMemo(() => {
    return sites.filter((s) => (siteAnomalyMap.get(s.id) || []).length > 0);
  }, [sites, siteAnomalyMap]);

  const healthySitesCount = Math.max(0, totalSites - sitesWithIssues.length);

  const stringAnomaliesOnly = useMemo(() => {
    return fleetAnomalies.filter((a) => a.type !== "inverter_offline");
  }, [fleetAnomalies]);

  const underperfSitesCount = useMemo(() => {
    return sites.filter((s) => {
      const anoms = siteAnomalyMap.get(s.id) || [];
      return anoms.some((a) => a.type === "sustained_underperformance" || a.type === "transient_shadow");
    }).length;
  }, [sites, siteAnomalyMap]);

  const disconnectSitesCount = useMemo(() => {
    return sites.filter((s) => {
      const anoms = siteAnomalyMap.get(s.id) || [];
      return anoms.some((a) => a.type === "string_disconnected");
    }).length;
  }, [sites, siteAnomalyMap]);

  const offlineSitesCount = useMemo(() => {
    return sites.filter((s) => {
      const anoms = siteAnomalyMap.get(s.id) || [];
      return anoms.some((a) => a.type === "inverter_offline");
    }).length;
  }, [sites, siteAnomalyMap]);

  const totalLossInr = useMemo(() => {
    return fleetAnomalies.reduce((sum, a) => sum + (a.estimated_loss_inr || 0), 0);
  }, [fleetAnomalies]);

  const totalLossKwh = useMemo(() => {
    return fleetAnomalies.reduce((sum, a) => sum + (a.estimated_loss_kwh || 0), 0);
  }, [fleetAnomalies]);

  // Filter & sort sites
  const displayedSites = useMemo(() => {
    return sites
      .filter((site) => {
        const siteAnoms = siteAnomalyMap.get(site.id) || [];
        const hasIssues = siteAnoms.length > 0;

        // Text search
        const matchesSearch =
          site.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (site.location && site.location.toLowerCase().includes(searchQuery.toLowerCase())) ||
          siteAnoms.some((a) => a.inverter_name.toLowerCase().includes(searchQuery.toLowerCase()));

        if (!matchesSearch) return false;

        // Filter category
        if (filterType === "attention") return hasIssues;
        if (filterType === "healthy") return !hasIssues;
        if (filterType === "underperformance") {
          return siteAnoms.some((a) => a.type === "sustained_underperformance" || a.type === "transient_shadow");
        }
        if (filterType === "disconnected") {
          return siteAnoms.some((a) => a.type === "string_disconnected");
        }
        if (filterType === "offline") {
          return siteAnoms.some((a) => a.type === "inverter_offline");
        }
        return true;
      })
      .sort((a, b) => {
        const anomsA = siteAnomalyMap.get(a.id) || [];
        const anomsB = siteAnomalyMap.get(b.id) || [];
        const lossA_inr = anomsA.reduce((sum, x) => sum + (x.estimated_loss_inr || 0), 0);
        const lossB_inr = anomsB.reduce((sum, x) => sum + (x.estimated_loss_inr || 0), 0);
        const lossA_kwh = anomsA.reduce((sum, x) => sum + (x.estimated_loss_kwh || 0), 0);
        const lossB_kwh = anomsB.reduce((sum, x) => sum + (x.estimated_loss_kwh || 0), 0);

        if (sortBy === "loss_inr") {
          if (lossB_inr !== lossA_inr) return lossB_inr - lossA_inr;
          return (b.capacity_kwp || 0) - (a.capacity_kwp || 0);
        }
        if (sortBy === "loss_kwh") {
          if (lossB_kwh !== lossA_kwh) return lossB_kwh - lossA_kwh;
          return lossB_inr - lossA_inr;
        }
        if (sortBy === "issues") {
          if (anomsB.length !== anomsA.length) return anomsB.length - anomsA.length;
          return lossB_inr - lossA_inr;
        }
        if (sortBy === "capacity") {
          return (b.capacity_kwp || 0) - (a.capacity_kwp || 0);
        }
        return a.name.localeCompare(b.name);
      });
  }, [sites, siteAnomalyMap, searchQuery, filterType, sortBy]);

  return (
    <div className="space-y-5" data-testid="fleet-string-health-overview">
      {/* High-Level Fleet KPIs Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-card p-4 rounded-xl border border-border/70 shadow-sm">
          <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <ShieldAlert className="h-4 w-4 text-rose-500" />
            <span>Sites Needing Attention</span>
          </div>
          <div className="text-2xl font-bold font-mono mt-1.5 text-foreground">
            {sitesWithIssues.length}{" "}
            <span className="text-xs font-normal text-muted-foreground">/ {totalSites} sites</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {healthySitesCount} installations optimal
          </p>
        </div>

        <div className="bg-card p-4 rounded-xl border border-border/70 shadow-sm">
          <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span>Flagged Strings</span>
          </div>
          <div className="text-2xl font-bold font-mono mt-1.5 text-amber-600 dark:text-amber-400">
            {stringAnomaliesOnly.length}{" "}
            <span className="text-xs font-normal text-muted-foreground">strings</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Deviation beyond &gt;20% peer baseline
          </p>
        </div>

        <div className="bg-card p-4 rounded-xl border border-border/70 shadow-sm">
          <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <TrendingDown className="h-4 w-4 text-orange-500" />
            <span>Est. Daily Energy Loss</span>
          </div>
          <div className="text-2xl font-bold font-mono mt-1.5 text-foreground">
            {totalLossKwh.toFixed(1)}{" "}
            <span className="text-xs font-normal text-muted-foreground">kWh / day</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Across active flagged strings
          </p>
        </div>

        <div className="bg-card p-4 rounded-xl border border-border/70 shadow-sm">
          <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-rose-500" />
            <span>Est. Daily Revenue Loss</span>
          </div>
          <div className="text-2xl font-bold font-mono mt-1.5 text-rose-600 dark:text-rose-400">
            ₹{Math.round(totalLossInr).toLocaleString()}{" "}
            <span className="text-xs font-normal text-muted-foreground">/ day</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Calculated at ₹7.50 / kWh blended tariff
          </p>
        </div>
      </div>

      {/* Control Bar: Dedicated multi-row layout for Search, Sorting, and Filter Chips */}
      <div className="bg-card p-4 rounded-xl border border-border/70 shadow-sm space-y-3.5">
        {/* Row 1: Search Bar, Sort Dropdown, and View Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative w-full sm:w-80 md:w-96">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search site name, location, or inverter..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs h-9 bg-background/80"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-[11px] text-muted-foreground hover:text-foreground font-semibold"
              >
                Clear
              </button>
            )}
          </div>

          {/* Right Controls: Sort & View Toggle */}
          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            {/* Sort Selector */}
            <div className="flex items-center gap-1.5 border rounded-lg px-2.5 h-9 bg-background">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground font-medium hidden sm:inline">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                aria-label="Sort sites by"
                className="bg-transparent text-xs font-semibold focus:outline-none cursor-pointer pr-1"
              >
                <option value="loss_inr">Revenue Loss (High to Low)</option>
                <option value="loss_kwh">Daily Energy Loss</option>
                <option value="issues">Issue Count</option>
                <option value="capacity">Capacity (High to Low)</option>
                <option value="name">Site Name (A-Z)</option>
              </select>
            </div>

            {/* View Mode Switcher: Cards vs List */}
            <div className="flex items-center border rounded-lg p-0.5 bg-muted/60 h-9">
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                title="Cards View"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                  viewMode === "cards"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                title="List / Table View"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                  viewMode === "list"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <List className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Table</span>
              </button>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border/50" />

        {/* Row 2: Filter Chips (Generous flex-wrap with zero cut-off) */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <span className="text-xs text-muted-foreground font-semibold mr-1 shrink-0">Filter By:</span>

          <Button
            variant={filterType === "attention" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("attention")}
            className={`text-xs h-8 px-3.5 gap-1.5 ${
              filterType === "attention"
                ? "bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                : "border-border text-foreground hover:bg-muted"
            }`}
          >
            <span>Needs Attention</span>
            <span className="text-[11px] font-bold px-1.5 py-0.2 rounded-full bg-black/20 dark:bg-white/20">
              {sitesWithIssues.length}
            </span>
          </Button>

          <Button
            variant={filterType === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("all")}
            className="text-xs h-8 px-3.5 gap-1.5"
          >
            <span>All Sites</span>
            <span className="text-[11px] opacity-80 font-mono">({totalSites})</span>
          </Button>

          <Button
            variant={filterType === "underperformance" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("underperformance")}
            className="text-xs h-8 px-3.5 gap-1.5"
          >
            <span>String Underperformance</span>
            <span className="text-[11px] opacity-80 font-mono">({underperfSitesCount})</span>
          </Button>

          <Button
            variant={filterType === "disconnected" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("disconnected")}
            className="text-xs h-8 px-3.5 gap-1.5"
          >
            <span>String Disconnected</span>
            <span className="text-[11px] opacity-80 font-mono">({disconnectSitesCount})</span>
          </Button>

          <Button
            variant={filterType === "offline" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("offline")}
            className="text-xs h-8 px-3.5 gap-1.5"
          >
            <span>Inverter Offline</span>
            <span className="text-[11px] opacity-80 font-mono">({offlineSitesCount})</span>
          </Button>

          <Button
            variant={filterType === "healthy" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("healthy")}
            className="text-xs h-8 px-3.5 gap-1.5"
          >
            <span>Healthy Installations</span>
            <span className="text-[11px] opacity-80 font-mono">({healthySitesCount})</span>
          </Button>
        </div>
      </div>

      {/* Main Display: Cards View vs List / Table View */}
      {displayedSites.length === 0 ? (
        <div className="p-10 text-center border rounded-xl bg-card space-y-3">
          {sitesWithIssues.length === 0 ? (
            <>
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
              <p className="text-base font-semibold text-foreground">All Fleet Strings Operating Nominally</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                No string underperformance, disconnects, or inverter outages detected across all {totalSites} sites.
                All strings are within peer median baseline tolerances.
              </p>
            </>
          ) : (
            <>
              <Info className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-semibold text-foreground">No sites match the current filter or search criteria</p>
              <p className="text-xs text-muted-foreground">Try clearing your search query or selecting &quot;All Sites&quot;.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setFilterType("all");
                }}
                className="text-xs h-7 mt-2"
              >
                Reset Filters
              </Button>
            </>
          )}
        </div>
      ) : viewMode === "cards" ? (
        /* CARDS VIEW */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {displayedSites.map((site) => {
            const siteAnoms = siteAnomalyMap.get(site.id) || [];
            const isActiveSite = site.id === activeSiteId;
            const stringAnoms = siteAnoms.filter((a) => a.type !== "inverter_offline");
            const hasOfflineInverter = siteAnoms.some((a) => a.type === "inverter_offline");
            const isHealthy = siteAnoms.length === 0;

            const siteLossInr = siteAnoms.reduce((sum, a) => sum + (a.estimated_loss_inr || 0), 0);
            const siteLossKwh = siteAnoms.reduce((sum, a) => sum + (a.estimated_loss_kwh || 0), 0);

            return (
              <div
                key={site.id}
                className={`rounded-xl border p-4 transition-all ${
                  isActiveSite
                    ? "border-primary/60 bg-primary/5 ring-1 ring-primary/40 shadow-sm"
                    : isHealthy
                    ? "border-border/60 bg-card hover:border-border hover:shadow-sm"
                    : "border-border/80 bg-card hover:border-primary/40 hover:shadow-md"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isHealthy ? (
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                      ) : hasOfflineInverter ? (
                        <span className="h-2.5 w-2.5 rounded-full bg-destructive shrink-0 animate-pulse" />
                      ) : (
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
                      )}
                      <h4 className="font-semibold text-sm text-foreground hover:text-primary transition-colors break-words">
                        {site.name}
                      </h4>
                      {isActiveSite && (
                        <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                          Active Selection
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {site.location ? `${site.location} • ` : ""}{Number(site.capacity_kwp || 0).toLocaleString()} kWp
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {hasOfflineInverter && (
                      <Badge variant="destructive" className="text-[10px] py-0.5 px-2 font-semibold">
                        Inverter Offline
                      </Badge>
                    )}
                    {stringAnoms.length > 0 && (
                      <Badge variant="warning" className="text-[10px] py-0.5 px-2 font-semibold">
                        {stringAnoms.length} String{stringAnoms.length > 1 ? "s" : ""} Flagged
                      </Badge>
                    )}
                    {isHealthy && (
                      <Badge variant="outline" className="text-[10px] py-0.5 px-2 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                        ✓ Optimal Health
                      </Badge>
                    )}
                  </div>
                </div>

                {/* List of Affected Strings or Nominal Message */}
                {siteAnoms.length > 0 ? (
                  <div className="space-y-2 mb-3.5 bg-muted/40 rounded-lg p-2.5 border border-border/40 text-xs">
                    {siteAnoms.slice(0, 3).map((anom) => {
                      const isOffline = anom.type === "inverter_offline";
                      const isDisconnect = anom.type === "string_disconnected";
                      const dropPct = Math.round(anom.deviation_pct);

                      return (
                        <div key={anom.id} className="flex items-center justify-between gap-2 py-0.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-semibold text-[11px] px-1.5 py-0.5 rounded bg-background border text-foreground shrink-0">
                              {isOffline ? "Inverter" : `Str #${anom.string_index}`}
                            </span>
                            <span className="text-muted-foreground text-[11px] shrink-0">
                              {anom.inverter_name}:
                            </span>
                            <span className="font-medium text-foreground text-[11px] break-words">
                              {isOffline
                                ? "Inverter offline / grid disconnect"
                                : isDisconnect
                                ? "Open circuit (0.0A current)"
                                : `Underperforming (${dropPct}% drop)`}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {!isOffline && (
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {anom.actual_current_a.toFixed(1)}A / {anom.benchmark_current_a.toFixed(1)}A
                              </span>
                            )}
                            <span className="font-mono text-[11px] font-semibold text-rose-500">
                              ₹{Math.round(anom.estimated_loss_inr)}/d
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {siteAnoms.length > 3 && (
                      <p className="text-[10px] text-muted-foreground italic text-right pt-1">
                        + {siteAnoms.length - 3} more string issues on this site
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mb-3.5 bg-muted/20 rounded-lg p-2.5 border border-border/30 text-xs text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>All strings performing within peer benchmark tolerances.</span>
                  </div>
                )}

                {/* Card Action Bar */}
                <div className="flex items-center justify-between pt-1">
                  <div className="text-xs font-mono text-muted-foreground">
                    {siteLossInr > 0 ? (
                      <>
                        Daily Loss:{" "}
                        <span className="font-semibold text-rose-600 dark:text-rose-400">
                          ₹{Math.round(siteLossInr)}/day
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-1">
                          ({siteLossKwh.toFixed(1)} kWh)
                        </span>
                      </>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        0.0 kWh Loss • 100% Generation Health
                      </span>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant={siteLossInr > 0 ? "default" : "outline"}
                    onClick={() => onSelectSite(site.id)}
                    className="text-xs h-7 gap-1.5 font-medium"
                  >
                    <span>Inspect Diagnostics</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE / LIST VIEW */
        <div className="rounded-xl border border-border/70 overflow-hidden bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 border-b border-border/70 text-muted-foreground font-semibold">
                <tr>
                  <th className="py-3 px-4">Site Name & Location</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 font-mono">Capacity</th>
                  <th className="py-3 px-4">Anomalies & String Breakdown</th>
                  <th className="py-3 px-3 font-mono text-right">Energy Loss</th>
                  <th className="py-3 px-3 font-mono text-right">Revenue Loss</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {displayedSites.map((site) => {
                  const siteAnoms = siteAnomalyMap.get(site.id) || [];
                  const isActiveSite = site.id === activeSiteId;
                  const stringAnoms = siteAnoms.filter((a) => a.type !== "inverter_offline");
                  const hasOfflineInverter = siteAnoms.some((a) => a.type === "inverter_offline");
                  const isHealthy = siteAnoms.length === 0;

                  const siteLossInr = siteAnoms.reduce((sum, a) => sum + (a.estimated_loss_inr || 0), 0);
                  const siteLossKwh = siteAnoms.reduce((sum, a) => sum + (a.estimated_loss_kwh || 0), 0);

                  return (
                    <tr
                      key={site.id}
                      onClick={() => onSelectSite(site.id)}
                      className={`hover:bg-muted/40 transition-colors cursor-pointer ${
                        isActiveSite ? "bg-primary/5 font-medium" : ""
                      }`}
                    >
                      {/* Site Name & Location */}
                      <td className="py-3 px-4">
                        <div className="flex items-start gap-2.5">
                          {isHealthy ? (
                            <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 mt-1" />
                          ) : hasOfflineInverter ? (
                            <span className="h-2 w-2 rounded-full bg-destructive shrink-0 mt-1 animate-pulse" />
                          ) : (
                            <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0 mt-1" />
                          )}
                          <div>
                            <div className="font-semibold text-foreground text-xs leading-snug break-words">
                              {site.name}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {site.location || "Solar Site"}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        {hasOfflineInverter ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-destructive/15 text-destructive uppercase">
                            Inverter Offline
                          </span>
                        ) : stringAnoms.length > 0 ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono">
                            {stringAnoms.length} String{stringAnoms.length > 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            Optimal
                          </span>
                        )}
                      </td>

                      {/* Capacity */}
                      <td className="py-3 px-3 font-mono text-muted-foreground whitespace-nowrap">
                        {Number(site.capacity_kwp || 0).toLocaleString()} kWp
                      </td>

                      {/* Anomalies Summary */}
                      <td className="py-3 px-4">
                        {siteAnoms.length > 0 ? (
                          <div className="space-y-1">
                            {siteAnoms.slice(0, 2).map((a) => (
                              <div key={a.id} className="text-[11px] text-foreground flex items-center gap-1.5">
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {a.type === "inverter_offline" ? "Inverter" : `Str #${a.string_index}`}:
                                </span>
                                <span>
                                  {a.type === "inverter_offline"
                                    ? "Grid Offline"
                                    : a.type === "string_disconnected"
                                    ? "Disconnected (0A)"
                                    : `${Math.round(a.deviation_pct)}% drop`}
                                </span>
                              </div>
                            ))}
                            {siteAnoms.length > 2 && (
                              <span className="text-[10px] text-muted-foreground italic">
                                + {siteAnoms.length - 2} more issues
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">
                            Strings balanced within median
                          </span>
                        )}
                      </td>

                      {/* Energy Loss */}
                      <td className="py-3 px-3 font-mono text-right whitespace-nowrap">
                        {siteLossKwh > 0 ? (
                          <span className="text-foreground font-semibold">
                            {siteLossKwh.toFixed(1)} kWh/d
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0.0</span>
                        )}
                      </td>

                      {/* Revenue Loss */}
                      <td className="py-3 px-3 font-mono text-right whitespace-nowrap">
                        {siteLossInr > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400 font-bold">
                            ₹{Math.round(siteLossInr).toLocaleString()}/d
                          </span>
                        ) : (
                          <span className="text-muted-foreground">₹0</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectSite(site.id);
                          }}
                          className="text-xs h-7 gap-1 text-primary hover:text-primary hover:bg-primary/10"
                        >
                          <span>Inspect</span>
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
