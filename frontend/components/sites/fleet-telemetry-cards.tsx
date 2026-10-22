"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MapPin, AlertTriangle, Search, ArrowUpDown, Filter, Zap, RefreshCw } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

export interface SiteCardData {
  id: string;
  name: string;
  location: string;
  capacity_kwp: number;
  siteStatus: "ONLINE" | "PARTIALLY ONLINE" | "OFFLINE";
  alertsCount: number;
  invertersCount: number;
  currentPower: number;
  todayGeneration: number;
  totalGeneration: number;
  lastUpdated: string | null;
}

interface FleetTelemetryCardsProps {
  sites: SiteCardData[];
}

export function FleetTelemetryCards({ sites }: FleetTelemetryCardsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline" | "errors">("all");
  const [sortBy, setSortBy] = useState<
    "name-asc" | "name-desc" | "status-online" | "status-offline" | "errors-desc" | "capacity-desc" | "capacity-asc"
  >("name-asc");

  // Summary counts
  const onlineCount = useMemo(() => sites.filter((s) => s.siteStatus === "ONLINE").length, [sites]);
  const offlineCount = useMemo(() => sites.filter((s) => s.siteStatus === "OFFLINE").length, [sites]);
  const errorsCount = useMemo(() => sites.filter((s) => s.alertsCount > 0).length, [sites]);

  // Filter & sort
  const filteredAndSortedSites = useMemo(() => {
    let result = sites.filter((s) => {
      // Search filter
      const matchesSearch =
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.location.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      // Status / error filter
      if (statusFilter === "online") return s.siteStatus === "ONLINE";
      if (statusFilter === "offline") return s.siteStatus === "OFFLINE";
      if (statusFilter === "errors") return s.alertsCount > 0;

      return true;
    });

    // Sorting
    return result.sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "status-online": {
          const statusOrder = { ONLINE: 0, "PARTIALLY ONLINE": 1, OFFLINE: 2 };
          return (statusOrder[a.siteStatus] ?? 3) - (statusOrder[b.siteStatus] ?? 3);
        }
        case "status-offline": {
          const statusOrder = { OFFLINE: 0, "PARTIALLY ONLINE": 1, ONLINE: 2 };
          return (statusOrder[a.siteStatus] ?? 3) - (statusOrder[b.siteStatus] ?? 3);
        }
        case "errors-desc":
          return b.alertsCount - a.alertsCount;
        case "capacity-desc":
          return b.capacity_kwp - a.capacity_kwp;
        case "capacity-asc":
          return a.capacity_kwp - b.capacity_kwp;
        default:
          return 0;
      }
    });
  }, [sites, searchQuery, statusFilter, sortBy]);

  return (
    <div className="space-y-4">
      {/* Search, Filter Tabs & Sort Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-3 rounded-xl border">
        {/* Status Filter Chips */}
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

        {/* Search & Sort Dropdown */}
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-56">
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
        </div>
      </div>

      {/* Grid of Telemetry Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAndSortedSites.map((s) => {
          return (
            <Card
              key={s.id}
              className="overflow-hidden hover:shadow-md transition-shadow"
              data-testid={`site-card-${s.id}`}
            >
              <CardHeader className="pb-3 border-b space-y-2 bg-muted/15">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/sites/${s.id}`}
                    className="font-semibold text-lg hover:text-primary transition-colors leading-snug break-words flex-1 min-w-0"
                  >
                    {s.name}
                  </Link>
                  <Badge
                    variant={
                      s.siteStatus === "ONLINE"
                        ? "success"
                        : s.siteStatus === "PARTIALLY ONLINE"
                        ? "warning"
                        : "destructive"
                    }
                    className="capitalize shrink-0 whitespace-nowrap"
                  >
                    {s.siteStatus.toLowerCase()}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground flex items-start gap-1 leading-normal break-words">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80 mt-0.5" />
                  <span className="break-words">{s.location}</span>
                </p>
              </CardHeader>
              <CardContent className="pt-4 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <div className="text-muted-foreground text-xs">Capacity</div>
                    <div className="font-semibold font-mono">
                      {Number(s.capacity_kwp).toLocaleString()} kWp
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Current Power</div>
                    <div className="font-semibold font-mono">{s.currentPower.toFixed(2)} kW</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Today's Generation</div>
                    <div className="font-semibold font-mono">{s.todayGeneration.toFixed(1)} kWh</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Total Generation</div>
                    <div className="font-semibold font-mono">
                      {s.totalGeneration.toLocaleString(undefined, { maximumFractionDigits: 0 })} kWh
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Inverters</div>
                    <div className="font-semibold font-mono">{s.invertersCount} units</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Active Alerts</div>
                    <div className="font-semibold">
                      {s.alertsCount > 0 ? (
                        <span className="text-destructive font-mono font-semibold flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5" /> {s.alertsCount} active
                        </span>
                      ) : (
                        <span className="text-success font-mono font-semibold">0</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground border-t pt-3 flex justify-between items-center">
                  <span>Last Updated:</span>
                  <span className="font-mono font-medium">
                    {s.lastUpdated ? formatDateTime(s.lastUpdated) : "—"}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {filteredAndSortedSites.length === 0 && (
          <div className="col-span-full text-center py-12 border rounded-xl bg-card text-muted-foreground">
            No sites match the current filter or search criteria.
          </div>
        )}
      </div>
    </div>
  );
}
