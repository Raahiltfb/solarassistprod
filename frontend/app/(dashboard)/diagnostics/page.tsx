import { createClient } from "@/lib/supabase/server";
import { DiagnosticsClientWrapper } from "@/components/diagnostics-client-wrapper";
import { analyzeStringAnomalies } from "@/lib/string-anomaly-engine";

export const revalidate = 0;

export default async function TechnicalIntelligencePage({
  searchParams
}: {
  searchParams: Promise<{ site_id?: string }>
}) {
  const { site_id } = await searchParams;
  const sb = await createClient();

  // 1. Fetch user org, sites, and string metadata in parallel
  const [profileRes, sitesRes, stringsRes] = await Promise.all([
    sb.from("profiles").select("org_id, role").single(),
    sb.from("sites").select("*").order("name"),
    sb.from("strings").select("id, inverter_id, string_index, capacity_kw, status").order("string_index"),
  ]);

  const profile = profileRes.data;
  let siteList = sitesRes.data ?? [];
  if (profile?.org_id && profile.role !== "super_admin") {
    siteList = siteList.filter((s) => s.org_id === profile.org_id);
  }

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
  const allStrings = stringsRes.data ?? [];

  // 2. Fetch inverters, tickets, and telemetry in parallel
  const [invertersRes, ticketsRes, telemetryRes] = await Promise.all([
    sb.from("inverters").select("*").in("site_id", siteIds),
    sb.from("tickets").select("*").in("site_id", siteIds).eq("status", "resolved"),
    sb.from("telemetry").select("*").order("timestamp", { ascending: false }).limit(500),
  ]);

  const allInverters = invertersRes.data ?? [];
  const allResolvedTickets = ticketsRes.data ?? [];
  const allTelemetry = telemetryRes.data ?? [];

  // 3. Fetch targeted string telemetry for the active site's strings
  let allStringTelemetry: any[] = [];
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

    allStringTelemetry = stData ?? [];
  }

  return (
    <DiagnosticsClientWrapper
      sites={siteList}
      initialSiteId={site_id || siteList[0]?.id}
      allInverters={allInverters}
      allStrings={allStrings}
      allTelemetry={allTelemetry}
      allStringTelemetry={allStringTelemetry}
      allResolvedTickets={allResolvedTickets}
    />
  );
}
