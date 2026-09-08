"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldCheck, Activity, Search, CheckCircle2, Info } from "lucide-react";
import { getAlarmIntelligence, type AlarmIntelligence } from "@/lib/automation/alarm-intelligence";

interface AlarmIntelligenceCardProps {
  code: string;
  oem?: string;
  customIntelligence?: AlarmIntelligence | null;
}

export function AlarmIntelligenceCard({ code, oem = "solis", customIntelligence }: AlarmIntelligenceCardProps) {
  const intel = customIntelligence || getAlarmIntelligence(code, oem);

  if (!intel) return null;

  const severityColor =
    intel.severity === "critical"
      ? "bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400"
      : intel.severity === "high"
      ? "bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400"
      : "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:text-yellow-400";

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3 border-b bg-muted/20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <CardTitle className="text-base font-semibold">Alarm Intelligence &amp; Field Guidance</CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className={`capitalize font-mono text-xs ${severityColor}`}>
              {intel.severity}
            </Badge>
            <Badge variant="outline" className="uppercase font-mono text-xs">
              {intel.category}
            </Badge>
            {intel.requires_technician ? (
              <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20">
                Tech Visit Required
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20">
                Auto-Resolvable
              </Badge>
            )}
          </div>
        </div>
        <CardDescription className="text-xs mt-1">
          Ground-truth OEM alarm information, potential investigation areas, and general field guidance.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {/* Verified OEM Information */}
        <div className="rounded-md bg-slate-900/5 dark:bg-slate-800/40 p-3 text-xs space-y-1.5 border">
          <div className="flex items-center gap-1.5 text-slate-900 dark:text-slate-100 font-semibold">
            <Info className="h-3.5 w-3.5 text-primary" /> Verified OEM Information ({intel.oem_code || intel.code})
          </div>
          <p className="text-muted-foreground leading-relaxed">{intel.oem_definition}</p>
        </div>

        {/* Potential Causes / Areas to Investigate */}
        {intel.potential_causes.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Search className="h-3.5 w-3.5 text-amber-500" /> Potential Areas to Investigate
            </div>
            <ul className="space-y-1 pl-4 text-xs text-muted-foreground list-disc">
              {intel.potential_causes.map((cause, idx) => (
                <li key={idx} className="leading-relaxed">
                  {cause}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommended Action Summary */}
        <div className="rounded-md bg-primary/5 p-3 border border-primary/10 text-xs">
          <span className="font-semibold text-primary">Recommended Operational Action: </span>
          <span className="text-foreground">{intel.recommended_action}</span>
        </div>

        {/* Generic Field Inspection Guidance */}
        {intel.general_field_guidance.length > 0 && (
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-500" /> General Field Guidance Protocol (Read-Only)
            </div>
            <div className="grid gap-2">
              {intel.general_field_guidance.map((g) => (
                <div key={g.step} className="flex gap-2.5 items-start p-2.5 rounded border bg-card text-xs">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[10px]">
                    {g.step}
                  </div>
                  <div className="space-y-0.5">
                    <div className="font-semibold text-foreground text-[11px] uppercase tracking-wide text-primary">
                      {g.phase}
                    </div>
                    <p className="text-muted-foreground leading-relaxed text-[11px]">{g.instruction}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
