"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Settings, Search, MapPin, Building2, Layers, AlertTriangle, ArrowUpDown, Plus } from "lucide-react";
import { Site, SiteCleaningRule } from "@/lib/types";
import { SiteRuleDialog } from "@/components/cleaning/site-rule-dialog";
import { BulkRuleDialog } from "@/components/cleaning/bulk-rule-dialog";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface SitesConfigurationTableProps {
  sites: Site[];
  rules: SiteCleaningRule[];
  locations?: Array<{ id: string; name: string }>;
  siteStatusMap?: Record<string, "ONLINE" | "OFFLINE" | "PARTIALLY ONLINE">;
  siteAlertsMap?: Record<string, number>;
}

export function SitesConfigurationTable({
  sites,
  rules,
  locations = [],
  siteStatusMap = {},
  siteAlertsMap = {},
}: SitesConfigurationTableProps) {
  const sb = createClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline" | "errors" | "cleaning_only">("all");
  const [sortBy, setSortBy] = useState<
    "name-asc" | "name-desc" | "status-online" | "status-offline" | "errors-desc" | "capacity-desc" | "capacity-asc"
  >("name-asc");

  const [singleSite, setSingleSite] = useState<Site | null>(null);
  const [singleDialogOpen, setSingleDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [addSiteOpen, setAddSiteOpen] = useState(false);

  // New Site Form
  const [newSiteForm, setNewSiteForm] = useState({
    name: "",
    location: "",
    capacity_kwp: "5.0",
    cleaning_cycle_days: "30",
    service_tier: "cleaning_only" as "full_om" | "cleaning_only",
    cleaning_location_id: "",
  });

  const locationMap = useMemo(() => {
    const map = new Map<string, string>();
    locations.forEach((l) => map.set(l.id, l.name));
    return map;
  }, [locations]);

  const ruleMap = useMemo(() => {
    const map = new Map<string, SiteCleaningRule>();
    rules.forEach((r) => map.set(r.site_id, r));
    return map;
  }, [rules]);

  // Create site handler
  async function handleCreateSite() {
    if (!newSiteForm.name.trim() || !newSiteForm.location.trim()) {
      return toast.error("Please enter a site name and location.");
    }
    try {
      const { data: userProfile } = await sb.from("profiles").select("org_id").single();
      const orgId = userProfile?.org_id || "ac763745-aed5-469d-9956-459fb00a337e";
      const capKwp = Number(newSiteForm.capacity_kwp) || 5.0;
      const cycleDays = Number(newSiteForm.cleaning_cycle_days) || 30;

      const { data, error } = await sb
        .from("sites")
        .insert({
          org_id: orgId,
          name: newSiteForm.name.trim(),
          location: newSiteForm.location.trim(),
          latitude: 19.076,
          longitude: 72.8777,
          capacity_kwp: capKwp,
          cleaning_cycle_days: cycleDays,
          service_tier: newSiteForm.service_tier,
          cleaning_location_id: newSiteForm.cleaning_location_id || null,
          status: "active",
        })
        .select()
        .single();

      if (error) throw error;

      toast.success(`Site "${data.name}" (${newSiteForm.service_tier === "cleaning_only" ? "Cleaning Only" : "Full O&M"}) created.`);
      setAddSiteOpen(false);
      window.location.reload();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to create installation");
    }
  }

  // Summary counts
  const onlineCount = useMemo(() => {
    return sites.filter((s) => (siteStatusMap[s.id] || "ONLINE") === "ONLINE").length;
  }, [sites, siteStatusMap]);

  const offlineCount = useMemo(() => {
    return sites.filter((s) => siteStatusMap[s.id] === "OFFLINE" && s.service_tier !== "cleaning_only").length;
  }, [sites, siteStatusMap]);

  const errorsCount = useMemo(() => {
    return sites.filter((s) => (siteAlertsMap[s.id] || 0) > 0 && s.service_tier !== "cleaning_only").length;
  }, [sites, siteAlertsMap]);

  const cleaningOnlyCount = useMemo(() => {
    return sites.filter((s) => s.service_tier === "cleaning_only").length;
  }, [sites]);

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
      if (statusFilter === "offline") return st === "OFFLINE" && s.service_tier !== "cleaning_only";
      if (statusFilter === "errors") return alts > 0 && s.service_tier !== "cleaning_only";
      if (statusFilter === "cleaning_only") return s.service_tier === "cleaning_only";

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
          <Button
            variant={statusFilter === "cleaning_only" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("cleaning_only")}
            className="text-xs h-8 px-3"
          >
            <span className="w-2 h-2 rounded-full bg-amber-500 mr-1.5 inline-block" />
            Cleaning Only ({cleaningOnlyCount})
          </Button>
        </div>

        {/* Search, Sort & Bulk Action */}
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setAddSiteOpen(true)}
            size="sm"
            className="text-xs h-8 gap-1.5 bg-primary text-primary-foreground shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Site</span>
          </Button>

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
              <TableHead className="py-3 px-4">Site / Installation</TableHead>
              <TableHead className="py-3 px-4">Contract Tier</TableHead>
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
              const isCleaningOnly = site.service_tier === "cleaning_only";
              const status = isCleaningOnly ? "ONLINE" : (siteStatusMap[site.id] || "ONLINE");
              const alerts = isCleaningOnly ? 0 : (siteAlertsMap[site.id] || 0);
              const locationGroupName = site.cleaning_location_id ? locationMap.get(site.cleaning_location_id) : null;

              return (
                <TableRow key={site.id} className="hover:bg-muted/30">
                  <TableCell className="py-3.5 px-4 font-semibold">
                    <div className="space-y-0.5">
                      <Link href={`/sites/${site.id}`} className="hover:underline text-foreground flex items-center gap-1.5">
                        {site.name}
                      </Link>
                      {locationGroupName && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Building2 className="h-3 w-3 text-primary shrink-0" />
                          <span>Group: {locationGroupName}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5 px-4">
                    {isCleaningOnly ? (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 text-[10px]">
                        Cleaning Only
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                        Full O&amp;M
                      </Badge>
                    )}
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
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No sites match the current filter or search criteria.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* New Site Dialog */}
      <Dialog open={addSiteOpen} onOpenChange={setAddSiteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Solar Installation / Site Record</DialogTitle>
            <DialogDescription>
              Create a new customer site. Cleaning-only sites do not require inverter telemetry or OEM credentials.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Contract Service Tier *</Label>
              <Select
                value={newSiteForm.service_tier}
                onValueChange={(val: any) => setNewSiteForm({ ...newSiteForm, service_tier: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cleaning_only">
                    Cleaning Only (No Inverters/Telemetry Required)
                  </SelectItem>
                  <SelectItem value="full_om">
                    Full O&amp;M / Monitored (Requires Inverters &amp; Telemetry)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Site / Installation Name *</Label>
              <Input
                placeholder="e.g. Majestica Flat 204 or Keshav Kunj Unit 7"
                value={newSiteForm.name}
                onChange={(e) => setNewSiteForm({ ...newSiteForm, name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Location / Address *</Label>
              <Input
                placeholder="e.g. Thane West, Maharashtra"
                value={newSiteForm.location}
                onChange={(e) => setNewSiteForm({ ...newSiteForm, location: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Capacity (kWp)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={newSiteForm.capacity_kwp}
                  onChange={(e) => setNewSiteForm({ ...newSiteForm, capacity_kwp: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Cleaning Cycle (Days)</Label>
                <Input
                  type="number"
                  value={newSiteForm.cleaning_cycle_days}
                  onChange={(e) => setNewSiteForm({ ...newSiteForm, cleaning_cycle_days: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Cleaning Location Group (Optional)</Label>
              <Select
                value={newSiteForm.cleaning_location_id}
                onValueChange={(val) => setNewSiteForm({ ...newSiteForm, cleaning_location_id: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Standalone Installation (No Group)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Standalone Installation (No Group)</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSiteOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateSite}>Create Site</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
