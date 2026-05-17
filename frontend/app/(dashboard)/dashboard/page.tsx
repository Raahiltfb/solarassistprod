import { createClient } from "@/lib/supabase/server";

import Link from "next/link";

import { KpiCard } from "@/components/kpi-card";
import { GenerationChart } from "@/components/generation-chart";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";

import {
  Zap,
  Activity,
  AlertTriangle,
  Building2,
  Clock,
  CheckCircle2,
  SprayCan,
} from "lucide-react";

import { kWh, formatDateTime } from "@/lib/utils";

export default async function DashboardPage() {
  const sb = await createClient();

  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return null;
  }

  // =========================================================
  // TECHNICIAN DASHBOARD
  // =========================================================

  if (profile.role === "technician") {
    const { data: sites } = await sb
      .from("sites")
      .select("*")
      .eq("org_id", profile.org_id)
      .order("name");

    const siteList = sites ?? [];

    const now = Date.now();

    const enrichedSites = siteList.map((site) => {
      const lastCleaned = site.last_cleaned_on
        ? new Date(site.last_cleaned_on).getTime()
        : 0;

      const daysSinceClean =
        lastCleaned > 0
          ? Math.floor(
              (now - lastCleaned) / 86400_000
            )
          : 999;

      const overdueDays =
        daysSinceClean -
        site.cleaning_cycle_days;

      const nextDueDate =
        lastCleaned > 0
          ? new Date(
              lastCleaned +
                site.cleaning_cycle_days *
                  86400_000
            )
          : null;

      let priority = "normal";

      if (
        Number(site.capacity_kwp) >= 5000 ||
        overdueDays >= 5
      ) {
        priority = "high";
      }

      return {
        ...site,
        overdueDays,
        nextDueDate,
        priority,
      };
    });

    const overdueSites = enrichedSites.filter(
      (s) => s.overdueDays > 0
    );

    const upcomingSites = enrichedSites.filter(
      (s) =>
        s.overdueDays <= 0 &&
        s.overdueDays >= -5
    );

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Cleaning Operations
          </h1>

          <p className="text-sm text-muted-foreground mt-1">
            Cleaning schedules, overdue
            sites and operational updates.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Assigned Sites"
            value={siteList.length}
            sub="Within your organisation"
            icon={Building2}
          />

          <KpiCard
            label="Overdue"
            value={overdueSites.length}
            sub="Require cleaning"
            icon={AlertTriangle}
            accent={
              overdueSites.length > 0
                ? "warning"
                : "success"
            }
          />

          <KpiCard
            label="Upcoming"
            value={upcomingSites.length}
            sub="Due soon"
            icon={Clock}
          />

          <KpiCard
            label="Completed Today"
            value="0"
            sub="Cleaning logs today"
            icon={CheckCircle2}
            accent="success"
          />
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>
                Site Cleaning Status
              </CardTitle>

              <p className="text-sm text-muted-foreground mt-1">
                Cleaning schedules and
                overdue tracking.
              </p>
            </div>

            <Link href="/technician/cleaning">
              <Badge className="cursor-pointer">
                <SprayCan className="h-3 w-3 mr-1" />
                Log Cleaning
              </Badge>
            </Link>
          </CardHeader>

          <CardContent className="space-y-4">
            {enrichedSites.map((site) => {
              const isOverdue =
                site.overdueDays > 0;

              return (
                <div
                  key={site.id}
                  className="border rounded-xl p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-lg">
                        {site.name}
                      </h3>

                      <p className="text-sm text-muted-foreground">
                        {site.location}
                      </p>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      <Badge
                        variant={
                          isOverdue
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {isOverdue
                          ? `${site.overdueDays} days overdue`
                          : "Within schedule"}
                      </Badge>

                      {site.priority ===
                        "high" && (
                        <Badge className="bg-orange-500">
                          High Priority
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                    <div>
                      <div className="text-muted-foreground">
                        Capacity
                      </div>

                      <div className="font-medium">
                        {site.capacity_kwp} kWp
                      </div>
                    </div>

                    <div>
                      <div className="text-muted-foreground">
                        Last Cleaned
                      </div>

                      <div className="font-medium">
                        {site.last_cleaned_on ??
                          "Never"}
                      </div>
                    </div>

                    <div>
                      <div className="text-muted-foreground">
                        Next Due
                      </div>

                      <div className="font-medium">
                        {site.nextDueDate
                          ? site.nextDueDate
                              .toISOString()
                              .slice(0, 10)
                          : "Unknown"}
                      </div>
                    </div>

                    <div>
                      <div className="text-muted-foreground">
                        Cleaning Cycle
                      </div>

                      <div className="font-medium">
                        {
                          site.cleaning_cycle_days
                        }{" "}
                        days
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {enrichedSites.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-10">
                No sites assigned.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // =========================================================
  // ADMIN / CLIENT DASHBOARD
  // =========================================================

  const [
    sitesRes,
    alertsRes,
    ticketsRes,
    telRes,
    invertersRes,
  ] = await Promise.all([
    sb.from("sites").select(
      "id, name, location, capacity_kwp, status"
    ),

    sb
      .from("alerts")
      .select(
        "id, title, severity, status, triggered_at, site_id"
      )
      .order("triggered_at", {
        ascending: false,
      })
      .limit(6),

    sb
      .from("tickets")
      .select(
        "id, title, status, priority, created_at"
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(6),

    sb
      .from("telemetry")
      .select(
        "timestamp, ac_power_kw, energy_kwh"
      )
      .gte(
        "timestamp",
        new Date(
          Date.now() - 24 * 3600_000
        ).toISOString()
      )
      .order("timestamp"),

    sb.from("inverters").select("id, status"),
  ]);

  const sites = sitesRes.data ?? [];
  const alerts = alertsRes.data ?? [];
  const tickets = ticketsRes.data ?? [];
  const telemetry = telRes.data ?? [];
  const inverters = invertersRes.data ?? [];

  const totalCapacity = sites.reduce(
    (s, x) =>
      s + Number(x.capacity_kwp || 0),
    0
  );

  const openAlerts = alerts.filter(
    (a) => a.status === "open"
  ).length;

  const onlineInverters =
    inverters.filter(
      (i) => i.status === "online"
    ).length;

  const totalInverters =
    inverters.length || 1;

  const byHour = new Map<string, number>();

  for (const t of telemetry) {
    const h =
      new Date(t.timestamp)
        .toISOString()
        .slice(0, 13) + ":00:00Z";

    byHour.set(
      h,
      (byHour.get(h) ?? 0) +
        Number(t.ac_power_kw)
    );
  }

  const series = Array.from(
    byHour.entries()
  )
    .sort()
    .map(
      ([timestamp, ac_power_kw]) => ({
        timestamp,

        ac_power_kw:
          +ac_power_kw.toFixed(2),

        expected:
          +(ac_power_kw * 1.08).toFixed(
            2
          ),
      })
    );

  const totalEnergy24h =
    telemetry.reduce(
      (s, t) =>
        s + Number(t.ac_power_kw),
      0
    );

  return (
    <div
      className="space-y-6"
      data-testid="dashboard-page"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-display font-semibold tracking-tight">
            Fleet overview
          </h1>

          <p className="text-sm text-muted-foreground mt-1">
            Real-time generation, health
            and ops across all sites.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Installed capacity"
          value={`${(
            totalCapacity / 1000
          ).toFixed(2)} MWp`}
          sub={`${sites.length} sites`}
          icon={Building2}
        />

        <KpiCard
          label="Generation (24h)"
          value={kWh(totalEnergy24h)}
          sub="Sum across fleet"
          icon={Zap}
          accent="primary"
        />

        <KpiCard
          label="Inverters online"
          value={`${onlineInverters}/${totalInverters}`}
          sub={`${(
            (onlineInverters /
              totalInverters) *
            100
          ).toFixed(0)}% availability`}
          icon={Activity}
          accent="success"
        />

        <KpiCard
          label="Open alerts"
          value={openAlerts}
          sub={`${
            tickets.filter(
              (t) => t.status === "open"
            ).length
          } open tickets`}
          icon={AlertTriangle}
          accent={
            openAlerts > 0
              ? "warning"
              : "success"
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              Generation — last 24 hours
            </CardTitle>
          </CardHeader>

          <CardContent>
            {series.length > 0 ? (
              <GenerationChart
                data={series}
              />
            ) : (
              <div className="text-sm text-muted-foreground py-12 text-center">
                No telemetry yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Recent alerts
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            {alerts.length === 0 && (
              <div className="text-sm text-muted-foreground">
                All clear.
              </div>
            )}

            {alerts.map((a) => (
              <Link
                key={a.id}
                href="/alerts"
                className="block"
              >
                <div className="flex items-start gap-3 p-3 rounded-md hover:bg-accent transition-colors">
                  <div
                    className={`h-2 w-2 rounded-full mt-1.5 ${
                      a.severity ===
                      "critical"
                        ? "bg-destructive"
                        : a.severity ===
                            "high"
                          ? "bg-orange-500"
                          : a.severity ===
                              "medium"
                            ? "bg-warning"
                            : "bg-muted-foreground"
                    }`}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {a.title}
                    </div>

                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(
                        a.triggered_at
                      )}
                    </div>
                  </div>

                  <Badge
                    variant={
                      a.status === "open"
                        ? "destructive"
                        : "secondary"
                    }
                    className="shrink-0 capitalize"
                  >
                    {a.status}
                  </Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}