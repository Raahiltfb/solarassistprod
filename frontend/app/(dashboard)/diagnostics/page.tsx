import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { StringAnomalyDiagnosticSection } from "@/components/string-anomaly-diagnostic-section";
import { StringAnalyticsSection } from "@/components/string-analytics-section";
import { MultiInverterDiagnosticSection } from "@/components/multi-inverter-diagnostic-section";
import { MeterComparisonSection } from "@/components/meter-comparison-section";
import { Activity, Zap, Cpu, BarChart3, AlertTriangle, Layers } from "lucide-react";
import Link from "next/link";

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

  // 2. Fetch site inverters, strings, telemetry, and meter readings in parallel
  const [invertersRes, telemetryRes, meterReadingsRes] = await Promise.all([
    sb.from("inverters").select("*").eq("site_id", selectedSite.id),
    sb.from("telemetry").select("*").order("timestamp", { ascending: false }).limit(500),
    sb.from("meter_readings").select("*").eq("site_id", selectedSite.id).order("reading_timestamp", { ascending: false })
  ]);

  const inverters = invertersRes.data ?? [];
  const telemetry = telemetryRes.data ?? [];
  const meterReadings = meterReadingsRes.data ?? [];

  const inverterIds = inverters.map((i) => i.id);

  // 3. Fetch strings and string telemetry for site inverters
  let strings: any[] = [];
  let stringTelemetry: any[] = [];

  if (inverterIds.length > 0) {
    const { data: strData } = await sb
      .from("strings")
      .select("*")
      .in("inverter_id", inverterIds)
      .order("string_index");

    strings = strData ?? [];
    const stringIds = strings.map((s) => s.id);

    if (stringIds.length > 0) {
      const { data: stData } = await sb
        .from("string_telemetry")
        .select("*")
        .in("string_id", stringIds)
        .order("timestamp", { ascending: false })
        .limit(1000);

      stringTelemetry = stData ?? [];
    }
  }

  // Map latest telemetry per inverter ID
  const latestTelemetryMap = new Map<string, any>();
  for (const tel of telemetry) {
    if (!latestTelemetryMap.has(tel.inverter_id)) {
      latestTelemetryMap.set(tel.inverter_id, tel);
    }
  }

  return (
    <div className="space-y-6" data-testid="technical-intelligence-page">
      {/* Top Header & Site Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider mb-1">
            <Cpu className="h-4 w-4 text-primary" />
            <span>Technical Intelligence & Electrical Diagnostics</span>
          </div>
          <h1 className="text-2xl font-bold font-display tracking-tight text-foreground">
            Technical Intelligence Control Hub
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Automated string anomaly detection, multi-string overlays, inverter yield matrix, and utility meter loss comparison.
          </p>
        </div>

        {/* Site Picker Dropdown Links */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-semibold">Active Site:</span>
          <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-lg border">
            {siteList.map((s) => (
              <Link key={s.id} href={`/diagnostics?site_id=${s.id}`}>
                <Button
                  size="sm"
                  variant={s.id === selectedSite.id ? "default" : "ghost"}
                  className="h-7 text-xs px-2.5 font-medium"
                >
                  {s.name}
                </Button>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Main Technical Diagnostics Tabs */}
      <Tabs defaultValue="anomalies">
        <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1 p-1 bg-muted rounded-lg">
          <TabsTrigger value="anomalies" className="text-xs gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>String Anomaly Detection</span>
          </TabsTrigger>
          <TabsTrigger value="multi-string" className="text-xs gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            <span>Multi-String Overlay Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="multi-inverter" className="text-xs gap-1.5">
            <Cpu className="h-3.5 w-3.5" />
            <span>Multi-Inverter Diagnostic Comparison ({inverters.length})</span>
          </TabsTrigger>
          <TabsTrigger value="meter-loss" className="text-xs gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            <span>Utility Meter vs Inverter Energy Loss</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: String Anomaly Detection & Field Dispatch */}
        <TabsContent value="anomalies" className="pt-4">
          <StringAnomalyDiagnosticSection
            telemetry={stringTelemetry}
            strings={strings}
            inverters={inverters}
            sites={siteList}
          />
        </TabsContent>

        {/* Tab 2: Historical Multi-String Analytics */}
        <TabsContent value="multi-string" className="pt-4">
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <span>Multi-String Telemetry Overlay & Comparative Trends</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <StringAnalyticsSection inverters={inverters} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Multi-Inverter Diagnostic Comparison */}
        <TabsContent value="multi-inverter" className="pt-4">
          <MultiInverterDiagnosticSection
            inverters={inverters}
            latestTelemetryMap={latestTelemetryMap}
          />
        </TabsContent>

        {/* Tab 4: Utility Meter vs Inverter Loss Comparison */}
        <TabsContent value="meter-loss" className="pt-4">
          <MeterComparisonSection
            site={selectedSite}
            telemetry={telemetry}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
