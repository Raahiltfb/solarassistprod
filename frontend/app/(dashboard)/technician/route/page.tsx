"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function TechnicianRouteContent() {
  const sb = createClient();
  const todayStr = new Date().toISOString().slice(0, 10);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [dailyRoute, setDailyRoute] = useState<DailyRoute | null>(null);
  const [stops, setStops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyRoute();
  }, []);

  async function fetchMyRoute() {
    setLoading(true);
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) return;

    const { data: prof } = await sb
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

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
        .select(`
          *,
          work_orders(*, sites(*))
        `)
        .eq("route_id", routeData.id)
        .order("sequence_order", { ascending: true });

      routeStops = stopData ?? [];
    }

    // DYNAMIC ROUTE GENERATION:
    // If no explicit published daily_route exists for today, query all work orders assigned to this technician OR their team
    if (routeStops.length === 0) {
      // Find technician's team
      const { data: techTeams } = await sb
        .from("technician_team_members")
        .select("team_id")
        .eq("technician_id", user.id);
      
      const teamIds = techTeams?.map(t => t.team_id) || [];
      const orFilter = teamIds.length > 0 
        ? `technician_id.eq.${user.id},team_id.in.(${teamIds.join(',')})`
        : `technician_id.eq.${user.id}`;

      const { data: assignedWOs } = await sb
        .from("work_orders")
        .select(`
          *,
          sites(*)
        `)
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
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground animate-pulse">
          Loading Today's Route...
        </p>
      </div>
    );
  }

  const completedCount = stops.filter(
    (s) => s.work_orders?.status === "completed"
  ).length;

  return (
    <div className="space-y-6 max-w-xl mx-auto pb-12" data-testid="technician-my-route">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Today's Route</h1>
          <p className="text-sm text-muted-foreground">
            Ordered sequence of field visits for today
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-xs px-2.5 py-1 bg-primary/5">
          {todayStr}
        </Badge>
      </div>

      {stops.length === 0 ? (
        <Card className="border-dashed p-8 text-center space-y-3">
          <Navigation className="h-10 w-10 text-muted-foreground mx-auto" />
          <h2 className="text-base font-semibold">No Published Route for Today</h2>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Your operations coordinator has not published a sequential route for today yet. Check your individual assigned tasks under <strong>My Tasks</strong>.
          </p>
          <Link href="/service-requests" className="block pt-2">
            <Button variant="outline" size="sm">
              View My Tasks
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Progress Header */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-muted-foreground uppercase font-semibold">Route Progress</span>
                <p className="text-lg font-bold text-foreground">
                  {completedCount} of {stops.length} Stops Completed
                </p>
              </div>
              <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300 uppercase font-mono">
                Published
              </Badge>
            </CardContent>
          </Card>

          {/* Sequential Route Stops */}
          <div className="space-y-3">
            {stops.map((stop, index) => {
              const wo: any = stop.work_orders;
              const isDone = wo?.status === "completed";
              const isActive = ["en_route", "in_progress"].includes(wo?.status);

              return (
                <Card
                  key={stop.id}
                  className={`transition shadow-sm ${
                    isActive
                      ? "border-amber-400 bg-amber-50/50 ring-1 ring-amber-400"
                      : isDone
                      ? "bg-card/60 opacity-85"
                      : "hover:border-primary/50"
                  }`}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          isDone
                            ? "bg-green-100 text-green-800 border border-green-300"
                            : isActive
                            ? "bg-amber-500 text-white animate-pulse"
                            : "bg-primary/10 text-primary"
                        }`}>
                          {stop.sequence_order || index + 1}
                        </span>

                        <div>
                          <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${typeBadges[wo?.type as WorkOrderType]}`}>
                            {typeLabels[wo?.type as WorkOrderType]}
                          </span>
                          <h3 className="font-bold text-base mt-1 leading-snug">
                            {wo?.title}
                          </h3>
                        </div>
                      </div>

                      <Badge variant="outline" className={statusBadges[wo?.status as WorkOrderStatus]}>
                        {wo?.status?.replace("_", " ")}
                      </Badge>
                    </div>

                    <div className="text-xs text-muted-foreground space-y-1 pl-11">
                      <div className="flex items-center gap-1.5 font-medium text-foreground">
                        <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                        {wo?.sites?.name} ({wo?.sites?.location})
                      </div>

                      <div className="flex items-center gap-4 text-xs pt-1">
                        {stop.estimated_arrival && (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1 font-mono">
                            <Clock className="h-3.5 w-3.5" /> Est. Arrival: {stop.estimated_arrival}
                          </span>
                        )}
                        <span>Duration: {wo?.estimated_duration_mins || 60}m</span>
                      </div>
                    </div>

                    <div className="pl-11 pt-1">
                      <Link href={wo?.type === 'cleaning' ? `/technician/cleaning?work_order_id=${wo?.id}&site_id=${wo?.site_id}` : `/service-requests/${wo?.id}`}>
                        <Button
                          className="w-full h-10 text-sm font-semibold justify-between"
                          variant={isActive ? "default" : "outline"}
                        >
                          <span>{isActive ? "Continue Task Execution" : "Open Stop Details"}</span>
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TechnicianRoutePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground animate-pulse">Loading My Route...</div>}>
      <TechnicianRouteContent />
    </Suspense>
  );
}
