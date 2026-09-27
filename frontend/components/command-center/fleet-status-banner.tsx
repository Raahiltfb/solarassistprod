"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, AlertCircle, ShieldAlert, ShieldCheck, Wrench, SprayCan, Building2, Zap, ArrowRight, Activity } from "lucide-react";

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
  overdueCleanings: number;
  unassignedJobsCount: number;
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
  overdueCleanings,
  unassignedJobsCount,
}: FleetStatusBannerProps) {
  const isFleetAllNormal = attentionSites === 0 && offlineSites === 0 && openAlertsCount === 0 && overdueCleanings === 0 && openTicketsCount === 0;
  const totalActionableIssues = attentionSites + offlineSites + openAlertsCount + overdueCleanings + unassignedJobsCount;

  return (
    <div className="space-y-4" data-testid="fleet-status-banner">
      {/* 1. DOMINANT HERO INCIDENT & ALERT CONTROL BAR */}
      <Card
        className={`overflow-hidden border shadow-md transition-all ${
          isFleetAllNormal
            ? "bg-gradient-to-r from-emerald-500/10 via-card to-card border-emerald-500/30"
            : "bg-gradient-to-r from-destructive/15 via-amber-500/10 to-card border-destructive/40"
        }`}
      >
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div
                className={`flex items-center justify-center h-14 w-14 rounded-2xl shrink-0 ${
                  isFleetAllNormal
                    ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                    : "bg-destructive/20 text-destructive animate-pulse"
                }`}
              >
                {isFleetAllNormal ? (
                  <ShieldCheck className="h-8 w-8" />
                ) : (
                  <AlertCircle className="h-8 w-8" />
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl lg:text-2xl font-bold tracking-tight text-foreground">
                    {isFleetAllNormal
                      ? `All ${totalSites} Sites Operating Normally`
                      : `${totalActionableIssues} Operational Exceptions Require Immediate Action`}
                  </h2>
                  <Badge
                    variant={isFleetAllNormal ? "success" : "destructive"}
                    className="text-xs px-2.5 py-0.5 font-bold uppercase tracking-wider"
                  >
                    {isFleetAllNormal ? "No Active Faults" : "Generation Risk Active"}
                  </Badge>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground max-w-3xl">
                  {isFleetAllNormal
                    ? `All ${totalSites} solar assets are online with clean telemetry signals, zero unhandled alarms, and no overdue maintenance.`
                    : `Telemetry alarms, inverter outages, unassigned jobs, or overdue cleanings cause direct energy yield and financial loss. Address active issues below.`}
                </p>

                {/* Direct Interactive Action Buttons */}
                {!isFleetAllNormal && (
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    {offlineSites > 0 && (
                      <Link href="/sites?status=offline">
                        <Button size="sm" variant="destructive" className="h-8 text-xs font-semibold gap-1.5">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {offlineSites} Offline {offlineSites === 1 ? "Site" : "Sites"}
                        </Button>
                      </Link>
                    )}
                    {openAlertsCount > 0 && (
                      <Link href="/alerts">
                        <Button size="sm" variant="outline" className="h-8 text-xs font-semibold border-amber-500/50 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {openAlertsCount} Active Telemetry Alerts
                        </Button>
                      </Link>
                    )}
                    {openTicketsCount > 0 && (
                      <Link href="/tickets">
                        <Button size="sm" variant="outline" className="h-8 text-xs font-semibold border-primary/50 text-primary hover:bg-primary/10 gap-1.5">
                          <Wrench className="h-3.5 w-3.5" />
                          {openTicketsCount} Incident Tickets
                        </Button>
                      </Link>
                    )}
                    {overdueCleanings > 0 && (
                      <Link href="/cleaning">
                        <Button size="sm" variant="outline" className="h-8 text-xs font-semibold border-amber-600/50 text-amber-800 dark:text-amber-300 hover:bg-amber-600/10 gap-1.5">
                          <SprayCan className="h-3.5 w-3.5" />
                          {overdueCleanings} Overdue Cleanings
                        </Button>
                      </Link>
                    )}
                    {unassignedJobsCount > 0 && (
                      <Link href="/service-requests?status=unassigned">
                        <Button size="sm" variant="outline" className="h-8 text-xs font-semibold border-slate-400 text-slate-700 dark:text-slate-300 hover:bg-slate-100 gap-1.5">
                          <Activity className="h-3.5 w-3.5" />
                          {unassignedJobsCount} Unassigned Tasks
                        </Button>
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Total Active Exceptions Counter Badge */}
            <div className="flex items-center gap-4 bg-background/90 backdrop-blur p-4 rounded-2xl border shadow-sm shrink-0">
              <div className="text-right">
                <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">Actionable Exceptions</div>
                <div className={`text-3xl font-extrabold font-mono ${totalActionableIssues > 0 ? "text-destructive" : "text-emerald-600"}`}>
                  {totalActionableIssues}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. FOUR CLICKABLE ACTION & URGENCY METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Sites Requiring Attention */}
        <Link href="/sites?status=attention" className="block group">
          <Card className="hover:border-primary/60 hover:shadow-md transition-all h-full bg-card group-hover:bg-accent/30">
            <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-primary" />
                  Sites Needing Review
                </span>
                <Badge variant={attentionSites > 0 ? "destructive" : "secondary"} className="font-mono text-xs">
                  {attentionSites}
                </Badge>
              </div>

              <div>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {attentionSites} <span className="text-xs font-sans font-normal text-muted-foreground">/ {totalSites} Sites</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {offlineSites > 0 ? (
                    <span className="text-destructive font-semibold">{offlineSites} Sites Offline (Disconnections)</span>
                  ) : (
                    <span>{normalSites} sites operating normally</span>
                  )}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t text-xs font-semibold text-primary group-hover:underline">
                <span>Inspect Attention Sites</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Card 2: Equipment Outages & Disconnections */}
        <Link href="/alerts" className="block group">
          <Card className="hover:border-destructive/60 hover:shadow-md transition-all h-full bg-card group-hover:bg-accent/30">
            <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-destructive" />
                  Equipment Outages
                </span>
                <Badge variant={offlineInverters > 0 ? "destructive" : "secondary"} className="font-mono text-xs">
                  {offlineInverters}
                </Badge>
              </div>

              <div>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {offlineInverters} <span className="text-xs font-sans font-normal text-muted-foreground">Inverter Units</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {offlineInverters > 0 ? (
                    <span className="text-destructive font-semibold">Immediate Generation Loss Risk</span>
                  ) : (
                    <span className="text-emerald-600 font-medium">100% Inverters Communicating</span>
                  )}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t text-xs font-semibold text-destructive group-hover:underline">
                <span>View Telemetry Alarms</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Card 3: Active Incident Tickets */}
        <Link href="/tickets" className="block group">
          <Card className="hover:border-amber-500/60 hover:shadow-md transition-all h-full bg-card group-hover:bg-accent/30">
            <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Wrench className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  Active Incident Tickets
                </span>
                <Badge variant={openTicketsCount > 0 ? "warning" : "secondary"} className="font-mono text-xs">
                  {openTicketsCount}
                </Badge>
              </div>

              <div>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {openTicketsCount} <span className="text-xs font-sans font-normal text-muted-foreground">Open Tickets</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {openAlertsCount > 0 ? (
                    <span className="text-amber-700 dark:text-amber-300 font-medium">{openAlertsCount} active alerts unlinked</span>
                  ) : (
                    <span>All alerts routed to tickets</span>
                  )}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t text-xs font-semibold text-amber-700 dark:text-amber-400 group-hover:underline">
                <span>Manage Incidents Queue</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Card 4: Overdue Maintenance & Cleanings */}
        <Link href="/cleaning" className="block group">
          <Card className="hover:border-amber-600/60 hover:shadow-md transition-all h-full bg-card group-hover:bg-accent/30">
            <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <SprayCan className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  Overdue Maintenance
                </span>
                <Badge variant={overdueCleanings > 0 ? "destructive" : "secondary"} className="font-mono text-xs">
                  {overdueCleanings}
                </Badge>
              </div>

              <div>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {overdueCleanings} <span className="text-xs font-sans font-normal text-muted-foreground">Overdue Sites</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {overdueCleanings > 0 ? (
                    <span className="text-amber-800 dark:text-amber-300 font-medium">Soiling generation degradation risk</span>
                  ) : (
                    <span className="text-emerald-600 font-medium">All cleaning cycles on schedule</span>
                  )}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t text-xs font-semibold text-amber-800 dark:text-amber-300 group-hover:underline">
                <span>Resolve Cleaning Dues</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
