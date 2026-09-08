import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Zap, AlertTriangle } from "lucide-react";
import { getSiteStatus } from "@/lib/status-utils";
import { formatDateTime } from "@/lib/utils";
import { SitesConfigurationTable } from "@/components/sites/sites-configuration-table";

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

  return (
    <div className="space-y-6" data-testid="sites-page">
      <div>
        <h1 className="text-3xl font-display font-semibold">Sites</h1>
        <p className="text-sm text-muted-foreground mt-1">All installations under your organisation.</p>
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
          <SitesConfigurationTable sites={sites} rules={rules} />
        </TabsContent>

        <TabsContent value="grid">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sites.map((s) => {
          const siteInvs = siteInverters.get(s.id) ?? [];
          const siteAlts = siteAlerts.get(s.id) ?? [];
          const invertersCount = siteInvs.length;
          const alertsCount = siteAlts.length;

          let currentPower = 0;
          let todayGeneration = 0;
          let totalGeneration = 0;
          let lastUpdated: Date | null = null;

          for (const inv of siteInvs) {
            const tel = latestTelemetryMap.get(inv.id);
            if (tel) {
              currentPower += Number(tel.ac_power_kw || 0);
              todayGeneration += Number(tel.daily_generation_kwh || 0);
              totalGeneration += Number(tel.total_generation_kwh || 0);
              
              const updateTime = tel.last_update || tel.timestamp;
              if (updateTime) {
                const dt = new Date(updateTime);
                if (!lastUpdated || dt > lastUpdated) {
                  lastUpdated = dt;
                }
              }
            }
          }

          return (
            <Card key={s.id} className="overflow-hidden hover:shadow-md transition-shadow" data-testid={`site-card-${s.id}`}>
              <CardHeader className="pb-3 border-b flex flex-row items-start justify-between gap-4">
                <div>
                  <Link href={`/sites/${s.id}`} className="font-semibold text-lg hover:text-primary transition-colors line-clamp-1">
                    {s.name}
                  </Link>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="h-3.5 w-3.5" /> {s.location}
                  </p>
                </div>
                {(() => {
                  const latestTelemetryTimestampMap = new Map<string, string>();
                  for (const inv of siteInvs) {
                    const tel = latestTelemetryMap.get(inv.id);
                    if (tel?.timestamp) {
                      latestTelemetryTimestampMap.set(inv.id, tel.timestamp);
                    }
                  }
                  const siteStatus = getSiteStatus(siteInvs, latestTelemetryTimestampMap);
                  return (
                    <Badge variant={siteStatus === "ONLINE" ? "success" : siteStatus === "PARTIALLY ONLINE" ? "warning" : "destructive"} className="capitalize shrink-0">
                      {siteStatus.toLowerCase()}
                    </Badge>
                  );
                })()}
              </CardHeader>
              <CardContent className="pt-4 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <div className="text-muted-foreground text-xs">Capacity</div>
                    <div className="font-semibold font-mono">{Number(s.capacity_kwp).toLocaleString()} kWp</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Current Power</div>
                    <div className="font-semibold font-mono">{currentPower.toFixed(2)} kW</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Today's Generation</div>
                    <div className="font-semibold font-mono">{todayGeneration.toFixed(1)} kWh</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Total Generation</div>
                    <div className="font-semibold font-mono">
                      {totalGeneration.toLocaleString(undefined, { maximumFractionDigits: 0 })} kWh
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Inverters</div>
                    <div className="font-semibold font-mono">{invertersCount} units</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Active Alerts</div>
                    <div className="font-semibold">
                      {alertsCount > 0 ? (
                        <span className="text-destructive font-mono font-semibold flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5" /> {alertsCount} active
                        </span>
                      ) : (
                        <span className="text-success font-mono font-semibold">0</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground border-t pt-3 flex justify-between items-center">
                  <span>Last Updated:</span>
                  <span className="font-mono font-medium">{lastUpdated ? formatDateTime(lastUpdated.toISOString()) : "—"}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {sites.length === 0 && (
          <div className="col-span-full text-center py-10 text-muted-foreground">
            No sites found under your organisation.
          </div>
        )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
