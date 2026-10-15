"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Search,
  Zap,
  TrendingDown,
  ArrowRight,
  ShieldAlert,
  Layers,
  Cpu,
  Eye,
  Info
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
  onInspectString,
}: FleetStringHealthOverviewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "underperformance" | "disconnected" | "offline">("all");
  const [isExpanded, setIsExpanded] = useState(true);

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

  const totalLossInr = useMemo(() => {
    return fleetAnomalies.reduce((sum, a) => sum + (a.estimated_loss_inr || 0), 0);
  }, [fleetAnomalies]);

  const totalLossKwh = useMemo(() => {
    return fleetAnomalies.reduce((sum, a) => sum + (a.estimated_loss_kwh || 0), 0);
  }, [fleetAnomalies]);

  // Filtered sites for display
  const filteredSitesWithIssues = useMemo(() => {
    return sitesWithIssues.filter((site) => {
      const siteAnoms = siteAnomalyMap.get(site.id) || [];

      // Text search
      const matchesSearch =
        site.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (site.location && site.location.toLowerCase().includes(searchQuery.toLowerCase())) ||
        siteAnoms.some((a) => a.inverter_name.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      // Filter category
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
    });
  }, [sitesWithIssues, siteAnomalyMap, searchQuery, filterType]);

  return (
    <Card className="border-border/60 bg-gradient-to-b from-card to-muted/20 shadow-sm overflow-hidden">
      {/* Header Bar */}
      <CardHeader className="p-4 sm:p-5 border-b bg-muted/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg font-bold tracking-tight">
                  Fleet String Health Overview
                </CardTitle>
                <Badge
                  variant={sitesWithIssues.length > 0 ? "destructive" : "success"}
                  className="text-[11px] font-semibold px-2 py-0.5"
                >
                  {sitesWithIssues.length > 0
                    ? `${sitesWithIssues.length} of ${totalSites} Sites Need Attention`
                    : "All 35 Sites Healthy"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Centralized fleet radar highlighting underperforming, disconnected, or shadowed strings across all installations.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs h-8 gap-1.5 text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  <span>Collapse Radar</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  <span>Expand Radar</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* High-Level Fleet KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border/40">
          <div className="bg-card p-3 rounded-lg border border-border/50">
            <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
              <span>Flagged Sites</span>
            </div>
            <div className="text-xl font-bold font-mono mt-1 text-foreground">
              {sitesWithIssues.length}{" "}
              <span className="text-xs font-normal text-muted-foreground">/ {totalSites} sites</span>
            </div>
          </div>

          <div className="bg-card p-3 rounded-lg border border-border/50">
            <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              <span>Strings Flagged</span>
            </div>
            <div className="text-xl font-bold font-mono mt-1 text-amber-600 dark:text-amber-400">
              {stringAnomaliesOnly.length}{" "}
              <span className="text-xs font-normal text-muted-foreground">strings</span>
            </div>
          </div>

          <div className="bg-card p-3 rounded-lg border border-border/50">
            <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-orange-500" />
              <span>Est. Energy Loss</span>
            </div>
            <div className="text-xl font-bold font-mono mt-1 text-foreground">
              {totalLossKwh.toFixed(1)}{" "}
              <span className="text-xs font-normal text-muted-foreground">kWh / day</span>
            </div>
          </div>

          <div className="bg-card p-3 rounded-lg border border-border/50">
            <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-red-500" />
              <span>Est. Revenue Loss</span>
            </div>
            <div className="text-xl font-bold font-mono mt-1 text-rose-600 dark:text-rose-400">
              ₹{Math.round(totalLossInr).toLocaleString()}{" "}
              <span className="text-xs font-normal text-muted-foreground">/ day</span>
            </div>
          </div>
        </div>
      </CardHeader>

      {/* Expanded Content: Site Cards Radar */}
      {isExpanded && (
        <CardContent className="p-4 sm:p-5 space-y-4">
          {/* Controls: Search & Category Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
              <Button
                variant={filterType === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterType("all")}
                className="text-xs h-8 px-3"
              >
                All Attention Sites ({sitesWithIssues.length})
              </Button>
              <Button
                variant={filterType === "underperformance" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterType("underperformance")}
                className="text-xs h-8 px-3"
              >
                String Underperformance
              </Button>
              <Button
                variant={filterType === "disconnected" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterType("disconnected")}
                className="text-xs h-8 px-3"
              >
                String Disconnected
              </Button>
              <Button
                variant={filterType === "offline" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterType("offline")}
                className="text-xs h-8 px-3"
              >
                Inverter Offline
              </Button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search site, inverter..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs h-8"
              />
            </div>
          </div>

          {/* Sites Grid */}
          {filteredSitesWithIssues.length === 0 ? (
            <div className="p-8 text-center border rounded-xl bg-card space-y-2">
              {sitesWithIssues.length === 0 ? (
                <>
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                  <p className="text-sm font-semibold text-foreground">All Fleet Strings Operating Nominally</p>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    No string underperformance, disconnects, or inverter outages detected across all {totalSites} sites.
                    All strings are within peer median baseline tolerances.
                  </p>
                </>
              ) : (
                <>
                  <Info className="h-7 w-7 text-muted-foreground mx-auto" />
                  <p className="text-xs text-muted-foreground">No sites match the current filter or search criteria.</p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {filteredSitesWithIssues.map((site) => {
                const siteAnoms = siteAnomalyMap.get(site.id) || [];
                const isActiveSite = site.id === activeSiteId;
                const stringAnoms = siteAnoms.filter((a) => a.type !== "inverter_offline");
                const hasOfflineInverter = siteAnoms.some((a) => a.type === "inverter_offline");

                const siteLossInr = siteAnoms.reduce((sum, a) => sum + (a.estimated_loss_inr || 0), 0);

                return (
                  <div
                    key={site.id}
                    className={`rounded-xl border p-4 transition-all ${
                      isActiveSite
                        ? "border-primary/60 bg-primary/5 ring-1 ring-primary/40"
                        : "border-border/70 bg-card hover:border-border hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-sm text-foreground hover:text-primary transition-colors">
                            {site.name}
                          </h4>
                          {isActiveSite && (
                            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                              Currently Selected
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {site.location || "Solar Facility"} • {Number(site.capacity_kwp || 0).toLocaleString()} kWp
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {hasOfflineInverter && (
                          <Badge variant="destructive" className="text-[10px] py-0.5 px-2">
                            Inverter Offline
                          </Badge>
                        )}
                        {stringAnoms.length > 0 && (
                          <Badge variant="warning" className="text-[10px] py-0.5 px-2">
                            {stringAnoms.length} String{stringAnoms.length > 1 ? "s" : ""} Flagged
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* List of Affected Strings */}
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
                              <span className="truncate text-muted-foreground text-[11px]">
                                {anom.inverter_name}:
                              </span>
                              <span className="font-medium truncate text-foreground text-[11px]">
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

                    {/* Action Bar */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="text-xs font-mono text-muted-foreground">
                        Total Loss: <span className="font-semibold text-foreground">₹{Math.round(siteLossInr)}/day</span>
                      </div>

                      <Button
                        size="sm"
                        variant={isActiveSite ? "default" : "outline"}
                        onClick={() => {
                          onSelectSite(site.id);
                          // Scroll down to active diagnostic section
                          setTimeout(() => {
                            const el = document.getElementById("active-string-diagnostics");
                            if (el) {
                              el.scrollIntoView({ behavior: "smooth" });
                            }
                          }, 100);
                        }}
                        className="text-xs h-7 gap-1.5"
                      >
                        <span>{isActiveSite ? "View String Diagnostics" : "Inspect Site"}</span>
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
