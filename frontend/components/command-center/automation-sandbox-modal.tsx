"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Play, Trash2, CheckCircle2, ShieldAlert, ArrowRight, Zap, RefreshCw, UserCheck, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface SiteOption {
  id: string;
  name: string;
}

interface SandboxModalProps {
  sites?: SiteOption[];
  onDataChanged?: () => void;
}

export function AutomationSandboxModal({ sites = [], onDataChanged }: SandboxModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<string>("critical_outage");
  const [siteOptions, setSiteOptions] = useState<SiteOption[]>(sites);
  const [selectedSiteId, setSelectedSiteId] = useState<string>(sites[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [clearMessage, setClearMessage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSites() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from("sites").select("id, name").order("name");
        if (!error && data && data.length > 0) {
          setSiteOptions(data);
          if (!selectedSiteId) {
            setSelectedSiteId(data[0].id);
          }
        }
      } catch (e) {
        console.error("Failed to load sites for sandbox:", e);
      }
    }
    fetchSites();
  }, []);

  useEffect(() => {
    if (siteOptions.length > 0 && !selectedSiteId) {
      setSelectedSiteId(siteOptions[0].id);
    }
  }, [siteOptions, selectedSiteId]);

  const scenarios = [
    {
      id: "critical_outage",
      title: "Critical Inverter Shutdown (P1)",
      badge: "DISPATCH IMMEDIATELY",
      badgeVariant: "destructive" as const,
      desc: "Simulates sudden inverter isolation failure. Expects immediate P1 ticket & nearest technician dispatch.",
      code: "SOLIS_ERR_01",
    },
    {
      id: "string_underperformance",
      title: "String Underperformance (P2)",
      badge: "SCHEDULED DISPATCH",
      badgeVariant: "warning" as const,
      desc: "Simulates 35% string voltage drop. Expects P2 ticket & routine daily route dispatch.",
      code: "SUNGROW_STR_03",
    },
    {
      id: "human_review",
      title: "Ambiguous Telemetry Anomaly (P3)",
      badge: "HUMAN REVIEW REQUIRED",
      badgeVariant: "secondary" as const,
      desc: "Simulates telemetry sensor drift. Expects ticket queued for admin review before dispatch.",
      code: "TELEMETRY_DRIFT",
    },
    {
      id: "grid_failure",
      title: "External Grid Downtime",
      badge: "NOTIFY ONLY",
      badgeVariant: "outline" as const,
      desc: "Simulates DISCOM feeder outage. Expects notification without physical technician visit.",
      code: "GRID_OUTAGE_01",
    },
    {
      id: "recurring_escalate",
      title: "Recurring Fault (4th in 7 Days)",
      badge: "ESCALATE TO SENIOR ENG",
      badgeVariant: "destructive" as const,
      desc: "Simulates 4th repeat fault in 7 days. Expects mandatory escalation to senior engineering.",
      code: "RECURRING_FAULT_01",
    },
  ];

  const handleSimulate = async () => {
    setLoading(true);
    setClearMessage(null);
    setResult(null);

    try {
      const res = await fetch("/api/automation/sandbox/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario: selectedScenario,
          site_id: selectedSiteId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Simulation failed");
      }

      setResult(data);
      router.refresh();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      alert(`Simulation failed: ${err?.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClearDemoData = async () => {
    if (!confirm("Are you sure you want to delete all simulated demo test alerts, tickets, and work orders? Operational data will not be touched.")) {
      return;
    }

    setClearLoading(true);
    try {
      const res = await fetch("/api/automation/sandbox/clear", {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Clear failed");
      }

      setResult(null);
      setClearMessage(data.message);
      router.refresh();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      alert(`Failed to clear demo data: ${err?.message}`);
    } finally {
      setClearLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs font-semibold border-primary/30 text-primary hover:bg-primary/10 shadow-sm">
          <FlaskConical className="h-3.5 w-3.5" />
          <span>Test Automation Sandbox</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader className="space-y-1.5 pb-2 border-b">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Reactive O&M Automation Testing Sandbox</DialogTitle>
              <DialogDescription className="text-xs">
                Safely simulate OEM telemetry fault alarms and test automated decision dispatches in isolated sandbox mode.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 pt-3">
          {/* Site Selector if multiple sites exist */}
          {siteOptions.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Select Target Site for Simulation
              </label>
              <select
                value={selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm font-medium"
              >
                {siteOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Scenario Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Select Test Automation Scenario
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {scenarios.map((sc) => {
                const isSelected = selectedScenario === sc.id;
                return (
                  <div
                    key={sc.id}
                    onClick={() => setSelectedScenario(sc.id)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm"
                        : "border-border/60 bg-card hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-semibold text-xs text-foreground">{sc.title}</span>
                      <Badge variant={sc.badgeVariant} className="text-[9px] px-1.5 py-0 font-bold uppercase shrink-0">
                        {sc.badge}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">{sc.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Control Buttons */}
          <div className="flex items-center justify-between pt-2 border-t">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleClearDemoData}
              disabled={clearLoading || loading}
              className="h-8 text-xs gap-1.5 font-semibold"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{clearLoading ? "Clearing..." : "Clear Demo Test Data"}</span>
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleSimulate}
              disabled={loading || clearLoading}
              className="h-9 px-4 text-xs gap-1.5 font-bold shadow-sm"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Executing Decision Engine...</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Run Automation Simulation</span>
                </>
              )}
            </Button>
          </div>

          {/* Clear Success Message */}
          {clearMessage && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{clearMessage}</span>
            </div>
          )}

          {/* Live Result Execution Timeline */}
          {result && (
            <div className="space-y-3 pt-2 border-t animate-in fade-in-50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
                  Simulation Execution Result
                </span>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {result.site_name}
                </Badge>
              </div>

              {/* Execution Steps */}
              <div className="space-y-2.5">
                {/* Step 1: Alert Triggered */}
                <div className="p-3 rounded-xl border bg-card/60 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Step 1 · Telemetry Alert Triggered
                    </span>
                    <h5 className="font-semibold text-xs text-foreground">{result.alert?.title}</h5>
                    <p className="text-[11px] font-mono text-muted-foreground">
                      Code: {result.alert?.code} · Severity: {result.alert?.severity?.toUpperCase()}
                    </p>
                  </div>
                </div>

                {/* Step 2: Decision Engine Classification */}
                <div className="p-3 rounded-xl border bg-card/60 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Step 2 · Action Decision Engine Evaluation
                      </span>
                      <Badge className="text-[10px] font-mono font-bold">
                        {result.automation_result?.confidence_pct}% Confidence
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="font-mono text-xs">
                        {result.automation_result?.decision_class}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {result.automation_result?.reasoning}
                    </p>
                  </div>
                </div>

                {/* Step 3: Ticket Creation */}
                {result.ticket && (
                  <div className="p-3 rounded-xl border bg-card/60 flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Step 3 · Automated Ticket Created
                      </span>
                      <h5 className="font-semibold text-xs text-foreground">{result.ticket.title}</h5>
                      <p className="text-[11px] font-mono text-muted-foreground">
                        Priority: {result.ticket.priority?.toUpperCase()} · Ticket ID: #{result.ticket.id?.slice(0, 8)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Step 4: GPS Technician Matching & Dispatch */}
                {result.work_order ? (
                  <div className="p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/20 text-foreground flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                      <UserCheck className="h-4 w-4" />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        Step 4 · Technician GPS Matched & Dispatched
                      </span>
                      <h5 className="font-semibold text-xs">
                        Assigned Tech: {result.assigned_technician?.full_name || "Assigned Technician"}
                      </h5>
                      <p className="text-[11px] font-mono text-muted-foreground">
                        Job Status: {result.work_order.status?.toUpperCase()} · Scheduled Date: {result.work_order.scheduled_date}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl border bg-muted/30 text-muted-foreground flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted text-muted-foreground shrink-0">
                      <ArrowRight className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider">
                        Step 4 · Dispatch Decision
                      </span>
                      <p className="text-xs font-medium">
                        {result.automation_result?.decision_class === "HUMAN_REVIEW"
                          ? "Physical dispatch deferred — ticket queued for admin manual review."
                          : result.automation_result?.decision_class === "NOTIFY"
                          ? "External grid failure — no physical field technician visit required."
                          : "Senior engineering escalation queued."}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
