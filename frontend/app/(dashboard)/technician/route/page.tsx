"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Navigation,
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  SprayCan,
  Wrench,
  FileText,
  Wifi,
  WifiOff,
  RefreshCw,
  Crosshair,
  AlertTriangle,
  Play,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type {
  DailyRoute,
  RouteStop,
  WorkOrder,
  WorkOrderType,
  WorkOrderStatus,
  Profile,
} from "@/lib/types";
import { haversineDistanceKm } from "@/lib/cleaning-scheduler";
import {
  getOfflineQueue,
  enqueueOfflineAction,
  processOfflineQueue,
  cacheTodayRoute,
  getCachedTodayRoute,
  QueuedOfflineAction,
} from "@/lib/offline-sync";

const typeLabels: Record<WorkOrderType, string> = {
  cleaning: "Cleaning",
  maintenance: "Maintenance",
  inspection: "Inspection",
  alarm_investigation: "Alarm Investigation",
};

const typeBadges: Record<WorkOrderType, string> = {
  cleaning: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300",
  maintenance: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300",
  inspection: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-300",
  alarm_investigation: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300",
};

const statusBadges: Record<WorkOrderStatus, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-300",
  scheduled: "bg-blue-100 text-blue-700 border-blue-300",
  en_route: "bg-indigo-100 text-indigo-700 border-indigo-300 animate-pulse",
  in_progress: "bg-amber-100 text-amber-800 border-amber-300 font-bold",
  completed: "bg-green-100 text-green-800 border-green-300",
  cancelled: "bg-red-100 text-red-700 border-red-300",
};

function TechnicianRouteContent() {
  const sb = createClient();
  const todayStr = new Date().toISOString().slice(0, 10);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [dailyRoute, setDailyRoute] = useState<DailyRoute | null>(null);
  const [stops, setStops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Offline PWA State
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [offlineQueue, setOfflineQueue] = useState<QueuedOfflineAction[]>([]);
  const [syncing, setSyncing] = useState<boolean>(false);

  // GPS Check-in State
  const [activeCheckInStop, setActiveCheckInStop] = useState<any | null>(null);
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [gpsWarningModal, setGpsWarningModal] = useState<boolean>(false);
  const [gpsDistanceKm, setGpsDistanceKm] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [overrideNotes, setOverrideNotes] = useState<string>("");

  useEffect(() => {
    // Sync online status
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);
      setOfflineQueue(getOfflineQueue());

      const handleOnline = () => {
        setIsOnline(true);
        toast.success("Online mode restored!");
        triggerSync();
      };
      const handleOffline = () => {
        setIsOnline(false);
        toast.warning("Working in Offline Mode. Actions will be saved locally.");
      };

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

  useEffect(() => {
    fetchMyRoute();
  }, []);

  async function triggerSync() {
    setSyncing(true);
    try {
      const res = await processOfflineQueue(sb);
      if (res.successCount > 0) {
        toast.success(`Synced ${res.successCount} queued task updates to server!`);
        fetchMyRoute();
      }
      setOfflineQueue(getOfflineQueue());
    } catch (err: any) {
      toast.error(err?.message || "Error processing offline sync queue");
    }
    setSyncing(false);
  }

  async function fetchMyRoute() {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await sb.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: prof } = await sb.from("profiles").select("*").eq("id", user.id).single();
      setProfile(prof as Profile);

      // Fetch published route for today
      const { data: routeData } = await sb
        .from("daily_routes")
        .select("*")
        .eq("technician_id", user.id)
        .eq("date", todayStr)
        .eq("status", "published")
        .maybeSingle();

      setDailyRoute(routeData as DailyRoute | null);

      let routeStops: any[] = [];
      if (routeData) {
        const { data: stopData } = await sb
          .from("route_stops")
          .select(`*, work_orders(*, sites(*))`)
          .eq("route_id", routeData.id)
          .order("sequence_order", { ascending: true });

        routeStops = stopData ?? [];
      }

      // Dynamic Fallback Route Generation
      if (routeStops.length === 0) {
        const { data: techTeams } = await sb
          .from("technician_team_members")
          .select("team_id")
          .eq("technician_id", user.id);

        const teamIds = techTeams?.map((t) => t.team_id) || [];
        const orFilter =
          teamIds.length > 0
            ? `technician_id.eq.${user.id},team_id.in.(${teamIds.join(",")})`
            : `technician_id.eq.${user.id}`;

        const { data: assignedWOs } = await sb
          .from("work_orders")
          .select(`*, sites(*)`)
          .or(orFilter)
          .in("status", ["scheduled", "en_route", "in_progress", "completed"])
          .order("created_at", { ascending: false });

        if (assignedWOs && assignedWOs.length > 0) {
          const statusWeight: Record<string, number> = {
            in_progress: 1,
            en_route: 2,
            scheduled: 3,
            completed: 4,
            draft: 5,
            cancelled: 6,
          };

          const sortedWOs = [...assignedWOs].sort((a, b) => {
            const wA = statusWeight[a.status] || 99;
            const wB = statusWeight[b.status] || 99;
            if (wA !== wB) return wA - wB;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });

          routeStops = sortedWOs.map((wo, idx) => ({
            id: `dynamic-${wo.id}`,
            sequence_order: idx + 1,
            estimated_arrival: null,
            work_orders: wo,
          }));
        }
      }

      setStops(routeStops);
      cacheTodayRoute(routeStops);
    } catch (err) {
      console.error("Fetch route error, falling back to local cache:", err);
      const cached = getCachedTodayRoute();
      if (cached) {
        setStops(cached);
        toast.info("Displaying cached route data from offline storage.");
      }
    }
    setLoading(false);
  }

  // Action 1: Start Travel (Status: Scheduled -> En Route)
  async function handleStartTravel(stop: any) {
    const wo = stop.work_orders;
    if (!wo) return;

    const newStatus: WorkOrderStatus = "en_route";

    // Update local state immediately for instant feedback
    setStops((prevStops) =>
      prevStops.map((s) =>
        s.id === stop.id ? { ...s, work_orders: { ...s.work_orders, status: newStatus } } : s
      )
    );

    if (!isOnline) {
      enqueueOfflineAction("status_change", { work_order_id: wo.id, site_id: wo.site_id, status: newStatus });
      setOfflineQueue(getOfflineQueue());
      toast.warning("Saved 'Start Travel' offline. Will sync when reconnected.");
      return;
    }

    try {
      await sb.from("work_orders").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", wo.id);
      if (wo.site_id) {
        await sb.from("cleaning_visits").update({ status: "en_route", updated_at: new Date().toISOString() }).eq("site_id", wo.site_id).in("status", ["published", "planned", "approved"]);
      }
      toast.success(`En Route to ${wo.sites?.name || "site"}! Travel started.`);
    } catch (err: any) {
      enqueueOfflineAction("status_change", { work_order_id: wo.id, site_id: wo.site_id, status: newStatus });
      setOfflineQueue(getOfflineQueue());
      toast.info("Network request delayed; queued status update offline.");
    }
  }

  // Action 2: Trigger GPS Check-In
  function initiateGpsCheckIn(stop: any) {
    setActiveCheckInStop(stop);
    setGpsLoading(true);

    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        setUserLocation({ lat: userLat, lng: userLng });

        const site = stop.work_orders?.sites;
        if (site && site.latitude && site.longitude) {
          const distKm = haversineDistanceKm(userLat, userLng, site.latitude, site.longitude);
          setGpsDistanceKm(Math.round(distKm * 10) / 10);

          if (distKm > 1.0) {
            // Distance > 1km: prompt warning modal
            setGpsWarningModal(true);
            setGpsLoading(false);
            return;
          }
        }
        // Distance <= 1km: Proceed with check-in directly
        executeCheckIn(stop, userLat, userLng, null);
      },
      (err) => {
        console.warn("GPS Position acquisition error:", err.message);
        toast.error("Could not obtain exact GPS coordinates. Using site default location.");
        const fallbackLat = stop.work_orders?.sites?.latitude || 19.076;
        const fallbackLng = stop.work_orders?.sites?.longitude || 72.877;
        executeCheckIn(stop, fallbackLat, fallbackLng, "GPS location fallback");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  async function executeCheckIn(stop: any, lat: number, lng: number, notes: string | null) {
    const wo = stop.work_orders;
    if (!wo) return;

    const checkInIso = new Date().toISOString();

    // Update local UI immediately
    setStops((prevStops) =>
      prevStops.map((s) =>
        s.id === stop.id
          ? {
              ...s,
              work_orders: {
                ...s.work_orders,
                status: "in_progress",
                check_in_at: checkInIso,
                check_in_lat: lat,
                check_in_lng: lng,
              },
            }
          : s
      )
    );

    setGpsWarningModal(false);
    setGpsLoading(false);
    setActiveCheckInStop(null);
    setOverrideNotes("");

    if (!isOnline) {
      enqueueOfflineAction("gps_check_in", {
        work_order_id: wo.id,
        site_id: wo.site_id,
        lat,
        lng,
        timestamp: checkInIso,
        override_notes: notes,
      });
      setOfflineQueue(getOfflineQueue());
      toast.warning("Checked in offline. GPS coordinates queued for sync!");
      return;
    }

    try {
      await sb
        .from("work_orders")
        .update({
          status: "in_progress",
          check_in_at: checkInIso,
          check_in_lat: lat,
          check_in_lng: lng,
          updated_at: checkInIso,
        })
        .eq("id", wo.id);

      if (wo.site_id) {
        await sb
          .from("cleaning_visits")
          .update({
            status: "in_progress",
            started_at: checkInIso,
            updated_at: checkInIso,
          })
          .eq("site_id", wo.site_id)
          .in("status", ["published", "en_route", "planned", "approved"]);
      }

      toast.success(`Checked in at ${wo.sites?.name || "site"}! Work in progress.`);
    } catch (err: any) {
      enqueueOfflineAction("gps_check_in", {
        work_order_id: wo.id,
        site_id: wo.site_id,
        lat,
        lng,
        timestamp: checkInIso,
        override_notes: notes,
      });
      setOfflineQueue(getOfflineQueue());
      toast.info("GPS check-in saved to offline queue.");
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center space-y-2">
        <p className="text-muted-foreground animate-pulse font-medium">
          Loading Today's Work & Route...
        </p>
      </div>
    );
  }

  const completedCount = stops.filter((s) => s.work_orders?.status === "completed").length;

  return (
    <div className="space-y-6 max-w-xl mx-auto pb-16" data-testid="technician-my-route">
      {/* Header & Connectivity Status Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">Today's Work</h1>
            <p className="text-xs text-muted-foreground">
              Sequential route & execution workspace
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`text-xs px-2.5 py-1 flex items-center gap-1.5 ${
                isOnline
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-800 border-amber-400 font-bold dark:bg-amber-950 dark:text-amber-300"
              }`}
            >
              {isOnline ? (
                <>
                  <Wifi className="h-3.5 w-3.5 text-emerald-600" /> Online
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-amber-600" /> Offline Mode
                </>
              )}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs px-2.5 py-1 bg-primary/5">
              {todayStr}
            </Badge>
          </div>
        </div>

        {/* Offline Queued Items Banner */}
        {offlineQueue.length > 0 && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin text-amber-600" : "text-amber-600"}`} />
              <span>
                <strong>{offlineQueue.length} offline action(s)</strong> waiting to sync.
              </span>
            </div>
            <Button
              onClick={triggerSync}
              disabled={syncing || !isOnline}
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-[11px] font-semibold border-amber-400 hover:bg-amber-100"
            >
              {syncing ? "Syncing..." : "Sync Now"}
            </Button>
          </div>
        )}
      </div>

      {/* Progress Card Header */}
      <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-background border-primary/20 shadow-sm">
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
              Route Execution Progress
            </span>
            <p className="text-xl font-bold font-mono text-foreground mt-0.5">
              {completedCount} of {stops.length} Stops Completed
            </p>
          </div>
          <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300 uppercase font-mono text-xs">
            {completedCount === stops.length && stops.length > 0 ? "Route Completed" : "In Progress"}
          </Badge>
        </CardContent>
      </Card>

      {/* Sequential Route Stops List */}
      {stops.length === 0 ? (
        <Card className="border-dashed p-8 text-center space-y-3">
          <Navigation className="h-10 w-10 text-muted-foreground mx-auto" />
          <h2 className="text-base font-semibold">No Scheduled Tasks for Today</h2>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            You currently have no active work orders or assigned cleaning stops for today.
          </p>
          <Link href="/service-requests" className="block pt-2">
            <Button variant="outline" size="sm">
              View All Work Orders
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-4">
          {stops.map((stop, index) => {
            const wo: WorkOrder | any = stop.work_orders;
            const isDone = wo?.status === "completed";
            const isEnRoute = wo?.status === "en_route";
            const isInProgress = wo?.status === "in_progress";
            const isScheduled = wo?.status === "scheduled" || wo?.status === "published" || wo?.status === "draft";

            return (
              <Card
                key={stop.id}
                className={`transition shadow-sm overflow-hidden ${
                  isInProgress
                    ? "border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 ring-2 ring-amber-400"
                    : isEnRoute
                    ? "border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20 ring-1 ring-indigo-400"
                    : isDone
                    ? "bg-muted/40 opacity-90 border-emerald-500/30"
                    : "hover:border-primary/50"
                }`}
              >
                <CardContent className="p-4 space-y-3">
                  {/* Top Bar: Sequence Number, Work Order Type, Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-9 w-9 rounded-xl flex items-center justify-center font-mono font-bold text-sm shadow-sm ${
                          isDone
                            ? "bg-emerald-600 text-white"
                            : isInProgress
                            ? "bg-amber-500 text-white animate-pulse"
                            : isEnRoute
                            ? "bg-indigo-600 text-white"
                            : "bg-primary/10 text-primary border border-primary/20"
                        }`}
                      >
                        {stop.sequence_order || index + 1}
                      </span>

                      <div>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${typeBadges[wo?.type as WorkOrderType] || "bg-muted text-foreground"}`}>
                          {typeLabels[wo?.type as WorkOrderType] || wo?.type}
                        </span>
                        <h3 className="font-bold text-base mt-1 leading-snug text-foreground">
                          {wo?.title}
                        </h3>
                      </div>
                    </div>

                    <Badge variant="outline" className={`capitalize font-mono text-[11px] ${statusBadges[wo?.status as WorkOrderStatus] || ""}`}>
                      {wo?.status?.replace("_", " ")}
                    </Badge>
                  </div>

                  {/* Site Address & Details */}
                  <div className="text-xs text-muted-foreground space-y-1 pl-12">
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>{wo?.sites?.name}</span>
                      <span className="text-muted-foreground">({wo?.sites?.location || "Site"})</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs pt-1">
                      {wo?.sites?.capacity_kwp && (
                        <span className="font-mono text-foreground font-semibold">
                          Capacity: {wo.sites.capacity_kwp} kWp
                        </span>
                      )}
                      <span>Est. Duration: {wo?.estimated_duration_mins || 60}m</span>
                      {wo?.check_in_at && (
                        <span className="text-amber-700 dark:text-amber-300 font-mono flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Checked in: {new Date(wo.check_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Workflow Action Buttons */}
                  <div className="pl-12 pt-2 flex flex-col sm:flex-row items-center gap-2">
                    {/* State 1: Scheduled -> Start Travel */}
                    {isScheduled && (
                      <Button
                        onClick={() => handleStartTravel(stop)}
                        className="w-full gap-2 font-semibold h-10 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                      >
                        <Play className="h-4 w-4" />
                        <span>Start Travel (En Route)</span>
                      </Button>
                    )}

                    {/* State 2: En Route -> GPS Check In */}
                    {isEnRoute && (
                      <Button
                        onClick={() => initiateGpsCheckIn(stop)}
                        disabled={gpsLoading && activeCheckInStop?.id === stop.id}
                        className="w-full gap-2 font-semibold h-10 bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                      >
                        <Crosshair className="h-4 w-4 animate-spin-slow" />
                        <span>{gpsLoading && activeCheckInStop?.id === stop.id ? "Locating GPS..." : "GPS Check In at Site"}</span>
                      </Button>
                    )}

                    {/* State 3: In Progress -> Log Execution & Complete */}
                    {isInProgress && (
                      <Link
                        href={wo?.type === "cleaning" ? `/technician/cleaning?work_order_id=${wo?.id}&site_id=${wo?.site_id}` : `/service-requests/${wo?.id}`}
                        className="w-full"
                      >
                        <Button className="w-full gap-2 font-semibold h-10 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
                          <SprayCan className="h-4 w-4" />
                          <span>Log Execution & Complete</span>
                        </Button>
                      </Link>
                    )}

                    {/* State 4: Completed -> View Receipt */}
                    {isDone && (
                      <div className="w-full flex items-center justify-between p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-800 dark:text-emerald-300">
                        <div className="flex items-center gap-2 font-semibold">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span>Task Completed</span>
                        </div>
                        <Link href={`/technician/sites/${wo?.site_id}`}>
                          <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1 hover:bg-emerald-500/20">
                            <span>Site Details</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* GPS Distance Warning Modal */}
      <Dialog open={gpsWarningModal} onOpenChange={setGpsWarningModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" /> GPS Location Warning
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <p className="text-foreground">
              You are currently <strong>{gpsDistanceKm} km</strong> away from{" "}
              <strong>{activeCheckInStop?.work_orders?.sites?.name || "the site"}</strong>.
            </p>
            <p className="text-xs text-muted-foreground">
              Standard check-in requires being within 1.0 km of the solar installation. If you are on site, please provide a brief reason to override.
            </p>

            <div className="space-y-1 pt-2">
              <label className="text-xs font-semibold text-muted-foreground block">
                Override Reason / Notes (Optional)
              </label>
              <Input
                placeholder="e.g. Substation gate check-in / Bad GPS reception"
                value={overrideNotes}
                onChange={(e) => setOverrideNotes(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setGpsWarningModal(false)}>
              Cancel
            </Button>

            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white gap-1"
              onClick={() => {
                if (activeCheckInStop && userLocation) {
                  executeCheckIn(activeCheckInStop, userLocation.lat, userLocation.lng, overrideNotes || "Distance override");
                }
              }}
            >
              Confirm Check-In Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TechnicianRoutePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground animate-pulse">Loading My Work...</div>}>
      <TechnicianRouteContent />
    </Suspense>
  );
}
