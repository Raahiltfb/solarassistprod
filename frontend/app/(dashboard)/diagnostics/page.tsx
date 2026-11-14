import { createClient } from "@/lib/supabase/server";
import { DiagnosticsClientWrapper } from "@/components/diagnostics-client-wrapper";
import { analyzeStringAnomalies } from "@/lib/string-anomaly-engine";

export const revalidate = 0;

export default async function TechnicalIntelligencePage({
  searchParams
}: {
  searchParams: Promise<{ site_id?: string; tab?: string }>
}) {
  const { site_id, tab } = await searchParams;
  const sb = await createClient();

  // 1. Fetch user org and sites in parallel
  const [profileRes, sitesRes] = await Promise.all([
    sb.from("profiles").select("org_id, role").single(),
    sb.from("sites").select("*").order("name"),
  ]);

  const profile = profileRes.data;
  let siteList = sitesRes.data ?? [];
  if (profile?.org_id && profile.role !== "super_admin") {
    siteList = siteList.filter((s) => s.org_id === profile.org_id);
  }
  // Exclude cleaning-only sites from technical telemetry and string diagnostics
  siteList = siteList.filter((s) => s.service_tier !== "cleaning_only");

  const selectedSite = siteList.find((s) => s.id === site_id) || siteList[0] || null;

  if (!selectedSite) {
    return (
      <div className="p-8 text-center space-y-4">
        <h2 className="text-xl font-bold">No Sites Configured</h2>
        <p className="text-muted-foreground text-xs">Please add a site before viewing Technical Intelligence diagnostics.</p>
      </div>
    );
  }

  const siteIds = siteList.map((s) => s.id);
  const CHUNK_SIZE = 50;

  // Safe chunked query helper for large site lists
  async function fetchChunkedIn<T>(table: string, column: string, ids: string[], select = "*", applyFilter?: (q: any) => any): Promise<T[]> {
    if (ids.length === 0) return [];
    if (ids.length <= CHUNK_SIZE) {
      let q = sb.from(table).select(select).in(column, ids);
      if (applyFilter) q = applyFilter(q);
      const { data } = await q;
      return (data ?? []) as T[];
    }
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      chunks.push(ids.slice(i, i + CHUNK_SIZE));
    }
    const chunkResults = await Promise.all(
      chunks.map(async (c) => {
        let q = sb.from(table).select(select).in(column, c);
        if (applyFilter) q = applyFilter(q);
        const { data } = await q;
        return (data ?? []) as T[];
      })
    );
    return chunkResults.flat();
  }

  // 2. Fetch inverters, tickets, active alerts, telemetry, and fleet-wide string telemetry in parallel with safe chunking
  const [allInverters, allResolvedTickets, activeAlerts, telemetryRes, fleetStringTelemetryRes] = await Promise.all([
    fetchChunkedIn<any>("inverters", "site_id", siteIds),
    fetchChunkedIn<any>("tickets", "site_id", siteIds, "*", (q) => q.eq("status", "resolved").order("created_at", { ascending: false }).limit(100)),
    fetchChunkedIn<any>("alerts", "site_id", siteIds, "*, inverters(serial_number)", (q) => q.in("status", ["open", "acknowledged"]).order("triggered_at", { ascending: false })),
    sb.from("telemetry").select("*").order("timestamp", { ascending: false }).limit(500),
    sb.from("string_telemetry").select("string_id, timestamp, voltage_v, current_a, power_kw, status").order("timestamp", { ascending: false }).limit(3000),
  ]);

  const allInverterIds = allInverters.map((i) => i.id);
  const [allStrings, latestTelemetryRes] = await Promise.all([
    fetchChunkedIn<any>(
      "strings", 
      "inverter_id", 
      allInverterIds, 
      "id, inverter_id, string_index, capacity_kw, status"
    ),
    allInverterIds.length > 0
      ? sb.rpc("get_latest_telemetry", { inverter_ids: allInverterIds })
      : Promise.resolve({ data: [] }),
  ]);
  const allTelemetry = telemetryRes.data ?? [];
  const fleetStringTelemetry = fleetStringTelemetryRes.data ?? [];

  // 3. Fetch targeted string telemetry for the active site's strings
  let activeSiteStringTelemetry: any[] = [];
  const activeSiteInverterIds = allInverters
    .filter((i) => i.site_id === selectedSite.id)
    .map((i) => i.id);

  const activeSiteStringIds = allStrings
    .filter((s) => activeSiteInverterIds.includes(s.inverter_id))
    .map((s) => s.id);

  if (activeSiteStringIds.length > 0) {
    const { data: stData } = await sb
      .from("string_telemetry")
      .select("string_id, timestamp, voltage_v, current_a, power_kw, status")
      .in("string_id", activeSiteStringIds)
      .order("timestamp", { ascending: false })
      .limit(1500);

    activeSiteStringTelemetry = stData ?? [];
  }

  // Merge fleet string telemetry and active site string telemetry (dedup by string_id + timestamp)
  const telMap = new Map<string, any>();
  for (const st of fleetStringTelemetry) {
    telMap.set(`${st.string_id}_${st.timestamp}`, st);
  }
  for (const st of activeSiteStringTelemetry) {
    telMap.set(`${st.string_id}_${st.timestamp}`, st);
  }
  const allStringTelemetry = Array.from(telMap.values());

  return (
    <DiagnosticsClientWrapper
      sites={siteList}
      initialSiteId={site_id || siteList[0]?.id}
      initialPrimaryTab={tab === "site" || (Boolean(site_id) && tab !== "fleet") ? "site" : "fleet"}
      allInverters={allInverters}
      allStrings={allStrings}
      allTelemetry={allTelemetry}
      allStringTelemetry={allStringTelemetry}
      allResolvedTickets={allResolvedTickets}
      activeAlerts={activeAlerts ?? []}
      latestTelemetryRecords={latestTelemetryRes.data ?? []}
    />
  );
}
