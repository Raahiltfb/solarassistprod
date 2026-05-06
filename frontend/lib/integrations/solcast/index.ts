// SolCast irradiance + power forecast benchmark adapter.
// Docs: https://docs.solcast.com.au/

const API_URL = "https://api.solcast.com.au";
const API_KEY = process.env.SOLCAST_API_KEY || "";

export interface SolcastForecast {
  pv_power_rooftop_kw: number;  // estimated PV output for capacity
  ghi: number;                  // global horizontal irradiance W/m^2
  dni: number;                  // direct normal irradiance W/m^2
  air_temp: number;
  period_end: string;
}

export async function getRadiationForecast(lat: number, lon: number, capacityKw: number): Promise<SolcastForecast[]> {
  if (!API_KEY) return [];
  const url = `${API_URL}/data/forecast/radiation_and_weather?latitude=${lat}&longitude=${lon}&output_parameters=ghi,dni,air_temp&hours=24&format=json&api_key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { forecasts?: Array<Record<string, unknown>> };
  return (data.forecasts ?? []).map((f) => {
    const ghi = Number(f.ghi ?? 0);
    return {
      pv_power_rooftop_kw: Math.max(0, (ghi / 1000) * capacityKw * 0.85),
      ghi,
      dni: Number(f.dni ?? 0),
      air_temp: Number(f.air_temp ?? 25),
      period_end: String(f.period_end ?? new Date().toISOString()),
    };
  });
}

// Rough expected daily generation for a site, in kWh.
export function expectedDailyGeneration(capacityKw: number, latitude: number): number {
  // PSH (peak sun hours) by latitude band — a quick heuristic for offline mode.
  const absLat = Math.abs(latitude);
  let psh = 5.0;
  if (absLat < 15) psh = 5.5;
  else if (absLat < 30) psh = 5.2;
  else if (absLat < 45) psh = 4.5;
  else psh = 3.8;
  return capacityKw * psh * 0.78; // PR ~ 0.78
}
