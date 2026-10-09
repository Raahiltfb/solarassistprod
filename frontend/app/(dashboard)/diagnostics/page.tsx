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

  // 1. Fetch user org and sites
  const { data: profile } = await sb.from("profiles").select("org_id, role").single();

  let sitesQuery = sb.from("sites").select("*").order("name");
  if (profile?.org_id && profile.role !== "super_admin") {
    sitesQuery = sitesQuery.eq("org_id", profile.org_id);
  }
  const { data: sites } = await sitesQuery;

  const siteList = sites ?? [];
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

  // 2. Fetch all org site inverters, tickets, and telemetry in parallel
  const [invertersRes, ticketsRes, telemetryRes] = await Promise.all([
    sb.from("inverters").select("*").in("site_id", siteIds),
    sb.from("tickets").select("*").in("site_id", siteIds).eq("status", "resolved"),
    sb.from("telemetry").select("*").order("timestamp", { ascending: false }).limit(500)
  ]);

  const allInverters = invertersRes.data ?? [];
  const allResolvedTickets = ticketsRes.data ?? [];
  const allTelemetry = telemetryRes.data ?? [];
  const inverterIds = allInverters.map((i) => i.id);

  // 3. Fetch strings and string_telemetry for all org inverters
  let allStrings: any[] = [];
  let allStringTelemetry: any[] = [];

  if (inverterIds.length > 0) {
    const [strData, stData] = await Promise.all([
      sb.from("strings").select("*").in("inverter_id", inverterIds).order("string_index"),
      sb.from("string_telemetry").select("*").order("timestamp", { ascending: false }).limit(1000)
    ]);

    allStrings = strData.data ?? [];
    allStringTelemetry = stData.data ?? [];
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
