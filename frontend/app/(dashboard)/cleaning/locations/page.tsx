"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Building2,
  Plus,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Wrench,
  Clock,
  ShieldCheck,
  MapPin,
  Users,
  Layers,
  ChevronDown,
  ChevronUp,
  Search,
  Check,
  X,
  Camera,
  Trash2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { SubNav } from "@/components/sub-nav";
import { formatDate } from "@/lib/utils";
import type { Site, TechnicianTeam, CleaningLocation, CleaningVisit, CleaningVisitItem } from "@/lib/types";

export default function CleaningLocationsPage() {
  const sb = createClient();

  const [locations, setLocations] = useState<any[]>([]);
  const [allSites, setAllSites] = useState<Site[]>([]);
  const [teams, setTeams] = useState<TechnicianTeam[]>([]);
  const [coordinatedVisits, setCoordinatedVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [search, setSearch] = useState("");
  const [expandedLocId, setExpandedLocId] = useState<string | null>(null);

  // Dialogs
  const [openNewLocDialog, setOpenNewLocDialog] = useState(false);
  const [openNewSiteDialog, setOpenNewSiteDialog] = useState(false);
  const [openAddMemberDialog, setOpenAddMemberDialog] = useState(false);
  const [openScheduleDialog, setOpenScheduleDialog] = useState(false);
  const [openExecutionDialog, setOpenExecutionDialog] = useState(false);

  // Active Context Targets
  const [activeLocation, setActiveLocation] = useState<any | null>(null);
  const [activeVisit, setActiveVisit] = useState<any | null>(null);
  const [visitItems, setVisitItems] = useState<any[]>([]);

  // New Location Form
  const [locForm, setLocForm] = useState({
    name: "",
    address: "",
    notes: "",
  });

  // New Site / Installation Form
  const [siteForm, setSiteForm] = useState({
    name: "",
    location: "",
    capacity_kwp: "5.0",
    cleaning_cycle_days: "30",
    service_tier: "cleaning_only" as "full_om" | "cleaning_only",
    cleaning_location_id: "",
  });

  // Add Member Form
  const [selectedSiteIdToAdd, setSelectedSiteIdToAdd] = useState("");

  // Schedule Coordinated Visit Form
  const [scheduleForm, setScheduleForm] = useState({
    team_id: "",
    scheduled_date: "",
    notes: "",
    selectedSiteIds: [] as string[],
  });

  // Shared Evidence Form in Execution Modal
  const [evidenceForm, setEvidenceForm] = useState({
    safety_photo_url: "",
    before_photo_url: "",
    after_photo_url: "",
    remarks: "",
  });

  async function loadData() {
    setLoading(true);
    try {
      const [locRes, sitesRes, teamsRes, visitsRes] = await Promise.all([
        sb.from("cleaning_locations").select("*, sites(*)").order("name"),
        sb.from("sites").select("*").order("name"),
        sb.from("technician_teams").select("*").eq("is_active", true).order("name"),
        sb
          .from("cleaning_visits")
          .select("*, cleaning_locations(id, name, address), technician_teams(id, name, color_code), cleaning_visit_items(*, sites(id, name, capacity_kwp, service_tier))")
          .not("cleaning_location_id", "is", null)
          .order("target_due_date", { ascending: false }),
      ]);

      setLocations(locRes.data ?? []);
      setAllSites((sitesRes.data as Site[]) ?? []);
      setTeams((teamsRes.data as TechnicianTeam[]) ?? []);
      setCoordinatedVisits(visitsRes.data ?? []);
    } catch (e: any) {
      console.error("Failed to load cleaning locations:", e);
      toast.error("Failed to load cleaning locations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Compute aggregated stats
  const totalLocations = locations.length;
  const totalGroupedInstallations = locations.reduce((sum, loc) => sum + (loc.sites?.length || 0), 0);
  const totalGroupedCapacityKwp = locations.reduce((sum, loc) => {
    const locCap = (loc.sites || []).reduce((s: number, site: any) => s + Number(site.capacity_kwp || 0), 0);
    return sum + locCap;
  }, 0);
  const activeCoordinatedVisits = coordinatedVisits.filter((v) => ["published", "scheduled", "in_progress", "en_route"].includes(v.status)).length;

  // Filtered locations
  const filteredLocations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter((loc) => {
      const matchLoc = loc.name.toLowerCase().includes(q) || (loc.address && loc.address.toLowerCase().includes(q));
      const matchSite = (loc.sites || []).some((s: any) => s.name.toLowerCase().includes(q));
      return matchLoc || matchSite;
    });
  }, [locations, search]);

  // Handle Create Location
  async function handleCreateLocation() {
    if (!locForm.name.trim() || !locForm.address.trim()) {
      return toast.error("Please enter a location name and physical address.");
    }

    try {
      const { data: userProfile } = await sb.from("profiles").select("org_id").single();
      const orgId = userProfile?.org_id || "ac763745-aed5-469d-9956-459fb00a337e";

      const { data, error } = await sb
        .from("cleaning_locations")
        .insert({
          org_id: orgId,
          name: locForm.name.trim(),
          address: locForm.address.trim(),
          notes: locForm.notes.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success(`Cleaning Location "${data.name}" created successfully.`);
      setOpenNewLocDialog(false);
      setLocForm({ name: "", address: "", notes: "" });
      loadData();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to create cleaning location");
    }
  }

  // Handle Create Installation (e.g. Cleaning-Only site without inverters)
  async function handleCreateInstallation() {
    if (!siteForm.name.trim() || !siteForm.location.trim()) {
      return toast.error("Please enter installation name and address.");
    }

    try {
      const { data: userProfile } = await sb.from("profiles").select("org_id").single();
      const orgId = userProfile?.org_id || "ac763745-aed5-469d-9956-459fb00a337e";

      const capKwp = Number(siteForm.capacity_kwp) || 5.0;
      const cycleDays = Number(siteForm.cleaning_cycle_days) || 30;

      const { data, error } = await sb
        .from("sites")
        .insert({
          org_id: orgId,
          name: siteForm.name.trim(),
          location: siteForm.location.trim(),
          latitude: 19.076,
          longitude: 72.8777,
          capacity_kwp: capKwp,
          cleaning_cycle_days: cycleDays,
          service_tier: siteForm.service_tier,
          cleaning_location_id: siteForm.cleaning_location_id || null,
          status: "active",
        })
        .select()
        .single();

      if (error) throw error;

      toast.success(
        `Created ${siteForm.service_tier === "cleaning_only" ? "Cleaning-Only" : "Monitored"} site "${data.name}" successfully.`
      );
      setOpenNewSiteDialog(false);
      setSiteForm({
        name: "",
        location: "",
        capacity_kwp: "5.0",
        cleaning_cycle_days: "30",
        service_tier: "cleaning_only",
        cleaning_location_id: "",
      });
      loadData();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to create installation");
    }
  }

  // Handle Add Member Site to Location
  async function handleAddMemberSite() {
    if (!activeLocation || !selectedSiteIdToAdd) {
      return toast.error("Please select an installation to add.");
    }

    try {
      const { error } = await sb
        .from("sites")
        .update({ cleaning_location_id: activeLocation.id })
        .eq("id", selectedSiteIdToAdd);

      if (error) throw error;

      toast.success("Installation added to cleaning location group.");
      setOpenAddMemberDialog(false);
      setSelectedSiteIdToAdd("");
      loadData();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to add member installation");
    }
  }

  // Handle Remove Member Site from Location
  async function handleRemoveMemberSite(siteId: string, siteName: string) {
    if (!confirm(`Remove "${siteName}" from this cleaning location group? (Installation will not be deleted)`)) {
      return;
    }

    try {
      const { error } = await sb
        .from("sites")
        .update({ cleaning_location_id: null })
        .eq("id", siteId);

      if (error) throw error;

      toast.success(`"${siteName}" removed from group.`);
      loadData();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to remove installation");
    }
  }

  // Open Schedule Dialog for Location
  function handleOpenSchedule(loc: any) {
    setActiveLocation(loc);
    const memberSiteIds = (loc.sites || []).map((s: any) => s.id);
    const today = new Date().toISOString().split("T")[0];
    setScheduleForm({
      team_id: teams[0]?.id || "",
      scheduled_date: today,
      notes: `Coordinated module cleaning for ${loc.name} (${memberSiteIds.length} installations)`,
      selectedSiteIds: memberSiteIds,
    });
    setOpenScheduleDialog(true);
  }

  // Handle Schedule Coordinated Cleaning Visit
  async function handleScheduleCoordinatedVisit() {
    if (!activeLocation) return;
    if (!scheduleForm.scheduled_date) {
      return toast.error("Please pick a scheduled date.");
    }
    if (!scheduleForm.team_id) {
      return toast.error("Please assign a cleaning team.");
    }
    if (scheduleForm.selectedSiteIds.length === 0) {
      return toast.error("Please select at least one installation for this coordinated visit.");
    }

    try {
      const { data: userProfile } = await sb.from("profiles").select("org_id").single();
      const orgId = userProfile?.org_id || "ac763745-aed5-469d-9956-459fb00a337e";
      const cyclePeriod = scheduleForm.scheduled_date.slice(0, 7);

      // 1. Insert 1 row in cleaning_visits for the entire location
      const { data: visit, error: visitErr } = await sb
        .from("cleaning_visits")
        .insert({
          org_id: orgId,
          site_id: null,
          cleaning_location_id: activeLocation.id,
          cycle_period: cyclePeriod,
          visit_sequence_in_month: 1,
          target_due_date: scheduleForm.scheduled_date,
          scheduled_date: scheduleForm.scheduled_date,
          assigned_team_id: scheduleForm.team_id,
          status: "published",
          planner_rationale: scheduleForm.notes || `Coordinated visit for ${activeLocation.name}`,
          estimated_cleaning_mins: scheduleForm.selectedSiteIds.length * 20, // 20m per installation on shared roof
        })
        .select()
        .single();

      if (visitErr) throw visitErr;

      // 2. Insert items for each selected installation in cleaning_visit_items
      const itemsToInsert = scheduleForm.selectedSiteIds.map((sId) => ({
        cleaning_visit_id: visit.id,
        site_id: sId,
        status: "pending",
      }));

      const { error: itemsErr } = await sb.from("cleaning_visit_items").insert(itemsToInsert);
      if (itemsErr) throw itemsErr;

      toast.success(
        `Scheduled 1 coordinated visit for ${activeLocation.name} covering ${scheduleForm.selectedSiteIds.length} installations!`
      );
      setOpenScheduleDialog(false);
      loadData();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to schedule coordinated visit");
    }
  }

  // Open Execution Modal for Coordinated Visit
  function handleOpenExecution(visit: any) {
    setActiveVisit(visit);
    setVisitItems(visit.cleaning_visit_items || []);
    setEvidenceForm({
      safety_photo_url: "",
      before_photo_url: "",
      after_photo_url: "",
      remarks: "",
    });
    setOpenExecutionDialog(true);
  }

  // Toggle item status in execution modal
  function handleUpdateItemStatus(siteId: string, newStatus: string, notes?: string) {
    setVisitItems((prev) =>
      prev.map((it) => {
        if (it.site_id === siteId) {
          return {
            ...it,
            status: newStatus,
            notes: notes !== undefined ? notes : it.notes,
            completed_at: newStatus === "completed" ? new Date().toISOString() : null,
          };
        }
        return it;
      })
    );
  }

  // Mark all items completed
  function handleMarkAllItemsCompleted() {
    setVisitItems((prev) =>
      prev.map((it) => ({
        ...it,
        status: "completed",
        completed_at: new Date().toISOString(),
      }))
    );
    toast.info("All installations marked completed. Click 'Save Execution Checklist' to apply.");
  }

  // Save Execution & Completion Status
  async function handleSaveExecution() {
    if (!activeVisit) return;

    try {
      const today = new Date().toISOString().slice(0, 10);
      const completedCount = visitItems.filter((i) => i.status === "completed").length;
      const totalCount = visitItems.length;
      const isAllComplete = completedCount === totalCount && totalCount > 0;

      // 1. Update individual cleaning_visit_items in database
      for (const item of visitItems) {
        await sb
          .from("cleaning_visit_items")
          .update({
            status: item.status,
            notes: item.notes || null,
            completed_at: item.status === "completed" ? (item.completed_at || new Date().toISOString()) : null,
          })
          .eq("id", item.id);

        // If completed, also update installation's last_cleaned_on!
        if (item.status === "completed") {
          await sb
            .from("sites")
            .update({ last_cleaned_on: today })
            .eq("id", item.site_id);
        }
      }

      // 2. Derive overall visit status
      let overallVisitStatus = activeVisit.status;
      if (isAllComplete) {
        overallVisitStatus = "completed";
      } else if (completedCount > 0) {
        overallVisitStatus = "in_progress";
      }

      await sb
        .from("cleaning_visits")
        .update({
          status: overallVisitStatus,
          completed_at: isAllComplete ? new Date().toISOString() : null,
          planner_rationale: `Execution: ${completedCount}/${totalCount} completed. ${evidenceForm.remarks || ""}`.trim(),
        })
        .eq("id", activeVisit.id);

      toast.success(
        isAllComplete
          ? `Visit completed! All ${totalCount} installations verified.`
          : `Saved: ${completedCount}/${totalCount} completed. Exceptions tracked.`
      );
      setOpenExecutionDialog(false);
      loadData();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to update visit execution");
    }
  }

  // Available unassigned sites for adding to location
  const availableSitesToAdd = useMemo(() => {
    if (!activeLocation) return [];
    return allSites.filter((s) => s.cleaning_location_id !== activeLocation.id);
  }, [allSites, activeLocation]);

  return (
    <div className="space-y-6 pb-12" data-testid="cleaning-locations-page">
      <SubNav hub="cleaning" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
              Multi-Installation Groups
            </span>
            <span className="text-xs text-muted-foreground">• Residential Societies &amp; Clusters</span>
          </div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground mt-1">
            Cleaning Location Groups &amp; Contracts
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Coordinate physical multi-installation societies (like Majestica or Keshav Kunj) under one unified cleaning destination while preserving individual customer records, telemetry, and completion statuses.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button onClick={() => setOpenNewLocDialog(true)} className="gap-2 text-xs">
            <Building2 className="h-4 w-4" /> New Cleaning Location
          </Button>
          <Button onClick={() => setOpenNewSiteDialog(true)} variant="outline" className="gap-2 text-xs">
            <Plus className="h-4 w-4" /> New Installation
          </Button>
        </div>
      </div>

      {/* Aggregated KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold font-mono">{totalLocations}</div>
              <div className="text-xs text-muted-foreground">Cleaning Locations (Societies)</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold font-mono">{totalGroupedInstallations}</div>
              <div className="text-xs text-muted-foreground">Grouped Solar Installations</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold font-mono">
                {totalGroupedCapacityKwp > 1000
                  ? `${(totalGroupedCapacityKwp / 1000).toFixed(2)} MWp`
                  : `${totalGroupedCapacityKwp.toFixed(1)} kWp`}
              </div>
              <div className="text-xs text-muted-foreground">Combined Grouped Capacity</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold font-mono">{activeCoordinatedVisits}</div>
              <div className="text-xs text-muted-foreground">Active Coordinated Visits</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Location Directory vs Coordinated Visits Execution */}
      <Tabs defaultValue="locations" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="locations" className="gap-2 text-xs">
            <Building2 className="h-3.5 w-3.5" /> Locations &amp; Member Sites ({locations.length})
          </TabsTrigger>
          <TabsTrigger value="visits" className="gap-2 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5" /> Coordinated Visits ({coordinatedVisits.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Locations Directory */}
        <TabsContent value="locations" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search locations, address, or member installations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Showing {filteredLocations.length} locations
            </div>
          </div>

          {filteredLocations.length === 0 ? (
            <Card className="border-dashed p-8 text-center space-y-3">
              <Building2 className="h-10 w-10 text-muted-foreground mx-auto" />
              <h3 className="font-semibold text-foreground">No Cleaning Locations Found</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Create your first cleaning location (e.g. "Majestica Society" or "Keshav Kunj") to group multiple monitored or cleaning-only customer installations under one destination.
              </p>
              <Button onClick={() => setOpenNewLocDialog(true)} size="sm" className="gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" /> Create Cleaning Location
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredLocations.map((loc) => {
                const memberSites = loc.sites || [];
                const isExpanded = expandedLocId === loc.id;
                const locCapKwp = memberSites.reduce((s: number, site: any) => s + Number(site.capacity_kwp || 0), 0);
                const fullOmCount = memberSites.filter((s: any) => s.service_tier !== "cleaning_only").length;
                const cleaningOnlyCount = memberSites.filter((s: any) => s.service_tier === "cleaning_only").length;

                return (
                  <Card key={loc.id} className="border shadow-sm overflow-hidden">
                    <CardHeader className="bg-muted/20 pb-3 border-b">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-lg font-bold flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-primary" /> {loc.name}
                            </CardTitle>
                            <Badge variant="outline" className="font-mono text-xs">
                              {memberSites.length} Installations
                            </Badge>
                            <Badge variant="secondary" className="font-mono text-xs">
                              {locCapKwp.toFixed(1)} kWp Total
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span>{loc.address}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => handleOpenSchedule(loc)}
                            size="sm"
                            className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <Calendar className="h-3.5 w-3.5" /> Schedule Coordinated Visit
                          </Button>
                          <Button
                            onClick={() => {
                              setActiveLocation(loc);
                              setOpenAddMemberDialog(true);
                            }}
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                          >
                            <Plus className="h-3.5 w-3.5" /> Add Member Site
                          </Button>
                          <Button
                            onClick={() => setExpandedLocId(isExpanded ? null : loc.id)}
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>

                      {/* Breakdown badges */}
                      <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
                        <span className="text-muted-foreground">Contract Mix:</span>
                        <Badge variant="outline" className="text-[11px] bg-blue-500/5 text-blue-700 dark:text-blue-400 border-blue-500/20">
                          {fullOmCount} Full O&amp;M / Monitored
                        </Badge>
                        <Badge variant="outline" className="text-[11px] bg-amber-500/5 text-amber-700 dark:text-amber-400 border-amber-500/20">
                          {cleaningOnlyCount} Cleaning Only
                        </Badge>
                        {loc.notes && (
                          <span className="text-muted-foreground ml-auto italic text-[11px]">
                            Note: {loc.notes}
                          </span>
                        )}
                      </div>
                    </CardHeader>

                    {/* Member Installations Table (always visible or expandable) */}
                    <CardContent className="p-0">
                      {memberSites.length === 0 ? (
                        <div className="p-6 text-center text-xs text-muted-foreground">
                          No installations linked to {loc.name} yet. Click "Add Member Site" or "New Installation" to attach units.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/10 text-xs">
                                <TableHead className="w-12">#</TableHead>
                                <TableHead>Installation / Customer Name</TableHead>
                                <TableHead>Contract Service Tier</TableHead>
                                <TableHead className="text-right">Capacity</TableHead>
                                <TableHead>Cleaning Cycle</TableHead>
                                <TableHead>Last Cleaned</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {memberSites.map((site: any, idx: number) => {
                                const isCleaningOnly = site.service_tier === "cleaning_only";
                                return (
                                  <TableRow key={site.id} className="text-xs hover:bg-muted/20">
                                    <TableCell className="font-mono text-muted-foreground">{idx + 1}</TableCell>
                                    <TableCell className="font-medium text-foreground">
                                      <Link href={`/sites/${site.id}`} className="hover:underline flex items-center gap-1.5">
                                        {site.name}
                                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                      </Link>
                                    </TableCell>
                                    <TableCell>
                                      {isCleaningOnly ? (
                                        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 text-[10px]">
                                          Cleaning Only
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                                          Full O&amp;M / Monitored
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-semibold">
                                      {Number(site.capacity_kwp || 0).toFixed(1)} kWp
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                      Every {site.cleaning_cycle_days || 30} days
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                      {site.last_cleaned_on ? formatDate(site.last_cleaned_on) : "Not yet cleaned"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Button
                                        onClick={() => handleRemoveMemberSite(site.id, site.name)}
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-destructive hover:bg-destructive/10 text-xs"
                                        title="Remove from group"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* TAB 2: Coordinated Visits Execution */}
        <TabsContent value="visits" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Scheduled &amp; Historical Coordinated Visits</h2>
            <div className="text-xs text-muted-foreground">
              Total {coordinatedVisits.length} visits
            </div>
          </div>

          {coordinatedVisits.length === 0 ? (
            <Card className="border-dashed p-8 text-center text-xs text-muted-foreground">
              No coordinated visits scheduled yet. Use "Schedule Coordinated Visit" on any Cleaning Location.
            </Card>
          ) : (
            <div className="space-y-3">
              {coordinatedVisits.map((v) => {
                const items = v.cleaning_visit_items || [];
                const completedCount = items.filter((i: any) => i.status === "completed").length;
                const totalItems = items.length;
                const incompleteCount = items.filter((i: any) => ["incomplete", "skipped", "issue"].includes(i.status)).length;

                return (
                  <Card key={v.id} className="border shadow-sm">
                    <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground">
                            {v.cleaning_locations?.name || "Cleaning Location"}
                          </span>
                          <Badge
                            variant={v.status === "completed" ? "default" : "outline"}
                            className={
                              v.status === "completed"
                                ? "bg-emerald-600 text-white text-[11px]"
                                : v.status === "in_progress"
                                ? "bg-blue-500/10 text-blue-700 border-blue-500/20 text-[11px]"
                                : "text-[11px]"
                            }
                          >
                            {v.status === "completed" ? "Completed" : v.status}
                          </Badge>
                          <Badge variant="secondary" className="font-mono text-xs">
                            {completedCount} / {totalItems} Finished
                          </Badge>
                          {incompleteCount > 0 && (
                            <Badge variant="destructive" className="text-[10px]">
                              {incompleteCount} Exceptions
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" /> {formatDate(v.scheduled_date || v.target_due_date)}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" /> Assigned: {v.technician_teams?.name || "Cleaning Team"}
                          </span>
                          <span>•</span>
                          <span>Est. {v.estimated_cleaning_mins || 90} mins</span>
                        </div>
                        {v.planner_rationale && (
                          <div className="text-xs text-muted-foreground italic">
                            {v.planner_rationale}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => handleOpenExecution(v)}
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> View &amp; Update Checklist
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ───────────────────────────────────────────────────────── */}
      {/* DIALOG 1: Create Cleaning Location */}
      {/* ───────────────────────────────────────────────────────── */}
      <Dialog open={openNewLocDialog} onOpenChange={setOpenNewLocDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Cleaning Location Group</DialogTitle>
            <DialogDescription>
              Group multiple rooftop solar installations (e.g. within a residential society or commercial complex) under one coordinated cleaning destination.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Location / Society Name *</Label>
              <Input
                placeholder="e.g. Majestica Society or Keshav Kunj"
                value={locForm.name}
                onChange={(e) => setLocForm({ ...locForm, name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Physical Address *</Label>
              <Textarea
                placeholder="e.g. Ghodbunder Road, Kasarvadavali, Thane West, Maharashtra"
                value={locForm.address}
                onChange={(e) => setLocForm({ ...locForm, address: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Access / Gate Notes (Optional)</Label>
              <Input
                placeholder="e.g. Gate 2 security clearance required, keys with supervisor"
                value={locForm.notes}
                onChange={(e) => setLocForm({ ...locForm, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNewLocDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateLocation}>Create Location</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────────────────────────────────────────────────────── */}
      {/* DIALOG 2: Create New Installation (Cleaning-Only or Monitored) */}
      {/* ───────────────────────────────────────────────────────── */}
      <Dialog open={openNewSiteDialog} onOpenChange={setOpenNewSiteDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Solar Installation / Site Record</DialogTitle>
            <DialogDescription>
              Add a new customer installation. Cleaning-only sites do not require inverter telemetry or OEM credentials.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Contract Service Tier *</Label>
              <Select
                value={siteForm.service_tier}
                onValueChange={(val: any) => setSiteForm({ ...siteForm, service_tier: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cleaning_only">
                    Cleaning Only (No Inverters/Telemetry Required)
                  </SelectItem>
                  <SelectItem value="full_om">
                    Full O&amp;M / Monitored (Requires Telemetry &amp; Inverters)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {siteForm.service_tier === "cleaning_only"
                  ? "✓ Zero OEM credentials needed. No false offline alerts. Appears in cleaning schedules and reports."
                  : "Includes full technical string monitoring, telemetry ingestion, and inverter diagnostics."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Installation / Customer Name *</Label>
              <Input
                placeholder="e.g. Majestica Flat 101 - A. Mehta"
                value={siteForm.name}
                onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Physical Location / Address *</Label>
              <Input
                placeholder="e.g. Thane West, Maharashtra"
                value={siteForm.location}
                onChange={(e) => setSiteForm({ ...siteForm, location: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Installed Capacity (kWp)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={siteForm.capacity_kwp}
                  onChange={(e) => setSiteForm({ ...siteForm, capacity_kwp: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Cleaning Cycle (Days)</Label>
                <Input
                  type="number"
                  value={siteForm.cleaning_cycle_days}
                  onChange={(e) => setSiteForm({ ...siteForm, cleaning_cycle_days: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Assign to Cleaning Location Group (Optional)</Label>
              <Select
                value={siteForm.cleaning_location_id}
                onValueChange={(val) => setSiteForm({ ...siteForm, cleaning_location_id: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Standalone Installation (No Group)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Standalone Installation (No Group)</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name} ({loc.address})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNewSiteDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateInstallation}>Save Installation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────────────────────────────────────────────────────── */}
      {/* DIALOG 3: Add Existing Site to Location */}
      {/* ───────────────────────────────────────────────────────── */}
      <Dialog open={openAddMemberDialog} onOpenChange={setOpenAddMemberDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Installation to {activeLocation?.name}</DialogTitle>
            <DialogDescription>
              Link an existing site in Solar Assist to this physical cleaning location.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Select Installation</Label>
              <Select value={selectedSiteIdToAdd} onValueChange={setSelectedSiteIdToAdd}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a site from fleet..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {availableSitesToAdd.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.capacity_kwp} kWp · {s.service_tier === "cleaning_only" ? "Cleaning Only" : "Full O&M"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenAddMemberDialog(false)}>Cancel</Button>
            <Button onClick={handleAddMemberSite} disabled={!selectedSiteIdToAdd}>Add to Group</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────────────────────────────────────────────────────── */}
      {/* DIALOG 4: Schedule Coordinated Visit */}
      {/* ───────────────────────────────────────────────────────── */}
      <Dialog open={openScheduleDialog} onOpenChange={setOpenScheduleDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Schedule Coordinated Visit for {activeLocation?.name}</DialogTitle>
            <DialogDescription>
              Dispatches one cleaning crew to service all selected installations at this physical location in one coordinated visit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Target Date *</Label>
                <Input
                  type="date"
                  value={scheduleForm.scheduled_date}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, scheduled_date: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Assign Cleaning Crew *</Label>
                <Select
                  value={scheduleForm.team_id}
                  onValueChange={(val) => setScheduleForm({ ...scheduleForm, team_id: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select team..." />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Access &amp; Shift Notes</Label>
              <Input
                placeholder="e.g. Coordinated building wash with society security"
                value={scheduleForm.notes}
                onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <Label className="text-xs">Installations Included ({scheduleForm.selectedSiteIds.length} of {activeLocation?.sites?.length || 0})</Label>
                <div className="space-x-2">
                  <button
                    type="button"
                    onClick={() => setScheduleForm({ ...scheduleForm, selectedSiteIds: (activeLocation?.sites || []).map((s: any) => s.id) })}
                    className="text-primary hover:underline"
                  >
                    Select All
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => setScheduleForm({ ...scheduleForm, selectedSiteIds: [] })}
                    className="text-muted-foreground hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1.5 bg-muted/10">
                {(activeLocation?.sites || []).map((site: any) => {
                  const isChecked = scheduleForm.selectedSiteIds.includes(site.id);
                  return (
                    <label
                      key={site.id}
                      className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/40 cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setScheduleForm({
                              ...scheduleForm,
                              selectedSiteIds: [...scheduleForm.selectedSiteIds, site.id],
                            });
                          } else {
                            setScheduleForm({
                              ...scheduleForm,
                              selectedSiteIds: scheduleForm.selectedSiteIds.filter((id) => id !== site.id),
                            });
                          }
                        }}
                        className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                      />
                      <span className="font-medium text-foreground">{site.name}</span>
                      <span className="text-muted-foreground text-[11px] ml-auto">
                        {site.capacity_kwp} kWp · {site.service_tier === "cleaning_only" ? "Cleaning Only" : "Full O&M"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenScheduleDialog(false)}>Cancel</Button>
            <Button onClick={handleScheduleCoordinatedVisit} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Schedule {scheduleForm.selectedSiteIds.length} Installations
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────────────────────────────────────────────────────── */}
      {/* DIALOG 5: Execution & Installation Checklist Modal */}
      {/* ───────────────────────────────────────────────────────── */}
      <Dialog open={openExecutionDialog} onOpenChange={setOpenExecutionDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Coordinated Visit Checklist &amp; Evidence</DialogTitle>
            <DialogDescription>
              {activeVisit?.cleaning_locations?.name} • Scheduled {formatDate(activeVisit?.scheduled_date || activeVisit?.target_due_date)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Quick action bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/20 border rounded-lg">
              <div>
                <span className="text-xs font-semibold text-foreground">
                  Completion Progress:{" "}
                  {visitItems.filter((i) => i.status === "completed").length} of {visitItems.length} Installations Done
                </span>
              </div>
              <Button
                type="button"
                onClick={handleMarkAllItemsCompleted}
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
              >
                <Check className="h-3.5 w-3.5" /> Mark All 100% Completed
              </Button>
            </div>

            {/* Installation items checklist */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Individual Installation Status</Label>
              <div className="border rounded-md divide-y max-h-72 overflow-y-auto">
                {visitItems.map((item, idx) => {
                  const siteName = item.sites?.name || "Installation";
                  const isCompleted = item.status === "completed";

                  return (
                    <div key={item.id || idx} className="p-2.5 flex flex-wrap items-center justify-between gap-3 text-xs hover:bg-muted/10">
                      <div className="space-y-0.5 max-w-[280px]">
                        <div className="font-semibold text-foreground flex items-center gap-1.5">
                          <span>{idx + 1}.</span> {siteName}
                        </div>
                        {item.notes && (
                          <div className="text-[11px] text-amber-600 dark:text-amber-400 italic">
                            Exception: {item.notes}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 ml-auto">
                        <Select
                          value={item.status}
                          onValueChange={(val) => {
                            if (val === "incomplete" || val === "skipped" || val === "issue") {
                              const note = prompt(`Enter reason for ${val} on "${siteName}":`, item.notes || "Terrace locked / access issue");
                              handleUpdateItemStatus(item.site_id, val, note || "Access unavailable");
                            } else {
                              handleUpdateItemStatus(item.site_id, val);
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="incomplete">Incomplete</SelectItem>
                            <SelectItem value="skipped">Skipped</SelectItem>
                            <SelectItem value="issue">Issue</SelectItem>
                          </SelectContent>
                        </Select>

                        <Badge
                          variant={isCompleted ? "default" : "secondary"}
                          className={isCompleted ? "bg-emerald-600 text-white text-[10px]" : "text-[10px]"}
                        >
                          {item.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Shared Photographic Evidence Note */}
            <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg text-xs space-y-1 text-blue-900 dark:text-blue-300">
              <div className="font-semibold flex items-center gap-1.5">
                <Camera className="h-4 w-4" /> Shared Photographic Evidence
              </div>
              <p className="text-[11px] text-muted-foreground">
                Visit-level photographs (Safety gear, Before, After) apply across all installations at this shared society rooftop. Technicians are not forced to upload 25 duplicate sets of photos for a single building.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenExecutionDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveExecution} className="bg-primary text-primary-foreground">
              Save Execution Checklist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
