import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Zap, AlertTriangle } from "lucide-react";
import { getSiteStatus } from "@/lib/status-utils";
import { formatDateTime } from "@/lib/utils";
import { SitesConfigurationTable } from "@/components/sites/sites-configuration-table";
import { FleetTelemetryCards } from "@/components/sites/fleet-telemetry-cards";
import { SubNav } from "@/components/sub-nav";

export default async function SitesPage() {
  const sb = await createClient();

  const [sitesRes, invertersRes, alertsRes, rulesRes] = await Promise.all([
    sb.from("sites").select("*").order("name"),
    sb.from("inverters").select("id, status, site_id, capacity_kw, last_seen_at"),
    sb.from("alerts").select("id, site_id").eq("status", "open"),
    sb.from("site_cleaning_rules").select("*"),
  ]);

  const sites = sitesRes.data ?? [];
  const inverters = invertersRes.data ?? [];
  const alerts = alertsRes.data ?? [];
  const rules = rulesRes.data ?? [];

  const inverterIds = inverters.map((inv) => inv.id);

  // Group latest telemetry by inverter_id
  const latestTelemetryMap = new Map<string, any>();
  if (inverterIds.length > 0) {
    const { data: latestTels } = await sb.rpc("get_latest_telemetry", { inverter_ids: inverterIds });
    for (const t of latestTels ?? []) {
      latestTelemetryMap.set(t.inverter_id, t);
    }
  }

  // Group inverters by site
  const siteInverters = new Map<string, any[]>();
  for (const inv of inverters) {
    const list = siteInverters.get(inv.site_id) ?? [];
    list.push(inv);
    siteInverters.set(inv.site_id, list);
  }

  // Group alerts by site
  const siteAlerts = new Map<string, any[]>();
  for (const alert of alerts) {
    const list = siteAlerts.get(alert.site_id) ?? [];
    list.push(alert);
    siteAlerts.set(alert.site_id, list);
  }

  // Prepare enriched site card data for both tabs
  const siteStatusMap: Record<string, "ONLINE" | "PARTIALLY ONLINE" | "OFFLINE"> = {};
  const siteAlertsMap: Record<string, number> = {};
  const siteCardDataList = sites.map((s) => {
    const siteInvs = siteInverters.get(s.id) ?? [];
    const siteAlts = siteAlerts.get(s.id) ?? [];
    const invertersCount = siteInvs.length;
    const alertsCount = siteAlts.length;

    let currentPower = 0;
    let todayGeneration = 0;
    let totalGeneration = 0;
    let lastUpdated: Date | null = null;

    const latestTelemetryTimestampMap = new Map<string, string>();
    for (const inv of siteInvs) {
      const tel = latestTelemetryMap.get(inv.id);
      if (tel) {
        currentPower += Number(tel.ac_power_kw || 0);
        todayGeneration += Number(tel.daily_generation_kwh || 0);
        totalGeneration += Number(tel.total_generation_kwh || 0);

        if (tel.timestamp) {
          latestTelemetryTimestampMap.set(inv.id, tel.timestamp);
        }

        const updateTime = tel.last_update || tel.timestamp;
        if (updateTime) {
          const dt = new Date(updateTime);
          if (!lastUpdated || dt > lastUpdated) {
            lastUpdated = dt;
          }
        }
      }
    }

    const siteStatus = getSiteStatus(siteInvs, latestTelemetryTimestampMap);
    siteStatusMap[s.id] = siteStatus;
    siteAlertsMap[s.id] = alertsCount;

    return {
      id: s.id,
      name: s.name,
      location: s.location,
      capacity_kwp: Number(s.capacity_kwp || 0),
      siteStatus,
      alertsCount,
      invertersCount,
      currentPower,
      todayGeneration,
      totalGeneration,
      lastUpdated: lastUpdated ? lastUpdated.toISOString() : null,
    };
  });

  return (
    <div className="space-y-6" data-testid="sites-page">
      <SubNav hub="assets" />
      <div>
        <h1 className="text-3xl font-display font-semibold">Fleet Assets & Solar Sites</h1>
        <p className="text-sm text-muted-foreground mt-1">Solar installations, capacity specs, and technical asset configurations.</p>
      </div>

      <Tabs defaultValue="table" className="space-y-6">
        <TabsList className="bg-muted p-1">
          <TabsTrigger value="table" className="text-xs font-semibold px-4">
            Operational Cleaning Configuration ({sites.length})
          </TabsTrigger>
          <TabsTrigger value="grid" className="text-xs font-semibold px-4">
            Fleet Telemetry Cards ({sites.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="table">
          <SitesConfigurationTable
            sites={sites}
            rules={rules}
            siteStatusMap={siteStatusMap}
            siteAlertsMap={siteAlertsMap}
          />
        </TabsContent>

        <TabsContent value="grid">
          <FleetTelemetryCards sites={siteCardDataList} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
