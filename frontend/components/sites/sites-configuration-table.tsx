"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings, Search, MapPin, Building2, Layers, AlertTriangle, ArrowUpDown } from "lucide-react";
import { Site, SiteCleaningRule } from "@/lib/types";
import { SiteRuleDialog } from "@/components/cleaning/site-rule-dialog";
import { BulkRuleDialog } from "@/components/cleaning/bulk-rule-dialog";

interface SitesConfigurationTableProps {
  sites: Site[];
  rules: SiteCleaningRule[];
  siteStatusMap?: Record<string, "ONLINE" | "OFFLINE" | "PARTIALLY ONLINE">;
  siteAlertsMap?: Record<string, number>;
}

export function SitesConfigurationTable({
  sites,
  rules,
  siteStatusMap = {},
  siteAlertsMap = {},
}: SitesConfigurationTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline" | "errors">("all");
  const [sortBy, setSortBy] = useState<
    "name-asc" | "name-desc" | "status-online" | "status-offline" | "errors-desc" | "capacity-desc" | "capacity-asc"
  >("name-asc");

  const [singleSite, setSingleSite] = useState<Site | null>(null);
  const [singleDialogOpen, setSingleDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  const ruleMap = useMemo(() => {
    const map = new Map<string, SiteCleaningRule>();
    rules.forEach((r) => map.set(r.site_id, r));
    return map;
  }, [rules]);

  // Summary counts
  const onlineCount = useMemo(() => {
    return sites.filter((s) => (siteStatusMap[s.id] || "ONLINE") === "ONLINE").length;
  }, [sites, siteStatusMap]);

  const offlineCount = useMemo(() => {
    return sites.filter((s) => siteStatusMap[s.id] === "OFFLINE").length;
  }, [sites, siteStatusMap]);

  const errorsCount = useMemo(() => {
    return sites.filter((s) => (siteAlertsMap[s.id] || 0) > 0).length;
  }, [sites, siteAlertsMap]);

  // Filter & sort
  const filteredSites = useMemo(() => {
    let result = sites.filter((s) => {
      const matchesSearch =
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.location && s.location.toLowerCase().includes(searchQuery.toLowerCase()));
      if (!matchesSearch) return false;

      const st = siteStatusMap[s.id] || "ONLINE";
      const alts = siteAlertsMap[s.id] || 0;

      if (statusFilter === "online") return st === "ONLINE";
      if (statusFilter === "offline") return st === "OFFLINE";
      if (statusFilter === "errors") return alts > 0;

      return true;
    });

    return result.sort((a, b) => {
      const stA = siteStatusMap[a.id] || "ONLINE";
      const stB = siteStatusMap[b.id] || "ONLINE";
      const altsA = siteAlertsMap[a.id] || 0;
      const altsB = siteAlertsMap[b.id] || 0;
      const capA = Number(a.capacity_kwp || 0);
      const capB = Number(b.capacity_kwp || 0);

      switch (sortBy) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "status-online": {
          const statusOrder: Record<string, number> = { ONLINE: 0, "PARTIALLY ONLINE": 1, OFFLINE: 2 };
          return (statusOrder[stA] ?? 3) - (statusOrder[stB] ?? 3);
        }
        case "status-offline": {
          const statusOrder: Record<string, number> = { OFFLINE: 0, "PARTIALLY ONLINE": 1, ONLINE: 2 };
          return (statusOrder[stA] ?? 3) - (statusOrder[stB] ?? 3);
        }
        case "errors-desc":
          return altsB - altsA;
        case "capacity-desc":
          return capB - capA;
        case "capacity-asc":
          return capA - capB;
        default:
          return 0;
      }
    });
  }, [sites, searchQuery, statusFilter, sortBy, siteStatusMap, siteAlertsMap]);

  return (
    <div className="space-y-4">
      {/* Search, Filter Tabs & Sort Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-3 rounded-xl border">
        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("all")}
            className="text-xs h-8 px-3"
          >
            All Sites ({sites.length})
          </Button>
          <Button
            variant={statusFilter === "online" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("online")}
            className="text-xs h-8 px-3"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 inline-block" />
            Online ({onlineCount})
          </Button>
          <Button
            variant={statusFilter === "offline" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("offline")}
            className="text-xs h-8 px-3"
          >
            <span className="w-2 h-2 rounded-full bg-rose-500 mr-1.5 inline-block" />
            Offline ({offlineCount})
          </Button>
          <Button
            variant={statusFilter === "errors" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("errors")}
            className="text-xs h-8 px-3"
          >
            <AlertTriangle className="h-3 w-3 mr-1 text-amber-500" />
            With Errors ({errorsCount})
          </Button>
        </div>

        {/* Search, Sort & Bulk Action */}
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-52">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search sites or locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 text-xs h-8"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-xs h-8 px-2 rounded-md border border-input bg-background font-medium focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="name-asc">Name (A–Z)</option>
              <option value="name-desc">Name (Z–A)</option>
              <option value="status-online">Status (Online First)</option>
              <option value="status-offline">Status (Offline First)</option>
              <option value="errors-desc">Errors (Most First)</option>
              <option value="capacity-desc">Capacity (High to Low)</option>
              <option value="capacity-asc">Capacity (Low to High)</option>
            </select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkDialogOpen(true)}
            className="text-xs h-8 gap-1.5 text-muted-foreground hover:text-foreground shrink-0"
          >
            <Layers className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Bulk configure</span>
          </Button>
        </div>
      </div>

      {/* OPERATIONAL SITES TABLE */}
      <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
        <Table className="text-xs">
          <TableHeader className="bg-muted/50 uppercase tracking-wider font-semibold">
            <TableRow>
              <TableHead className="py-3 px-4">Site</TableHead>
              <TableHead className="py-3 px-4">Location</TableHead>
              <TableHead className="py-3 px-4 text-center">Status</TableHead>
              <TableHead className="py-3 px-4 text-center">Alerts</TableHead>
              <TableHead className="py-3 px-4 text-right">Capacity</TableHead>
              <TableHead className="py-3 px-4">Cleaning Policy</TableHead>
              <TableHead className="py-3 px-4 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSites.map((site) => {
              const rule = ruleMap.get(site.id);
              const isCustom = rule?.is_override === true;
              const status = siteStatusMap[site.id] || "ONLINE";
              const alerts = siteAlertsMap[site.id] || 0;

              return (
                <TableRow key={site.id} className="hover:bg-muted/30">
                  <TableCell className="py-3.5 px-4 font-semibold">
                    <Link href={`/sites/${site.id}`} className="hover:underline text-foreground">
                      {site.name}
                    </Link>
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span>{site.location}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-center">
                    <Badge
                      variant={
                        status === "ONLINE"
                          ? "success"
                          : status === "PARTIALLY ONLINE"
                          ? "warning"
                          : "destructive"
                      }
                      className="capitalize text-[10px] px-2 py-0.5"
                    >
                      {status.toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-center">
                    {alerts > 0 ? (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5 font-mono gap-1">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        <span>{alerts}</span>
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground font-mono text-[11px]">0</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-right font-mono font-medium">
                    {Number(site.capacity_kwp).toLocaleString()} kWp
                  </TableCell>
                  <TableCell className="py-3.5 px-4">
                    {isCustom ? (
                      <div className="space-y-0.5">
                        <Badge variant="secondary" className="text-[10px] px-2 py-0.5 font-medium">
                          Custom Policy
                        </Badge>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          Every {rule.normal_interval_days}d (Monsoon {rule.monsoon_interval_days}d)
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-medium">
                          Default Policy
                        </Badge>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          Every 15d (Monsoon 30d) · Mon–Fri
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-right">
                    <Button
                      size="sm"
                      variant={isCustom ? "outline" : "default"}
                      className="h-7 text-xs gap-1"
                      onClick={() => {
                        setSingleSite(site);
                        setSingleDialogOpen(true);
                      }}
                    >
                      <Settings className="h-3 w-3" />
                      <span>{isCustom ? "Edit policy" : "Configure"}</span>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredSites.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No sites match the current filter or search criteria.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Individual Site Dialog */}
      <SiteRuleDialog
        open={singleDialogOpen}
        onOpenChange={setSingleDialogOpen}
        site={singleSite}
        rule={singleSite ? ruleMap.get(singleSite.id) || null : null}
        onSaved={() => window.location.reload()}
      />

      {/* Bulk Dialog */}
      <BulkRuleDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        sites={sites}
        rules={rules}
        onSaved={() => window.location.reload()}
      />
    </div>
  );
}
