export interface LocationPoint {
  id: string;
  lat: number;
  lng: number;
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

    try {
      // OSRM format: lon,lat;lon,lat;lon,lat
      const coordStr = points.map((p) => `${p.lng},${p.lat}`).join(";");
      const url = `${this.baseUrl}/table/v1/driving/${coordStr}?annotations=duration,distance`;

      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        // Set short timeout to avoid hanging if public server is down
        signal: AbortSignal.timeout(5000),
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

      // Convert durations (sec -> mins) and distances (m -> km)
      const durationsMins: number[][] = data.durations.map((row: number[]) =>
        row.map((dSec: number) => Math.round((dSec || 0) / 60))
      );

      const distancesKm: number[][] = data.distances.map((row: number[]) =>
        row.map((dMeters: number) =>
          Math.round(((dMeters || 0) / 1000) * 10) / 10
        )
      );

      return {
        isRoadRouting: true,
        durationsMins,
        distancesKm,
        providerName: "OSRM Road Network",
      };
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
