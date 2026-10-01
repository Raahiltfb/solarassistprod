export interface LocationPoint {
  id: string;
  lat: number;
  lng: number;
  locationGroup?: string;
}

export interface RoutingMatrixResult {
  isRoadRouting: boolean;
  durationsMins: number[][]; // Duration matrix in minutes
  distancesKm: number[][];   // Distance matrix in km
  providerName: string;
}

export interface RoutingProvider {
  getMatrix(points: LocationPoint[]): Promise<RoutingMatrixResult>;
}

// In-memory server-side matrix cache
const matrixCache = new Map<string, RoutingMatrixResult>();

function buildCacheKey(points: LocationPoint[], providerName: string): string {
  const coords = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|");
  return `${providerName}:${coords}`;
}

export class OSRMProvider implements RoutingProvider {
  private baseUrl: string;

  constructor(baseUrl = "https://router.project-osrm.org") {
    this.baseUrl = baseUrl;
  }

  async getMatrix(points: LocationPoint[]): Promise<RoutingMatrixResult> {
    if (!points || points.length < 2) {
      return {
        isRoadRouting: true,
        durationsMins: [],
        distancesKm: [],
        providerName: "OSRM Server-Side",
      };
    }

    const cacheKey = buildCacheKey(points, "OSRM");
    if (matrixCache.has(cacheKey)) {
      return matrixCache.get(cacheKey)!;
    }

    try {
      // OSRM format: lon,lat;lon,lat;lon,lat
      const coordStr = points.map((p) => `${p.lng},${p.lat}`).join(";");
      const url = `${this.baseUrl}/table/v1/driving/${coordStr}?annotations=duration,distance`;

      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(4000),
      });

      if (!res.ok) {
        console.warn(`[OSRMProvider] HTTP error ${res.status}`);
        return {
          isRoadRouting: false,
          durationsMins: [],
          distancesKm: [],
          providerName: "OSRM (Failed / Unavailable)",
        };
      }

      const data = await res.json();

      if (data.code !== "Ok" || !data.durations || !data.distances) {
        console.warn(`[OSRMProvider] Invalid OSRM response code: ${data.code}`);
        return {
          isRoadRouting: false,
          durationsMins: [],
          distancesKm: [],
          providerName: "OSRM (Invalid Response)",
        };
      }

      const durationsMins: number[][] = data.durations.map((row: number[]) =>
        row.map((dSec: number) => Math.max(1, Math.round((dSec || 0) / 60)))
      );

      const distancesKm: number[][] = data.distances.map((row: number[]) =>
        row.map((dMeters: number) =>
          Math.round(((dMeters || 0) / 1000) * 10) / 10
        )
      );

      const result: RoutingMatrixResult = {
        isRoadRouting: true,
        durationsMins,
        distancesKm,
        providerName: "OSRM Road Network",
      };

      matrixCache.set(cacheKey, result);
      return result;
    } catch (err: any) {
      console.warn(`[OSRMProvider] Network/fetch error:`, err?.message || err);
      return {
        isRoadRouting: false,
        durationsMins: [],
        distancesKm: [],
        providerName: "OSRM (Network Error)",
      };
    }
  }
}

/**
 * Realistic Fallback Provider using Haversine distance with 1.35x road winding factor
 * and 35 km/h average speed in urban/suburban solar plant corridors.
 */
export class FallbackHaversineProvider implements RoutingProvider {
  async getMatrix(points: LocationPoint[]): Promise<RoutingMatrixResult> {
    const n = points.length;
    const durationsMins: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    const distancesKm: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

    const R = 6371; // Earth radius in km
    const ROAD_FACTOR = 1.35; // 35% road network curvature multiplier
    const AVG_SPEED_KMH = 35; // 35 km/h average traffic speed

    for (let i = 0; i < n; i++) {
      for (let j = 0; i !== j && j < n; j++) {
        const p1 = points[i];
        const p2 = points[j];

        const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
        const dLon = ((p2.lng - p1.lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((p1.lat * Math.PI) / 180) *
            Math.cos((p2.lat * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const straightKm = R * c;

        // Apply road winding factor
        const roadKm = Math.round(straightKm * ROAD_FACTOR * 10) / 10;
        // Travel duration in minutes (plus 3 mins base traffic/stop buffer per hop)
        const travelMins = Math.max(1, Math.round((roadKm / AVG_SPEED_KMH) * 60) + (roadKm > 0 ? 3 : 0));

        distancesKm[i][j] = roadKm;
        durationsMins[i][j] = travelMins;
      }
    }

    return {
      isRoadRouting: true,
      durationsMins,
      distancesKm,
      providerName: "Road Speed Estimation (Fallback)",
    };
  }
}

/**
 * Composite Provider: Tries OSRM first; if OSRM is unavailable, automatically
 * falls back to FallbackHaversineProvider so route generation never breaks.
 */
export class CompositeRoutingProvider implements RoutingProvider {
  private osrm = new OSRMProvider();
  private fallback = new FallbackHaversineProvider();

  async getMatrix(points: LocationPoint[]): Promise<RoutingMatrixResult> {
    const osrmResult = await this.osrm.getMatrix(points);
    if (osrmResult.isRoadRouting && osrmResult.durationsMins.length > 0) {
      return osrmResult;
    }
    console.info("[CompositeRoutingProvider] OSRM unavailable. Engaging Haversine Road Factor fallback.");
    return await this.fallback.getMatrix(points);
  }
}

