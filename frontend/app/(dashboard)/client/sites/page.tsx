import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, ArrowUpRight, Building2, Zap, ShieldCheck, Sun, Activity, Info, Coins } from "lucide-react";
import { getSiteStatus } from "@/lib/status-utils";
import { calculateFinancialSavings } from "@/lib/client-sanitizer";

export default async function ClientSitesListPage() {
  const sb = await createClient();

  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  const { data: sitesRes } = await sb
    .from("sites")
    .select("*")
    .order("name");

  const sites = sitesRes ?? [];
  const siteIds = sites.map((s) => s.id);

  let inverters: any[] = [];
  if (siteIds.length > 0) {
    const { data: invs } = await sb.from("inverters").select("*").in("site_id", siteIds);
    inverters = invs ?? [];
  }

  const inverterIds = inverters.map((i) => i.id);
  let latestTelemetry: any[] = [];
  if (inverterIds.length > 0) {
    const { data: tels } = await sb.rpc("get_latest_telemetry", { inverter_ids: inverterIds });
    latestTelemetry = tels ?? [];
  }

  const latestInvTelemetryMap = new Map<string, any>();
  const latestTelemetryTimestampMap = new Map<string, string>();
  for (const t of latestTelemetry) {
    latestInvTelemetryMap.set(t.inverter_id, t);
    if (t.timestamp) {
      latestTelemetryTimestampMap.set(t.inverter_id, t.timestamp);
    }
  }

  const siteInverters = new Map<string, any[]>();
  for (const inv of inverters) {
    const list = siteInverters.get(inv.site_id) ?? [];
    list.push(inv);
    siteInverters.set(inv.site_id, list);
  }

  return (
    <div className="space-y-6" data-testid="client-sites-page">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/client" className="text-xs text-muted-foreground hover:text-primary transition-colors">
              Portfolio
            </Link>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-xs text-primary font-medium">My Sites</span>
          </div>
          <h1 className="text-3xl font-display font-semibold tracking-tight mt-1">
            Your Solar Sites ({sites.length})
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Select an individual solar installation to inspect daily energy production, maintenance care, and detailed history.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sites.map((s) => {
          const siteInvs = siteInverters.get(s.id) ?? [];
          const siteStatus = getSiteStatus(siteInvs, latestTelemetryTimestampMap);

          let currentPower = 0;
          let todayGeneration = 0;
          let lifetimeGeneration = 0;

          for (const inv of siteInvs) {
            const tel = latestInvTelemetryMap.get(inv.id);
            if (tel) {
              currentPower += Number(tel.ac_power_kw || 0);
              todayGeneration += Number(tel.daily_generation_kwh || 0);
              lifetimeGeneration += Number(tel.total_generation_kwh || 0);
            }
          }

          const capacity = Number(s.capacity_kwp || 0);
          const todaySpecificYield = capacity > 0 ? (todayGeneration / capacity) : 0;
          const savingsResult = calculateFinancialSavings(todayGeneration, s.grid_tariff_inr_per_kwh);
          const isSiteNormal = siteStatus === "ONLINE";

          return (
            <Card key={s.id} className="overflow-hidden hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <CardHeader className="pb-3 border-b flex flex-row items-start justify-between">
                  <div>
                    <Link href={`/client/sites/${s.id}`} className="font-semibold text-lg hover:text-primary transition-colors line-clamp-1">
                      {s.name}
                    </Link>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin className="h-3.5 w-3.5" /> {s.location}
                    </p>
                  </div>
                  <Badge variant={isSiteNormal ? "success" : "warning"}>
                    {isSiteNormal ? "Operating Normally" : "Attention Needed"}
                  </Badge>
                </CardHeader>
                <CardContent className="pt-4 space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <div>
                      <div className="text-muted-foreground text-xs">System Size</div>
                      <div className="font-semibold font-mono">{capacity.toLocaleString()} kWp</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Current Power Output</div>
                      <div className="font-semibold font-mono">{currentPower.toFixed(2)} kW</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Energy Produced Today</div>
                      <div className="font-semibold font-mono text-emerald-600 dark:text-emerald-400">{todayGeneration.toFixed(1)} kWh</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Today's Specific Yield</div>
                      <div className="font-semibold font-mono">{todaySpecificYield.toFixed(2)} kWh/kWp</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Lifetime Output</div>
                      <div className="font-semibold font-mono">{(lifetimeGeneration / 1000).toFixed(1)} MWh</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Estimated Savings Today</div>
                      <div className="font-semibold font-mono">
                        {savingsResult ? savingsResult.formatted : "Not configured"}
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 bg-primary/5 rounded-lg border border-primary/10 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <span>Specific Yield: How much electricity your solar system produced today relative to its size ({todaySpecificYield.toFixed(2)} kWh/kWp).</span>
                  </div>
                </CardContent>
              </div>

              <CardContent className="pt-0">
                <div className="pt-3 border-t flex justify-end">
                  <Link href={`/client/sites/${s.id}`}>
                    <Button variant="default" size="sm" className="text-xs gap-1.5 h-8">
                      View Details & History <ArrowUpRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
