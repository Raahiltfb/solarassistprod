"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertCircle, Activity, Zap, Building2, Wrench } from "lucide-react";
import { kWh } from "@/lib/utils";

interface FleetStatusBannerProps {
  totalSites: number;
  onlineSites: number;
  normalSites: number;
  attentionSites: number;
  offlineSites: number;
  totalInverters: number;
  onlineInverters: number;
  offlineInverters: number;
  openTicketsCount: number;
  openAlertsCount: number;
  currentPowerKw: number;
  todayEnergyKwh: number;
}

export function FleetStatusBanner({
  totalSites,
  onlineSites,
  normalSites,
  attentionSites,
  offlineSites,
  totalInverters,
  onlineInverters,
  offlineInverters,
  openTicketsCount,
  openAlertsCount,
  currentPowerKw,
  todayEnergyKwh,
}: FleetStatusBannerProps) {
  const isFleetAllNormal = attentionSites === 0 && offlineSites === 0;

  return (
    <div className="space-y-4" data-testid="fleet-status-banner">
      {/* Dominant Hero Status Hierarchy Banner */}
      <Card
        className={`overflow-hidden border shadow-sm ${
          isFleetAllNormal
            ? "bg-gradient-to-r from-emerald-500/10 via-card to-card border-emerald-500/30"
            : "bg-gradient-to-r from-amber-500/10 via-card to-card border-amber-500/30"
        }`}
      >
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div
                className={`flex items-center justify-center h-14 w-14 rounded-2xl shrink-0 ${
                  isFleetAllNormal
                    ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                    : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                }`}
              >
                {isFleetAllNormal ? (
                  <ShieldCheck className="h-8 w-8" />
                ) : (
                  <AlertCircle className="h-8 w-8" />
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold tracking-tight text-foreground">
                    {onlineSites} of {totalSites} Sites Online
                  </h2>
                  <Badge
                    variant={isFleetAllNormal ? "success" : "warning"}
                    className="text-xs px-2.5 py-0.5 font-medium"
                  >
                    {isFleetAllNormal ? "Fleet Operating Normally" : `${attentionSites} Require Attention`}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground max-w-2xl">
                  {isFleetAllNormal
                    ? `All ${totalSites} operational sites are online and communicating with SolarAssist telemetry monitoring.`
                    : `${normalSites} of ${totalSites} sites operating normally. ${attentionSites} ${
                        attentionSites === 1 ? "site requires" : "sites require"
                      } operational review.`}
                </p>
              </div>
            </div>

            {/* Quick Live Telemetry Snapshot */}
            <div className="flex items-center gap-6 bg-background/80 backdrop-blur px-5 py-3 rounded-xl border">
              <div>
                <div className="text-xs text-muted-foreground">Communicating Sites</div>
                <div className="text-lg font-bold font-mono text-foreground">
                  {onlineSites} / {totalSites}
                </div>
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <div className="text-xs text-muted-foreground font-medium text-emerald-600 dark:text-emerald-400">Current Output</div>
                <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {currentPowerKw.toFixed(1)} kW
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4 Core Actionable Operational Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Site Fleet Status */}
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Fleet Sites
              </span>
              <div className="text-2xl font-bold font-mono text-foreground">
                {totalSites} <span className="text-xs font-sans font-normal text-muted-foreground">Sites</span>
              </div>
              <p className="text-xs text-muted-foreground">
                <strong className="text-emerald-600 dark:text-emerald-400">{normalSites} Normal</strong> • {attentionSites} Attention
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Inverter Health */}
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Inverter Equipment
              </span>
              <div className="text-2xl font-bold font-mono text-foreground">
                {onlineInverters} <span className="text-xs font-sans font-normal text-muted-foreground">/ {totalInverters}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {offlineInverters > 0 ? (
                  <span className="text-amber-600 font-medium">{offlineInverters} Disconnected / Offline</span>
                ) : (
                  <span className="text-emerald-600 font-medium">100% Units Online</span>
                )}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Zap className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Actionable Incident Queue */}
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Active Incidents
              </span>
              <div className="text-2xl font-bold font-mono text-foreground">
                {openTicketsCount}{" "}
                <span className="text-xs font-sans font-normal text-muted-foreground">
                  Tickets
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {openAlertsCount > 0 ? `${openAlertsCount} active alerts linked` : "No pending open alerts"}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Wrench className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Fleet Energy Output */}
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Today's Fleet Output
              </span>
              <div className="text-2xl font-bold font-mono text-foreground">
                {kWh(todayEnergyKwh)}
              </div>
              <p className="text-xs text-muted-foreground">
                Current: <strong className="text-foreground">{currentPowerKw.toFixed(1)} kW</strong>
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Activity className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
