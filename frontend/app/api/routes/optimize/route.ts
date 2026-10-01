import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CompositeRoutingProvider, LocationPoint } from "@/lib/routing/provider";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const sb = await createClient();

    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { technician_id, date, org_id, start_time = "08:00", force } = body;

    if (!technician_id || !date || !org_id) {
      return NextResponse.json(
        { error: "technician_id, date, and org_id are required" },
        { status: 400 }
      );
    }

    // 1. Check existing route and enforce Published Safety Rule
    const { data: existingRoute } = await sb
      .from("daily_routes")
      .select("*")
      .eq("technician_id", technician_id)
      .eq("date", date)
      .maybeSingle();

    if (existingRoute && existingRoute.status === "published" && !force) {
      return NextResponse.json(
        {
          error:
            "Route is currently published. Unpublish route before re-optimizing.",
          isPublished: true,
        },
        { status: 400 }
      );
    }

    // 2. Fetch Technician Profile & Team Memberships
    const { data: techProfile } = await sb
      .from("profiles")
      .select("id, full_name, email, base_latitude, base_longitude")
      .eq("id", technician_id)
      .single();

    const { data: techTeams } = await sb
      .from("technician_team_members")
      .select("team_id")
      .eq("technician_id", technician_id);

    const teamIds = (techTeams ?? []).map((t) => t.team_id).filter(Boolean);

    // 3. Fetch Scheduled Work Orders for Technician OR Team & Date
    let woQuery = sb
      .from("work_orders")
      .select("*, sites(id, name, location, latitude, longitude)")
      .eq("scheduled_date", date)
      .eq("org_id", org_id)
      .in("status", ["scheduled", "en_route", "in_progress", "draft"]);

    if (teamIds.length > 0) {
      woQuery = woQuery.or(`technician_id.eq.${technician_id},team_id.in.(${teamIds.join(",")})`);
    } else {
      woQuery = woQuery.eq("technician_id", technician_id);
    }

    const { data: fetchedWos } = await woQuery.order("created_at", { ascending: true });
    let workOrders = (fetchedWos ?? []) as any[];

    // 3b. Fetch canonical Phase 2 cleaning_visits for Technician OR Team & Date
    let cvQuery = sb
      .from("cleaning_visits")
      .select("*, sites(id, name, location, latitude, longitude)")
      .eq("scheduled_date", date)
      .in("status", ["planned", "approved", "published", "required", "scheduled", "in_progress", "completed"]);

    if (teamIds.length > 0) {
      cvQuery = cvQuery.or(`assigned_technician_id.eq.${technician_id},assigned_team_id.in.(${teamIds.join(",")})`);
    } else {
      cvQuery = cvQuery.eq("assigned_technician_id", technician_id);
    }

    const { data: cvVisits } = await cvQuery;

    // Auto-convert any missing cleaning_visits into real Work Orders so they can be routed and tracked
    if (cvVisits && cvVisits.length > 0) {
      const existingSiteIds = new Set(workOrders.map((w) => w.site_id));
      for (const cv of cvVisits) {
        if (!existingSiteIds.has(cv.site_id)) {
          existingSiteIds.add(cv.site_id);
          const { data: newWo } = await sb
            .from("work_orders")
            .insert({
              org_id,
              site_id: cv.site_id,
              team_id: cv.assigned_team_id,
              technician_id: technician_id,
              title: `Module Cleaning: ${cv.sites?.name || "Site"}`,
              description: cv.planner_rationale || `Planned monthly cleaning visit`,
              type: "cleaning",
              status: "scheduled",
              scheduled_date: date,
              estimated_duration_mins: cv.estimated_cleaning_mins || 120,
            })
            .select("*, sites(id, name, location, latitude, longitude)")
            .single();

          if (newWo) {
            workOrders.push(newWo);
          }
        }
      }
    }

    if (!workOrders || workOrders.length === 0) {
      return NextResponse.json({
        message: "No scheduled service requests found for this technician on this date.",
        route: null,
        stops: [],
      });
    }

    const hasTechBase =
      Boolean(techProfile?.base_latitude) && Boolean(techProfile?.base_longitude);

    // Group work orders by physical location to preserve Phase 2 location batching
    const locationGroupsMap = new Map<string, typeof workOrders>();
    workOrders.forEach((wo) => {
      const locKey = wo.sites?.location || `${wo.sites?.latitude},${wo.sites?.longitude}` || wo.site_id;
      const existing = locationGroupsMap.get(locKey) || [];
      existing.push(wo);
      locationGroupsMap.set(locKey, existing);
    });

    // Create location points representing distinct physical locations
    const locations: LocationPoint[] = [];

    if (hasTechBase && techProfile?.base_latitude && techProfile?.base_longitude) {
      locations.push({
        id: "START_BASE",
        lat: techProfile.base_latitude,
        lng: techProfile.base_longitude,
        locationGroup: "START_BASE",
      });
    }

    const groupKeys = Array.from(locationGroupsMap.keys());
    groupKeys.forEach((key) => {
      const groupWos = locationGroupsMap.get(key)!;
      const sampleSite = groupWos[0]?.sites;
      if (sampleSite?.latitude && sampleSite?.longitude) {
        locations.push({
          id: key,
          lat: Number(sampleSite.latitude),
          lng: Number(sampleSite.longitude),
          locationGroup: key,
        });
      }
    });

    let isRoadRouting = false;
    let providerName = "Default";
    let orderedWorkOrders: typeof workOrders = [];
    let stopMetrics: Array<{
      travel_time_mins: number;
      distance_km: number;
      estimated_arrival: string | null;
    }> = [];
    let totalTravelMins = 0;
    let totalDistanceKm = 0;
    let totalWorkMins = 0;

    // Run Composite Routing (OSRM with automatic Haversine Road Factor fallback)
    if (locations.length >= 2) {
      const routingProvider = new CompositeRoutingProvider();
      const matrixRes = await routingProvider.getMatrix(locations);
      isRoadRouting = matrixRes.isRoadRouting;
      providerName = matrixRes.providerName;

      if (matrixRes.durationsMins.length > 0) {
        const n = locations.length;
        const visited = new Array(n).fill(false);
        visited[0] = true; // Start at technician base

        const sequenceIndices: number[] = [0];
        let current = 0;

        // Nearest Neighbor TSP solver over physical location nodes
        for (let step = 1; step < n; step++) {
          let nearest = -1;
          let minTime = Infinity;

          for (let j = 1; j < n; j++) {
            if (!visited[j]) {
              const time = matrixRes.durationsMins[current][j];
              if (time < minTime) {
                minTime = time;
                nearest = j;
              }
            }
          }

          if (nearest !== -1) {
            visited[nearest] = true;
            sequenceIndices.push(nearest);
            current = nearest;
          }
        }

        // Expand TSP sequence back into work orders preserving physical location batching
        orderedWorkOrders = [];
        const locHopMetrics: Array<{ travelMins: number; distKm: number }> = [];

        for (let k = 1; k < sequenceIndices.length; k++) {
          const prevIdx = sequenceIndices[k - 1];
          const currIdx = sequenceIndices[k];

          const hopTimeMins = matrixRes.durationsMins[prevIdx][currIdx] || 0;
          const hopDistKm = matrixRes.distancesKm[prevIdx][currIdx] || 0;

          const groupKey = locations[currIdx].locationGroup!;
          const groupWos = locationGroupsMap.get(groupKey) || [];

          groupWos.forEach((wo, subIdx) => {
            orderedWorkOrders.push(wo);
            locHopMetrics.push({
              travelMins: subIdx === 0 ? hopTimeMins : 0, // Travel time applies when moving between physical locations
              distKm: subIdx === 0 ? hopDistKm : 0,
            });
          });
        }

        // Calculate arrival ETAs starting from start_time (default 08:00)
        let currentMinsFromMidnight = parseTimeToMins(start_time);

        for (let i = 0; i < orderedWorkOrders.length; i++) {
          const { travelMins, distKm } = locHopMetrics[i];

          currentMinsFromMidnight += travelMins;
          const arrTimeStr = minsToTimeString(currentMinsFromMidnight);

          const wo = orderedWorkOrders[i];
          const workMins = wo.estimated_duration_mins || 60;
          currentMinsFromMidnight += workMins;

          totalTravelMins += travelMins;
          totalDistanceKm += distKm;
          totalWorkMins += workMins;

          stopMetrics.push({
            travel_time_mins: travelMins,
            distance_km: distKm,
            estimated_arrival: arrTimeStr,
          });
        }
      }
    }

    // Fallback if matrix result is empty
    if (stopMetrics.length === 0) {
      orderedWorkOrders = [...workOrders];
      stopMetrics = orderedWorkOrders.map(() => ({
        travel_time_mins: 0,
        distance_km: 0,
        estimated_arrival: null,
      }));
    }

    // 4. Feasibility Validation (Shift capacity e.g. 540 mins / 9h max work + travel)
    const totalShiftMins = totalTravelMins + totalWorkMins;
    const MAX_SHIFT_MINS = 540;
    const isFeasible = totalShiftMins <= MAX_SHIFT_MINS;
    const feasibilityNotes = isFeasible
      ? "Within standard working shift limits"
      : `Exceeds max shift limit by ${totalShiftMins - MAX_SHIFT_MINS} minutes (Total: ${Math.round(totalShiftMins / 60)}h ${totalShiftMins % 60}m)`;

    // 5. Upsert `daily_routes` record
    const routePayload = {
      org_id,
      technician_id,
      date,
      status: "optimized" as const,
      start_location_lat: techProfile?.base_latitude || null,
      start_location_lng: techProfile?.base_longitude || null,
      total_distance_km: totalDistanceKm,
      total_travel_mins: totalTravelMins,
    };

    const { data: routeRow, error: routeErr } = await sb
      .from("daily_routes")
      .upsert(routePayload, { onConflict: "technician_id,date" })
      .select()
      .single();

    if (routeErr || !routeRow) {
      return NextResponse.json(
        { error: routeErr?.message || "Failed to create daily route" },
        { status: 500 }
      );
    }

    // 6. Replace `route_stops`
    await sb.from("route_stops").delete().eq("route_id", routeRow.id);

    const stopsPayload = orderedWorkOrders.map((wo, index) => ({
      route_id: routeRow.id,
      work_order_id: wo.id,
      sequence_order: index + 1,
      estimated_arrival: stopMetrics[index]?.estimated_arrival || null,
      travel_time_mins: stopMetrics[index]?.travel_time_mins || 0,
      distance_km: stopMetrics[index]?.distance_km || 0,
    }));

    const { data: insertedStops, error: stopsErr } = await sb
      .from("route_stops")
      .insert(stopsPayload)
      .select();

    if (stopsErr) {
      return NextResponse.json(
        { error: stopsErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      route: routeRow,
      stops: insertedStops,
      isRoadRouting,
      providerName,
      hasTechBase,
      isFeasible,
      feasibilityNotes,
      totalWorkMins,
      totalShiftMins,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error during route optimization" },
      { status: 500 }
    );
  }
}

function parseTimeToMins(timeStr: string): number {
  try {
    const [h, m] = timeStr.split(":").map(Number);
    return (h || 8) * 60 + (m || 0);
  } catch {
    return 8 * 60;
  }
}

function minsToTimeString(totalMins: number): string {
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
