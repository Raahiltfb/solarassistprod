"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Building2, ExternalLink, Calendar } from "lucide-react";
import { Site, Inverter } from "@/lib/types";
import { getSiteStatus } from "@/lib/status-utils";
import { formatDate } from "@/lib/utils";

export interface ExtendedSiteMatrix extends Site {
  inverters?: Inverter[];
  todayEnergyKwh?: number;
  currentPowerKw?: number;
  openTicketsCount?: number;
  openAlertsCount?: number;
}

interface FleetSiteMatrixProps {
  sites: ExtendedSiteMatrix[];
  inverters: Inverter[];
}

export function FleetSiteMatrix({ sites, inverters }: FleetSiteMatrixProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "normal" | "attention" | "offline">("all");

  // Map site statuses dynamically using getSiteStatus utility
  const sitesWithStatus = useMemo(() => {
    return sites.map((site) => {
      const siteInverters = inverters.filter((inv) => inv.site_id === site.id);
      const computedStatus = getSiteStatus(siteInverters);

      return {
        ...site,
        computedStatus,
        invertersCount: siteInverters.length,
      };
    });
  }, [sites, inverters]);

  // Filtered sites based on search and status pills
  const filteredSites = useMemo(() => {
    return sitesWithStatus.filter((site) => {
      const matchesSearch =
        site.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        site.location.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === "normal") return site.computedStatus === "ONLINE" && (site.openTicketsCount || 0) === 0;
      if (statusFilter === "attention") return site.computedStatus === "PARTIALLY ONLINE" || (site.openTicketsCount || 0) > 0;
      if (statusFilter === "offline") return site.computedStatus === "OFFLINE";
      return true;
    });
  }, [sitesWithStatus, searchTerm, statusFilter]);

  return (
    <Card className="border shadow-sm" data-testid="fleet-site-matrix">
      <CardHeader className="p-6 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg font-bold">Fleet Sites Operational Matrix</CardTitle>
              <Badge variant="secondary" className="font-mono text-xs">
                {filteredSites.length} of {sites.length} Sites
              </Badge>
            </div>
            <CardDescription className="text-sm">
              Scalable multi-site operational dashboard with live status, equipment health, and cleaning schedules.
            </CardDescription>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search site name or location..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>

            <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg text-xs">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === "all" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All ({sites.length})
              </button>
              <button
                onClick={() => setStatusFilter("normal")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === "normal" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Normal
              </button>
              <button
                onClick={() => setStatusFilter("attention")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === "attention" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Attention
              </button>
              <button
                onClick={() => setStatusFilter("offline")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === "offline" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Offline
              </button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 border-y text-muted-foreground uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-6">Site Details</th>
                <th className="py-3 px-4">Capacity</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Today's Energy / Power</th>
                <th className="py-3 px-4">Cleaning Schedule</th>
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredSites.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    No operational sites matched your search or status filter.
                  </td>
                </tr>
              ) : (
                filteredSites.map((site) => {
                  let statusBadge = (
                    <Badge variant="success" className="text-[10px] px-2 py-0.5 font-medium">
                      Normal
                    </Badge>
                  );
                  if (site.computedStatus === "PARTIALLY ONLINE" || (site.openTicketsCount || 0) > 0) {
                    statusBadge = (
                      <Badge variant="warning" className="text-[10px] px-2 py-0.5 font-medium">
                        Attention ({site.openTicketsCount || 1} Issue)
                      </Badge>
                    );
                  } else if (site.computedStatus === "OFFLINE") {
                    statusBadge = (
                      <Badge variant="destructive" className="text-[10px] px-2 py-0.5 font-medium">
                        Offline
                      </Badge>
                    );
                  }

                  return (
                    <tr key={site.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 px-6 font-medium">
                        <div className="space-y-0.5">
                          <Link href={`/sites/${site.id}`} className="text-foreground hover:text-primary font-semibold">
                            {site.name}
                          </Link>
                          <div className="text-muted-foreground text-[11px] font-normal truncate max-w-xs">
                            {site.location}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-medium">
                        {site.capacity_kwp.toFixed(1)} <span className="text-muted-foreground font-sans text-[11px]">kWp</span>
                      </td>

                      <td className="py-3.5 px-4">{statusBadge}</td>

                      <td className="py-3.5 px-4 font-mono">
                        <div className="space-y-0.5">
                          <div className="font-semibold text-foreground">
                            {(site.todayEnergyKwh || 0).toFixed(1)} kWh
                          </div>
                          <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                            {(site.currentPowerKw || 0).toFixed(1)} kW live
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="font-mono text-[11px]">
                              {site.next_cleaning_date ? formatDate(site.next_cleaning_date) : "No date"}
                            </span>
                            {site.cleaning_schedule_type && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize">
                                {site.cleaning_schedule_type}
                              </Badge>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            Last: {site.last_cleaned_on ? formatDate(site.last_cleaned_on) : "Never recorded"}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-6 text-right">
                        <Button asChild size="sm" variant="ghost" className="h-7 text-xs gap-1">
                          <Link href={`/sites/${site.id}`}>
                            <span>Inspect</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
