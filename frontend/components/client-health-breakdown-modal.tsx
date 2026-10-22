"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Activity, SprayCan, CheckCircle2, AlertCircle, Info, ArrowUpRight } from "lucide-react";
import type { SystemHealthResult } from "@/lib/client-health-score";

interface ClientHealthBreakdownModalProps {
  healthResult: SystemHealthResult;
  siteName?: string;
  trigger?: React.ReactNode;
}

export function ClientHealthBreakdownModal({
  healthResult,
  siteName,
  trigger,
}: ClientHealthBreakdownModalProps) {
  const [open, setOpen] = useState(false);

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-emerald-600 dark:text-emerald-400";
    if (score >= 70) return "text-amber-600 dark:text-amber-400";
    return "text-rose-600 dark:text-rose-400";
  };

  const getBadgeVariant = (status: "optimal" | "warning" | "critical") => {
    if (status === "optimal") return "success";
    if (status === "warning") return "warning";
    return "destructive";
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Inverter Availability":
        return <Activity className="h-4 w-4 text-emerald-500" />;
      case "Operational Incidents":
        return <ShieldCheck className="h-4 w-4 text-primary" />;
      case "Preventive Maintenance":
        return <SprayCan className="h-4 w-4 text-amber-500" />;
      default:
        return <Info className="h-4 w-4 text-primary" />;
    }
  };

  return (
    <>
      <div onClick={() => setOpen(true)} className="cursor-pointer">
        {trigger || (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1">
            <span>How is this calculated?</span>
            <ArrowUpRight className="h-3 w-3" />
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md md:max-w-lg">
          <DialogHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-500" />
                  System Health Score Explained
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {siteName ? `Operational assessment for ${siteName}` : "Portfolio-wide operational assessment"}
                </DialogDescription>
              </div>
              <div className="text-right">
                <div className={`text-3xl font-bold font-mono ${getScoreColor(healthResult.score)}`}>
                  {healthResult.score} <span className="text-xs font-sans font-normal text-muted-foreground">/ 100</span>
                </div>
                <Badge variant={healthResult.score >= 90 ? "success" : healthResult.score >= 70 ? "warning" : "destructive"} className="text-[10px] mt-1">
                  {healthResult.label}
                </Badge>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 bg-muted/40 rounded-lg text-xs text-foreground leading-relaxed">
              <span className="font-semibold">Summary:</span> {healthResult.summary}
            </div>

            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Health Score Breakdown
              </div>

              {healthResult.breakdown.factors.map((factor, idx) => (
                <div key={idx} className="p-3.5 border rounded-xl space-y-2 bg-card/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-medium text-sm text-foreground">
                      {getCategoryIcon(factor.category)}
                      <span>{factor.category}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getBadgeVariant(factor.status)} className="text-[10px] capitalize">
                        {factor.status === "optimal" ? "Optimal" : factor.status}
                      </Badge>
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {factor.score} / {factor.maxScore} pts
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        factor.score === factor.maxScore
                          ? "bg-emerald-500"
                          : factor.score >= factor.maxScore * 0.6
                          ? "bg-amber-500"
                          : "bg-rose-500"
                      }`}
                      style={{ width: `${(factor.score / factor.maxScore) * 100}%` }}
                    />
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {factor.detail}
                  </p>
                </div>
              ))}
            </div>

            <div className="border-t pt-3 flex items-start gap-2 text-[11px] text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>
                Solar Assist continuously evaluates incoming telemetry and field service visits.
                Repairs are validated via automated post-service recovery checks before being marked resolved.
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
