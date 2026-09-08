"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Navigation,
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Trash2,
  Zap,
  Lock,
  Unlock,
  Building2,
  Wrench,
  Info,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type {
  DailyRoute,
  RouteStop,
  WorkOrder,
  WorkOrderType,
  WorkOrderStatus,
  Profile,
  Site,
} from "@/lib/types";

const typeLabels: Record<WorkOrderType, string> = {
  cleaning: "Cleaning",
  maintenance: "Maintenance",
  inspection: "Inspection",
  alarm_investigation: "Alarm Investigation",
};

const typeBadges: Record<WorkOrderType, string> = {
  cleaning: "bg-emerald-100 text-emerald-800 border-emerald-300",
  maintenance: "bg-blue-100 text-blue-800 border-blue-300",
  inspection: "bg-purple-100 text-purple-800 border-purple-300",
  alarm_investigation: "bg-amber-100 text-amber-800 border-amber-300",
};

const statusBadges: Record<WorkOrderStatus, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-300",
  scheduled: "bg-blue-100 text-blue-700 border-blue-300",
  en_route: "bg-indigo-100 text-indigo-700 border-indigo-300",
  in_progress: "bg-amber-100 text-amber-800 border-amber-300",
  completed: "bg-green-100 text-green-800 border-green-300",
  cancelled: "bg-red-100 text-red-700 border-red-300",
};

function RoutePlannerContent() {
  const sb = createClient();
  const searchParams = useSearchParams();

  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState<string>(
    searchParams.get("date") || todayStr
  );
  const [selectedTechId, setSelectedTechId] = useState<string>(
    searchParams.get("technician_id") || ""
  );

  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [currentTech, setCurrentTech] = useState<Profile | null>(null);
  const [dailyRoute, setDailyRoute] = useState<DailyRoute | null>(null);
  const [stops, setStops] = useState<any[]>([]);
  const [unassignedWorkOrders, setUnassignedWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [unpublishConfirmOpen, setUnpublishConfirmOpen] = useState(false);

  // Load Technicians on mount
  useEffect(() => {
    loadTechnicians();
  }, []);

  // Reload Route when date or technician changes
  useEffect(() => {
    if (selectedTechId && selectedDate) {
      loadRouteData();
    } else {
      setDailyRoute(null);
      setStops([]);
    }
  }, [selectedTechId, selectedDate]);

  async function loadTechnicians() {
    const { data } = await sb
      .from("profiles")
      .select("*")
      .in("role", ["technician", "epc_admin", "super_admin"])
      .order("full_name", { ascending: true });

    const techList = (data as Profile[]) ?? [];
    setTechnicians(techList);

    if (techList.length > 0 && !selectedTechId) {
      setSelectedTechId(techList[0].id);
    }
  }

  async function loadRouteData() {
    setLoading(true);

    const activeTech = technicians.find((t) => t.id === selectedTechId) || null;
    setCurrentTech(activeTech);

    // Fetch existing route
    const { data: routeData } = await sb
      .from("daily_routes")
      .select("*")
      .eq("technician_id", selectedTechId)
      .eq("date", selectedDate)
      .maybeSingle();

    setDailyRoute(routeData as DailyRoute | null);

    if (routeData) {
      // Fetch stops
      const { data: stopData } = await sb
        .from("route_stops")
        .select(`
          *,
          work_orders(*, sites(*))
        `)
        .eq("route_id", routeData.id)
        .order("sequence_order", { ascending: true });

      setStops(stopData ?? []);
    } else {
      // Fetch assigned work orders for this tech & date that don't have a route yet
      const { data: woData } = await sb
        .from("work_orders")
        .select("*, sites(*)")
        .eq("technician_id", selectedTechId)
        .eq("scheduled_date", selectedDate)
        .order("created_at", { ascending: true });

      // Build initial unoptimized stops preview
      const previewStops = (woData ?? []).map((wo, i) => ({
        id: `temp-${wo.id}`,
        work_order_id: wo.id,
        sequence_order: i + 1,
        estimated_arrival: null,
        travel_time_mins: 0,
        distance_km: 0,
        work_orders: wo,
      }));

      setStops(previewStops);
    }

    setLoading(false);
  }

  // Auto-Optimize via OSRM Server Route
  async function handleAutoOptimize(force = false) {
    if (!selectedTechId || !selectedDate || !currentTech?.org_id) {
      return toast.error("Please select a valid technician and date");
    }

    setOptimizing(true);
    try {
      const res = await fetch("/api/routes/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          technician_id: selectedTechId,
          date: selectedDate,
          org_id: currentTech.org_id,
          force,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.isPublished) {
          setUnpublishConfirmOpen(true);
          return;
        }
        return toast.error(data.error || "Failed to optimize route");
      }

      if (!data.hasTechBase) {
        toast.info(
          "Technician base location not configured. Generated sequence without road optimization."
        );
      } else if (data.isRoadRouting) {
        toast.success("Route successfully optimized using OSRM Road Network!");
      } else {
        toast.info("OSRM road routing unavailable. Created default sequence.");
      }

      loadRouteData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to call optimization service");
    } finally {
      setOptimizing(false);
    }
  }

  // Published Route Protection: Explicit Unpublish Action
  async function handleUnpublishRoute() {
    if (!dailyRoute) return;

    const { error } = await sb
      .from("daily_routes")
      .update({ status: "optimized" })
      .eq("id", dailyRoute.id);

    if (error) return toast.error(error.message);

    toast.success("Route unpublished. Unlocked for editing.");
    setUnpublishConfirmOpen(false);
    loadRouteData();
  }

  // Publish Route Action
  async function handlePublishRoute() {
    if (!dailyRoute) return toast.error("No generated route to publish");

    const { error } = await sb
      .from("daily_routes")
      .update({ status: "published" })
      .eq("id", dailyRoute.id);

    if (error) return toast.error(error.message);

    toast.success("Route published! Technicians can now view today's route sequence.");
    loadRouteData();
  }

  // Manual Sequence Reordering: Move Up / Move Down
  async function handleMoveStop(index: number, direction: "up" | "down") {
    if (dailyRoute?.status === "published") {
      return toast.error("Route is published. Unpublish first to reorder stops.");
    }

    const newStops = [...stops];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newStops.length) return;

    // Swap elements
    const temp = newStops[index];
    newStops[index] = newStops[targetIndex];
    newStops[targetIndex] = temp;

    // Update sequence numbers
    newStops.forEach((s, idx) => {
      s.sequence_order = idx + 1;
    });

    setStops(newStops);

    // Save to database if route exists
    if (dailyRoute?.id) {
      const updates = newStops.map((s, idx) =>
        sb
          .from("route_stops")
          .update({ sequence_order: idx + 1 })
          .eq("id", s.id)
      );
      await Promise.all(updates);
      toast.success("Sequence updated");
    }
  }

  // Remove Stop from Route
  async function handleRemoveStop(stopId: string, woId: string) {
    if (dailyRoute?.status === "published") {
      return toast.error("Route is published. Unpublish first to edit stops.");
    }

    if (dailyRoute?.id && !stopId.startsWith("temp-")) {
      await sb.from("route_stops").delete().eq("id", stopId);
    }

    const updated = stops.filter((s) => s.id !== stopId);
    updated.forEach((s, idx) => {
      s.sequence_order = idx + 1;
    });
    setStops(updated);
    toast.success("Stop removed from route");
  }

  // Derived Metrics
  const totalFieldWorkMins = stops.reduce(
    (acc, s) => acc + (s.work_orders?.estimated_duration_mins || 60),
    0
  );
  const totalTravelMins = dailyRoute?.total_travel_mins || 0;
  const totalTravelKm = dailyRoute?.total_distance_km || 0;
  const totalDayMins = totalFieldWorkMins + totalTravelMins;

  const hasBaseCoords =
    Boolean(currentTech?.base_latitude) && Boolean(currentTech?.base_longitude);

  return (
    <div className="space-y-6" data-testid="admin-route-planner">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-semibold">Daily Route Planner</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sequence, optimize, and publish daily field technician travel routes.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {dailyRoute?.status === "published" ? (
            <Button
              onClick={() => setUnpublishConfirmOpen(true)}
              variant="outline"
              className="border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100"
            >
              <Unlock className="h-4 w-4 mr-2 text-amber-600" />
              Unpublish &amp; Re-edit
            </Button>
          ) : (
            <>
              <Button
                onClick={() => handleAutoOptimize(false)}
                disabled={optimizing || stops.length === 0}
                variant="outline"
                className="border-primary/40 text-primary hover:bg-primary/10"
              >
                <Zap className="h-4 w-4 mr-2 text-primary" />
                {optimizing ? "Optimizing..." : "Auto-Optimize Route (OSRM)"}
              </Button>

              <Button
                onClick={handlePublishRoute}
                disabled={!dailyRoute || stops.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                <Lock className="h-4 w-4 mr-2" />
                Publish Route
              </Button>
            </>
          )}
        </div>
      </div>

      {/* TECHNICIAN & DATE SELECTOR BAR */}
      <Card className="bg-card">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 flex-1">
            <div className="space-y-1 w-full sm:w-64">
              <Label className="text-xs">Technician</Label>
              <Select value={selectedTechId} onValueChange={setSelectedTechId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select technician" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.full_name || t.email} ({t.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 w-full sm:w-48">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          </div>

          {dailyRoute && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Route Status:</span>
              <Badge variant="outline" className="uppercase font-mono text-xs px-2.5 py-1">
                {dailyRoute.status}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MISSING BASE COORDINATES INFORMATIONAL BANNER */}
      {!hasBaseCoords && (
        <Card className="border-amber-300 bg-amber-50/70 text-amber-900">
          <CardContent className="p-4 flex items-start gap-3">
            <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-semibold text-sm text-amber-900">
                Technician Base Coordinates Not Configured
              </p>
              <p>
                <strong>{currentTech?.full_name || "This technician"}</strong> does not have a configured home/office starting address. Automatic OSRM road optimization requires a starting point, but <strong>manual route sequencing, stop reordering, and route publishing are fully enabled.</strong>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* WORKLOAD SUMMARY METRICS BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground font-medium uppercase">Total Jobs</p>
            <p className="text-xl font-bold text-foreground mt-1">{stops.length}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground font-medium uppercase">Field Work</p>
            <p className="text-xl font-bold text-foreground mt-1">
              {Math.floor(totalFieldWorkMins / 60)}h {totalFieldWorkMins % 60}m
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground font-medium uppercase">Road Travel Dist.</p>
            <p className="text-xl font-bold text-foreground mt-1">
              {totalTravelKm > 0 ? `${totalTravelKm} km` : "—"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground font-medium uppercase">Road Travel Time</p>
            <p className="text-xl font-bold text-foreground mt-1">
              {totalTravelMins > 0 ? `${totalTravelMins} mins` : "—"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-primary font-semibold uppercase">Total Day Duration</p>
            <p className="text-xl font-bold text-primary mt-1">
              {Math.floor(totalDayMins / 60)}h {totalDayMins % 60}m
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ROUTE STOPS TABLE */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Route Stops Sequence ({stops.length})
          </CardTitle>
          <CardDescription className="text-xs">
            Assigned jobs for {currentTech?.full_name || "technician"} on {selectedDate}. V1 arrival estimates assume an 08:00 AM start.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Seq</TableHead>
                <TableHead>Site &amp; Address</TableHead>
                <TableHead>Job Title &amp; Type</TableHead>
                <TableHead>Est. Arrival</TableHead>
                <TableHead>Work Mins</TableHead>
                <TableHead>Prev Hop Travel</TableHead>
                <TableHead>Job Status</TableHead>
                <TableHead className="text-right">Manual Reorder</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stops.map((stop, index) => {
                const wo: WorkOrder = stop.work_orders;
                const site: Site = stop.work_orders?.sites;

                return (
                  <TableRow key={stop.id || index}>
                    <TableCell className="font-bold text-center">
                      <span className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs">
                        {stop.sequence_order || index + 1}
                      </span>
                    </TableCell>

                    <TableCell className="max-w-xs">
                      <p className="font-semibold text-sm text-foreground">
                        {site?.name || "Unknown Site"}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" /> {site?.location || "No address"}
                      </p>
                    </TableCell>

                    <TableCell className="max-w-xs">
                      <p className="font-medium text-sm truncate">{wo?.title}</p>
                      <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border ${typeBadges[wo?.type as WorkOrderType]}`}>
                        {typeLabels[wo?.type as WorkOrderType]}
                      </span>
                    </TableCell>

                    <TableCell className="text-xs font-mono font-medium">
                      {stop.estimated_arrival ? (
                        <span className="text-emerald-700">{stop.estimated_arrival}</span>
                      ) : (
                        <span className="text-muted-foreground italic">—</span>
                      )}
                    </TableCell>

                    <TableCell className="text-xs">
                      {wo?.estimated_duration_mins || 60}m
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {stop.distance_km > 0 ? (
                        <span>
                          {stop.distance_km} km / {stop.travel_time_mins}m
                        </span>
                      ) : (
                        <span className="italic">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${statusBadges[wo?.status as WorkOrderStatus]}`}>
                        {wo?.status?.replace("_", " ") || "scheduled"}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-right space-x-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        disabled={index === 0 || dailyRoute?.status === "published"}
                        onClick={() => handleMoveStop(index, "up")}
                        title="Move Up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>

                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        disabled={index === stops.length - 1 || dailyRoute?.status === "published"}
                        onClick={() => handleMoveStop(index, "down")}
                        title="Move Down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>

                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                        disabled={dailyRoute?.status === "published"}
                        onClick={() => handleRemoveStop(stop.id, stop.work_order_id)}
                        title="Remove Stop"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}

              {stops.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                    No work orders scheduled for this technician on {selectedDate}.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* UNPUBLISH CONFIRMATION DIALOG */}
      <Dialog open={unpublishConfirmOpen} onOpenChange={setUnpublishConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unpublish &amp; Unlock Route?</DialogTitle>
            <DialogDescription>
              This route is currently published for the technician. Unpublishing will unlock it for manual reordering or auto-optimization.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setUnpublishConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                handleUnpublishRoute();
                handleAutoOptimize(true);
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Confirm Unpublish &amp; Re-edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function RoutePlannerPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground animate-pulse">Loading Route Planner...</div>}>
      <RoutePlannerContent />
    </Suspense>
  );
}
