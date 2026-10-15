"use client";

import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, Building2, Check, MapPin, Loader2 } from "lucide-react";
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
  className,
}: {
  sites: SiteOption[];
  selectedSiteId: string;
  onSelectSite: (site: SiteOption) => void;
  isPending?: boolean;
  siteIssuesMap?: Record<string, SiteIssueInfo>;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "attention" | "healthy">("all");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedSite = sites.find((s) => s.id === selectedSiteId) || sites[0];
  const selectedIssue = selectedSite ? siteIssuesMap[selectedSite.id] : undefined;

  const sitesWithIssuesCount = sites.filter((s) => {
    const issue = siteIssuesMap[s.id];
    return issue && (issue.isOffline || (issue.anomalyCount ?? 0) > 0);
  }).length;

  const filteredSites = sites.filter((site) => {
    const matchesSearch = site.name.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    const issue = siteIssuesMap[site.id];
    const hasIssues = issue && (issue.isOffline || (issue.anomalyCount ?? 0) > 0);

    if (filterMode === "attention") return hasIssues;
    if (filterMode === "healthy") return !hasIssues;
    return true;
  });

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
    <div ref={containerRef} className={`relative inline-block text-left w-full sm:w-80 ${className || ""}`}>
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 h-9 px-3 text-xs bg-background hover:bg-accent border border-input rounded-md shadow-sm font-medium"
      >
        <div className="flex items-center gap-2 truncate min-w-0">
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 text-primary shrink-0 animate-spin" />
          ) : selectedIssue?.isOffline ? (
            <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />
          ) : (selectedIssue?.anomalyCount ?? 0) > 0 ? (
            <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
          ) : (
            <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
          )}
          <span className="truncate font-semibold text-foreground">
            {isPending ? "Switching Site..." : selectedSite ? selectedSite.name : "Select Site"}
          </span>
          {!isPending && selectedSite?.capacity_kwp && (
            <span className="text-[10px] text-muted-foreground font-mono shrink-0">
              ({selectedSite.capacity_kwp} kWp)
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isPending && selectedIssue && (
            selectedIssue.isOffline ? (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-destructive/15 text-destructive uppercase">
                Offline
              </span>
            ) : (selectedIssue.anomalyCount ?? 0) > 0 ? (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono">
                {selectedIssue.anomalyCount} issues
              </span>
            ) : (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                Healthy
              </span>
            )
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-70" />
        </div>
      </Button>

      {isOpen && (
        <div className="absolute right-0 sm:left-0 mt-1 w-full min-w-[320px] max-w-md rounded-xl bg-popover text-popover-foreground border shadow-xl z-50 overflow-hidden text-xs">
          {/* Search Header */}
          <div className="p-2.5 border-b bg-muted/40 space-y-2">
            <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-background border border-border/60">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Input
                type="text"
                placeholder="Search by site name..."
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
                All Sites ({sites.length})
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
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-all ${
                    isSelected
                      ? "bg-primary/10 text-primary font-semibold ring-1 ring-primary/30"
                      : "hover:bg-muted text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate min-w-0 pr-2">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate font-medium">{site.name}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {site.capacity_kwp && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {site.capacity_kwp} kWp
                      </span>
                    )}
                    {isOffline ? (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-destructive/15 text-destructive uppercase">
                        Offline
                      </span>
                    ) : hasAnomalies ? (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-mono">
                        ⚠️ {issue?.anomalyCount} {issue?.anomalyCount === 1 ? "issue" : "issues"}
                      </span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                        ✓ Optimal
                      </span>
                    )}
                    {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                  </div>
                </button>
              );
            })}

            {filteredSites.length === 0 && (
              <div className="p-4 text-center text-muted-foreground text-xs">
                No matching sites in &quot;{filterMode}&quot; view.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
