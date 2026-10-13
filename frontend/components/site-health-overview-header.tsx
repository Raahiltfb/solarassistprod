"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldAlert, AlertTriangle, Zap, Wrench, WifiOff } from "lucide-react";

export interface SiteHealthSummary {
  site_id: string;
  site_name: string;
  health_score: number; // 0 - 100
  active_issues_count: number;
  inverters_affected: number;
  inverters_offline_count?: number;
  total_inverters: number;
  strings_affected: number;
  potential_loss_kwh: number;
  potential_loss_inr: number;
  top_recommended_action: string;
  health_status: "optimal" | "warning" | "critical";
}

export function SiteHealthOverviewHeader({
  summary,
}: {
  summary: SiteHealthSummary;
}) {
  const getBadgeColor = (status: string) => {
    switch (status) {
      case "critical":
        return "bg-destructive text-destructive-foreground hover:bg-destructive";
      case "warning":
        return "bg-amber-500 text-white hover:bg-amber-600";
      default:
        return "bg-emerald-600 text-white hover:bg-emerald-700";
    }
  };

  return (
    <Card className="border shadow-md bg-gradient-to-r from-card via-card to-muted/30 overflow-hidden" data-testid="site-health-header">
      <CardContent className="p-5">
        <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-4">
          {/* Health Score & Key Site Status */}
          <div className="flex items-center gap-4 shrink-0 2xl:max-w-md">
            <div className="relative flex items-center justify-center shrink-0">
              <div
                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full border-4 flex items-center justify-center font-mono text-xl font-extrabold ${
                  summary.health_score >= 90
                    ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                    : summary.health_score >= 75
                    ? "border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                    : "border-destructive text-destructive bg-destructive/10"
                }`}
              >
                {summary.health_score}
              </div>
            </div>

            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight break-words">{summary.site_name}</h2>
                <Badge className={`text-[10px] uppercase font-bold shrink-0 ${getBadgeColor(summary.health_status)}`}>
                  {summary.health_status === "optimal"
                    ? "Healthy Plant"
                    : summary.health_status === "warning"
                    ? "Action Needed"
                    : "Critical Diagnostics"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
                <span>{summary.total_inverters} Inverters</span>
                <span>•</span>
                <span>{summary.active_issues_count} Active Anomalies</span>
                {Boolean(summary.inverters_offline_count) && (
                  <>
                    <span>•</span>
                    <span className="text-destructive font-bold flex items-center gap-1">
                      <WifiOff className="h-3 w-3" /> {summary.inverters_offline_count} Offline
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Right Group: Diagnostic Counters & Priority Action */}
          <div className="flex flex-col lg:flex-row items-stretch gap-3 flex-1 min-w-0 2xl:justify-end">
            {/* Core Diagnostic Counters */}
            <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4 text-xs bg-muted/40 p-3.5 rounded-xl border border-border/60">
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground block leading-tight truncate" title="Active Issues">
                  Active Issues
                </span>
                <span className={`text-base font-bold font-mono mt-0.5 block ${summary.active_issues_count > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                  {summary.active_issues_count}
                </span>
              </div>

              <div className="min-w-0">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground block leading-tight truncate" title="Inverters Impacted">
                  Inverters Impacted
                </span>
                <span className="text-base font-bold font-mono text-foreground mt-0.5 block">
                  {summary.inverters_affected} / {summary.total_inverters}
                </span>
              </div>

              <div className="min-w-0">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground block leading-tight truncate" title="Strings Affected">
                  Strings Affected
                </span>
                <span className="text-base font-bold font-mono text-foreground mt-0.5 block">
                  {summary.strings_affected}
                </span>
              </div>

              <div className="min-w-0">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground block leading-tight truncate" title="Estimated Revenue Risk">
                  Revenue Risk
                </span>
                <span className="text-base font-bold font-mono text-amber-600 dark:text-amber-400 mt-0.5 block">
                  ₹{summary.potential_loss_inr.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Top Recommended Action */}
            <div className="flex flex-col justify-center space-y-1.5 lg:w-80 shrink-0 bg-primary/5 p-3 rounded-xl border border-primary/20">
              <span className="text-[10px] uppercase font-bold text-primary flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5 shrink-0" /> Priority Action
              </span>
              <p className="text-xs font-semibold text-foreground line-clamp-2 leading-snug">
                {summary.top_recommended_action}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
