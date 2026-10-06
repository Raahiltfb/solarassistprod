"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldAlert, AlertTriangle, Zap, Wrench, ArrowRight } from "lucide-react";

export interface SiteHealthSummary {
  site_id: string;
  site_name: string;
  health_score: number; // 0 - 100
  active_issues_count: number;
  inverters_affected: number;
  total_inverters: number;
  strings_affected: number;
  potential_loss_kwh: number;
  potential_loss_inr: number;
  top_recommended_action: string;
  health_status: "optimal" | "warning" | "critical";
}

export function SiteHealthOverviewHeader({
  summary,
  onNavigateToTab,
}: {
  summary: SiteHealthSummary;
  onNavigateToTab?: (tab: string) => void;
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
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Health Score & Key Site Status */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="relative flex items-center justify-center">
              <div
                className={`w-16 h-16 rounded-full border-4 flex items-center justify-center font-mono text-xl font-extrabold ${
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

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground tracking-tight">{summary.site_name}</h2>
                <Badge className={`text-[10px] uppercase font-bold ${getBadgeColor(summary.health_status)}`}>
                  {summary.health_status === "optimal"
                    ? "Healthy Plant"
                    : summary.health_status === "warning"
                    ? "Action Needed"
                    : "Critical Diagnostics"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <span>{summary.total_inverters} Inverters</span>
                <span>•</span>
                <span>{summary.active_issues_count} Active Anomalies</span>
              </p>
            </div>
          </div>

          {/* Core Diagnostic Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-muted/40 p-3 rounded-xl border border-border/60">
            <div>
              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Active Issues</span>
              <span className={`text-lg font-bold font-mono ${summary.active_issues_count > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                {summary.active_issues_count}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Inverters Impacted</span>
              <span className="text-lg font-bold font-mono text-foreground">
                {summary.inverters_affected} / {summary.total_inverters}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Strings Affected</span>
              <span className="text-lg font-bold font-mono text-foreground">
                {summary.strings_affected}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Est. Revenue Risk</span>
              <span className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400">
                ₹{summary.potential_loss_inr.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Top Recommended Action */}
          <div className="flex flex-col justify-between space-y-2 lg:max-w-xs shrink-0 bg-primary/5 p-3 rounded-xl border border-primary/20">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-primary flex items-center gap-1">
                <Wrench className="h-3 w-3" /> Priority Recommended Action
              </span>
              <p className="text-xs font-semibold text-foreground line-clamp-2">
                {summary.top_recommended_action}
              </p>
            </div>
            {onNavigateToTab && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onNavigateToTab("strings")}
                className="h-7 text-[11px] p-0 text-primary hover:bg-transparent hover:underline justify-start gap-1 font-semibold"
              >
                <span>Drill Into String Diagnostics</span>
                <ArrowRight className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
