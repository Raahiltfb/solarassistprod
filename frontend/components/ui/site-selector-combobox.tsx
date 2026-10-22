"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, Building2, Check, MapPin, Loader2, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface SiteOption {
  id: string;
  name: string;
  capacity_kwp?: number;
  org_id?: string;
  status?: string;
  location?: string;
}

export interface SiteIssueInfo {
  anomalyCount?: number;
  isOffline?: boolean;
  stringErrors?: number;
}

export function SiteSelectorCombobox({
  sites,
  selectedSiteId,
  onSelectSite,
  isPending,
  siteIssuesMap = {},
  filterMode: controlledFilterMode,
  onFilterModeChange,
  sortBy: controlledSortBy,
  onSortByChange,
  search: controlledSearch,
  onSearchChange,
  className,
}: {
  sites: SiteOption[];
  selectedSiteId: string;
  onSelectSite: (site: SiteOption) => void;
  isPending?: boolean;
  siteIssuesMap?: Record<string, SiteIssueInfo>;
  filterMode?: "all" | "attention" | "healthy";
  onFilterModeChange?: (mode: "all" | "attention" | "healthy") => void;
  sortBy?: "attention" | "name" | "capacity";
  onSortByChange?: (sort: "attention" | "name" | "capacity") => void;
  search?: string;
  onSearchChange?: (search: string) => void;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [internalSearch, setInternalSearch] = useState("");
  const search = controlledSearch !== undefined ? controlledSearch : internalSearch;
  const setSearch = (val: string) => {
    setInternalSearch(val);
    onSearchChange?.(val);
  };
  const [internalFilterMode, setInternalFilterMode] = useState<"all" | "attention" | "healthy">("all");
  const [internalSortBy, setInternalSortBy] = useState<"attention" | "name" | "capacity">("attention");

  const filterMode = controlledFilterMode ?? internalFilterMode;
  const setFilterMode = (mode: "all" | "attention" | "healthy") => {
    setInternalFilterMode(mode);
    onFilterModeChange?.(mode);
  };

  const sortBy = controlledSortBy ?? internalSortBy;
  const setSortBy = (sort: "attention" | "name" | "capacity") => {
    setInternalSortBy(sort);
    onSortByChange?.(sort);
  };

  const containerRef = useRef<HTMLDivElement>(null);

  const selectedSite = sites.find((s) => s.id === selectedSiteId) || sites[0];
  const selectedIssue = selectedSite ? siteIssuesMap[selectedSite.id] : undefined;

  const sitesWithIssuesCount = useMemo(() => {
    return sites.filter((s) => {
      const issue = siteIssuesMap[s.id];
      return issue && (issue.isOffline || (issue.anomalyCount ?? 0) > 0);
    }).length;
  }, [sites, siteIssuesMap]);

  const filteredSites = useMemo(() => {
    return sites
      .filter((site) => {
        const matchesSearch =
          site.name.toLowerCase().includes(search.toLowerCase()) ||
          (site.location && site.location.toLowerCase().includes(search.toLowerCase()));
        if (!matchesSearch) return false;

        const issue = siteIssuesMap[site.id];
        const hasIssues = issue && (issue.isOffline || (issue.anomalyCount ?? 0) > 0);

        if (filterMode === "attention") return hasIssues;
        if (filterMode === "healthy") return !hasIssues;
        return true;
      })
      .sort((a, b) => {
        const issueA = siteIssuesMap[a.id];
        const issueB = siteIssuesMap[b.id];
        const scoreA = (issueA?.isOffline ? 100 : 0) + (issueA?.anomalyCount ?? 0);
        const scoreB = (issueB?.isOffline ? 100 : 0) + (issueB?.anomalyCount ?? 0);

        if (sortBy === "attention") {
          if (scoreA !== scoreB) return scoreB - scoreA;
          return a.name.localeCompare(b.name);
        }
        if (sortBy === "capacity") {
          return (b.capacity_kwp || 0) - (a.capacity_kwp || 0);
        }
        return a.name.localeCompare(b.name);
      });
  }, [sites, search, filterMode, sortBy, siteIssuesMap]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative inline-block text-left w-full sm:w-[360px] md:w-[400px] ${className || ""}`}>
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-3 min-h-[44px] h-auto py-2 px-3 text-xs bg-background hover:bg-accent border border-input rounded-lg shadow-sm font-medium whitespace-normal"
      >
        {/* Left Side: Status indicator and vertically stacked Name + Capacity */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {isPending ? (
            <Loader2 className="h-4 w-4 text-primary shrink-0 animate-spin" />
          ) : selectedIssue?.isOffline ? (
            <span className="h-2.5 w-2.5 rounded-full bg-destructive shrink-0 shadow-sm animate-pulse" />
          ) : (selectedIssue?.anomalyCount ?? 0) > 0 ? (
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0 shadow-sm" />
          ) : (
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0 shadow-sm" />
          )}

          <div className="flex flex-col text-left min-w-0">
            <span className="font-semibold text-foreground text-xs leading-snug break-words">
              {isPending ? "Switching Site..." : selectedSite ? selectedSite.name : "Select Site"}
            </span>
            {!isPending && selectedSite && (
              <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
                {selectedSite.capacity_kwp ? `${selectedSite.capacity_kwp} kWp` : "Solar Site"}
                {selectedSite.location ? ` • ${selectedSite.location}` : ""}
              </span>
            )}
          </div>
        </div>

        {/* Right Side: Issue status badge and dropdown chevron, cleanly isolated */}
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {!isPending && selectedIssue && (
            selectedIssue.isOffline ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-destructive/15 text-destructive uppercase tracking-wide">
                Offline
              </span>
            ) : (selectedIssue.anomalyCount ?? 0) > 0 ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono">
                {selectedIssue.anomalyCount} {selectedIssue.anomalyCount === 1 ? "issue" : "issues"}
              </span>
            ) : (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                Healthy
              </span>
            )
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 opacity-70" />
        </div>
      </Button>

      {isOpen && (
        <div className="absolute right-0 sm:left-0 mt-1.5 w-full min-w-[320px] sm:min-w-[400px] max-w-lg rounded-xl bg-popover text-popover-foreground border shadow-2xl z-50 overflow-hidden text-xs">
          {/* Search Header */}
          <div className="p-3 border-b bg-muted/40 space-y-2.5">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-background border border-border/60">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Input
                type="text"
                placeholder="Search site name or location..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-6 text-xs border-none shadow-none focus-visible:ring-0 px-0 bg-transparent"
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="text-[10px] text-muted-foreground hover:text-foreground font-semibold px-1"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Quick Filter Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFilterMode("all")}
                  className={`text-[10px] px-2 py-1 rounded font-medium transition-colors ${
                    filterMode === "all"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  All ({sites.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("attention")}
                  className={`text-[10px] px-2 py-1 rounded font-medium transition-colors flex items-center gap-1 ${
                    filterMode === "attention"
                      ? "bg-amber-500 text-white font-semibold"
                      : "text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                  }`}
                >
                  Needs Attention ({sitesWithIssuesCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("healthy")}
                  className={`text-[10px] px-2 py-1 rounded font-medium transition-colors ${
                    filterMode === "healthy"
                      ? "bg-emerald-600 text-white font-semibold"
                      : "text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
                  }`}
                >
                  Healthy ({sites.length - sitesWithIssuesCount})
                </button>
              </div>

              {/* Sort selector */}
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <ArrowUpDown className="h-3 w-3" />
                <button
                  type="button"
                  onClick={() => setSortBy(sortBy === "attention" ? "name" : sortBy === "name" ? "capacity" : "attention")}
                  className="font-semibold text-foreground underline hover:opacity-80"
                >
                  {sortBy === "attention" ? "Issues First" : sortBy === "name" ? "Name (A-Z)" : "Capacity"}
                </button>
              </div>
            </div>
          </div>

          {/* Sites List */}
          <div className="max-h-72 overflow-y-auto p-1.5 space-y-1">
            {filteredSites.map((site) => {
              const isSelected = site.id === selectedSiteId;
              const issue = siteIssuesMap[site.id];
              const hasAnomalies = (issue?.anomalyCount ?? 0) > 0;
              const isOffline = issue?.isOffline;

              return (
                <button
                  key={site.id}
                  type="button"
                  onClick={() => {
                    onSelectSite(site);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all ${
                    isSelected
                      ? "bg-primary/10 text-primary font-semibold ring-1 ring-primary/30"
                      : "hover:bg-muted text-foreground"
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0 pr-2 flex-1">
                    {isOffline ? (
                      <span className="h-2 w-2 rounded-full bg-destructive shrink-0 mt-1" />
                    ) : hasAnomalies ? (
                      <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0 mt-1" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 mt-1" />
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-xs break-words leading-tight">{site.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        {site.capacity_kwp ? `${site.capacity_kwp} kWp` : "Solar Site"}
                        {site.location ? ` • ${site.location}` : ""}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {isOffline ? (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-destructive/15 text-destructive uppercase">
                        Offline
                      </span>
                    ) : hasAnomalies ? (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-mono">
                        {issue?.anomalyCount} {issue?.anomalyCount === 1 ? "issue" : "issues"}
                      </span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                        ✓ Optimal
                      </span>
                    )}
                    {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </div>
                </button>
              );
            })}

            {filteredSites.length === 0 && (
              <div className="p-5 text-center text-muted-foreground text-xs">
                No matching sites in &quot;{filterMode}&quot; view.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
