import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { OSRMProvider, LocationPoint } from "@/lib/routing/provider";

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

    // 2. Fetch Technician Profile for Base Location
    const { data: techProfile } = await sb
      .from("profiles")
      .select("id, full_name, email, base_latitude, base_longitude")
      .eq("id", technician_id)
      .single();

    // 3. Fetch Scheduled Work Orders for Technician & Date
    const { data: workOrders } = await sb
      .from("work_orders")
      .select("*, sites(id, name, location, latitude, longitude)")
      .eq("technician_id", technician_id)
      .eq("scheduled_date", date)
      .eq("org_id", org_id)
      .in("status", ["scheduled", "en_route", "in_progress", "draft"])
      .order("created_at", { ascending: true });

    if (!workOrders || workOrders.length === 0) {
      return NextResponse.json({
        message: "No scheduled work orders found for this technician on this date.",
        route: null,
        stops: [],
      });
    }

    const hasTechBase =
      Boolean(techProfile?.base_latitude) && Boolean(techProfile?.base_longitude);

    const locations: LocationPoint[] = [];

    if (hasTechBase && techProfile?.base_latitude && techProfile?.base_longitude) {
      locations.push({
        id: "START_BASE",
        lat: techProfile.base_latitude,
        lng: techProfile.base_longitude,
      });
    }

    workOrders.forEach((wo) => {
      if (wo.sites?.latitude && wo.sites?.longitude) {
        locations.push({
          id: wo.id,
          lat: Number(wo.sites.latitude),
          lng: Number(wo.sites.longitude),
        });
      }
    });

    let isRoadRouting = false;
    let orderedWorkOrders = [...workOrders];
    let stopMetrics: Array<{
      travel_time_mins: number;
      distance_km: number;
      estimated_arrival: string | null;
    }> = [];
    let totalTravelMins = 0;
    let totalDistanceKm = 0;

    // Run OSRM Optimization if Technician has Base Location AND sites have coordinates
    if (hasTechBase && locations.length >= 2) {
      const osrm = new OSRMProvider();
      const matrixRes = await osrm.getMatrix(locations);

      if (matrixRes.isRoadRouting && matrixRes.durationsMins.length > 0) {
        isRoadRouting = true;
        const n = locations.length;
        const visited = new Array(n).fill(false);
        visited[0] = true; // Start at base

        const sequenceIndices: number[] = [0];
        let current = 0;

        // Nearest Neighbor TSP solver
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

        // Reorder work orders according to TSP sequence
        orderedWorkOrders = [];
        for (let k = 1; k < sequenceIndices.length; k++) {
          const locIdx = sequenceIndices[k];
          const woId = locations[locIdx].id;
          const matchedWO = workOrders.find((w) => w.id === woId);
          if (matchedWO) {
            orderedWorkOrders.push(matchedWO);
          }
        }

        // Calculate arrival times & hop metrics starting from start_time (e.g. 08:00)
        let currentMinsFromMidnight = parseTimeToMins(start_time);

        for (let i = 0; i < orderedWorkOrders.length; i++) {
          const prevLocIdx = sequenceIndices[i];
          const currLocIdx = sequenceIndices[i + 1];

          const hopTimeMins = matrixRes.durationsMins[prevLocIdx][currLocIdx] || 0;
          const hopDistKm = matrixRes.distancesKm[prevLocIdx][currLocIdx] || 0;

          currentMinsFromMidnight += hopTimeMins;
          const arrTimeStr = minsToTimeString(currentMinsFromMidnight);

          const wo = orderedWorkOrders[i];
          const workMins = wo.estimated_duration_mins || 60;
          currentMinsFromMidnight += workMins;

          totalTravelMins += hopTimeMins;
          totalDistanceKm += hopDistKm;

          stopMetrics.push({
            travel_time_mins: hopTimeMins,
            distance_km: hopDistKm,
            estimated_arrival: arrTimeStr,
          });
        }
      }
    }

    // Fallback metrics if OSRM failed or base location missing
    if (!isRoadRouting) {
      stopMetrics = orderedWorkOrders.map(() => ({
        travel_time_mins: 0,
        distance_km: 0,
        estimated_arrival: null,
      }));
    }

    // 4. Upsert `daily_routes` record
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

    // 5. Replace `route_stops`
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
      hasTechBase,
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
