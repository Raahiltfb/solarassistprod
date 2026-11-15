"use client";

import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Wrench, 
  CheckCircle2, 
  Clock, 
  Activity, 
  ShieldCheck, 
  AlertCircle, 
  Camera, 
  Search, 
  Info, 
  ChevronDown, 
  ChevronUp,
  Cpu,
  UserCheck,
  Calendar,
  Layers,
  Sparkles
} from "lucide-react";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  CartesianGrid 
} from "recharts";
import type { ClientServiceRequest } from "@/lib/client-sanitizer";
import { ClientEvidenceViewer } from "@/components/client-evidence-viewer";
import { formatDateTime, formatDate } from "@/lib/utils";

interface ClientServiceRequestsSectionProps {
  serviceRequests: ClientServiceRequest[];
  title?: string;
  description?: string;
  defaultCollapsed?: boolean;
}

export function ClientServiceRequestsSection({
  serviceRequests,
  title = "System Operational Log & Service Care",
  description = "Factual operational history tracking automated telemetry normalization, operator supervision, and recorded physical technician interventions.",
  defaultCollapsed = true,
}: ClientServiceRequestsSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [filter, setFilter] = useState<"all" | "active" | "automated" | "technician">("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Factual resolution categorizations
  const activeCount = serviceRequests.filter(
    (r) => r.status !== "auto_resolved" && r.status !== "physically_resolved"
  ).length;

  const autoResolvedCount = serviceRequests.filter(
    (r) => r.status === "auto_resolved" || r.resolutionType === "automated"
  ).length;

  const physicallyResolvedCount = serviceRequests.filter(
    (r) => r.status === "physically_resolved" || r.resolutionType === "technician"
  ).length;

  // Filter requests
  const filteredRequests = useMemo(() => {
    return serviceRequests.filter((req) => {
      const isAuto = req.status === "auto_resolved" || req.resolutionType === "automated";
      const isPhys = req.status === "physically_resolved" || req.resolutionType === "technician";
      const isActive = !isAuto && !isPhys;

      if (filter === "active" && !isActive) return false;
      if (filter === "automated" && !isAuto) return false;
      if (filter === "technician" && !isPhys) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          req.ticketNumber.toLowerCase().includes(q) ||
          req.title.toLowerCase().includes(q) ||
          req.siteName.toLowerCase().includes(q) ||
          req.statusLabel.toLowerCase().includes(q) ||
          req.actionTakenLabel.toLowerCase().includes(q) ||
          (req.whatIsGoingOn && req.whatIsGoingOn.toLowerCase().includes(q)) ||
          (req.whatSaIsDoing && req.whatSaIsDoing.toLowerCase().includes(q)) ||
          (req.explanation && req.explanation.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [serviceRequests, filter, searchTerm]);

  // Generate monthly/periodic graph data distinguishing Automated Telemetry vs Physical Interventions vs Active
  const chartData = useMemo(() => {
    const buckets: Record<string, { period: string; automated: number; technician: number; active: number }> = {};

    serviceRequests.forEach((req) => {
      const dateStr = req.createdAt || req.updatedAt || new Date().toISOString();
      const d = new Date(dateStr);
      // Format as Month Year (e.g., Nov 2026 or Oct 2026)
      const periodKey = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

      if (!buckets[periodKey]) {
        buckets[periodKey] = { period: periodKey, automated: 0, technician: 0, active: 0 };
      }

      if (req.status === "auto_resolved" || req.resolutionType === "automated") {
        buckets[periodKey].automated += 1;
      } else if (req.status === "physically_resolved" || req.resolutionType === "technician") {
        buckets[periodKey].technician += 1;
      } else {
        buckets[periodKey].active += 1;
      }
    });

    return Object.values(buckets);
  }, [serviceRequests]);

  const mostRecentActive = serviceRequests.find(
    (r) => r.status !== "auto_resolved" && r.status !== "physically_resolved"
  ) || serviceRequests[0];

  const renderRequestCard = (req: ClientServiceRequest) => {
    const hasPhotos = Boolean(req.beforePhotoUrl || req.afterPhotoUrl);
    const isAuto = req.status === "auto_resolved" || req.resolutionType === "automated";
    const isPhys = req.status === "physically_resolved" || req.resolutionType === "technician";
    const isAck = req.status === "acknowledged";

    return (
      <div
        key={req.id}
        className="p-4 border rounded-xl bg-card hover:border-primary/40 transition-colors space-y-3.5 shadow-sm"
      >
        {/* Top Bar: Identifier, Site, Action Status Badge */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-foreground bg-muted px-2 py-0.5 rounded border">
              {req.ticketNumber}
            </span>
            <span className="text-xs font-semibold text-foreground">{req.siteName}</span>
            <span className="text-xs text-muted-foreground">•</span>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold">
              {req.macroCategory}
            </Badge>

            {/* Resolution Mode Tag */}
            {isAuto && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <Cpu className="h-3 w-3 shrink-0" /> Automated Telemetry Resolution
              </span>
            )}
            {isPhys && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                <Wrench className="h-3 w-3 shrink-0" /> Field Technician Service
              </span>
            )}
            {isAck && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                <UserCheck className="h-3 w-3 shrink-0" /> Operator Acknowledged
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground font-mono">
              {formatDateTime(req.updatedAt)}
            </span>
            <Badge variant={req.statusBadgeVariant} className="text-xs capitalize">
              {req.statusLabel}
            </Badge>
          </div>
        </div>

        {/* Title & Action Taken Headline */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-primary shrink-0" />
            {req.title}
          </h3>
          <span className="text-xs font-medium text-muted-foreground">
            Action: <strong className="text-foreground">{req.actionTakenLabel}</strong>
          </span>
        </div>

        {/* Semi-Technical Explainability Panels: What is going on & What SA is doing */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-0.5">
          <div className="bg-muted/40 p-3 rounded-lg border border-border/60 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span>What is going on</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {req.whatIsGoingOn || req.explanation}
            </p>
          </div>

          <div className="bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/20 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span>What Solar Assist is doing</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {req.whatSaIsDoing || "Solar Assist automated telemetry engine and 24/7 O&M team are supervising resolution and verifying power generation."}
            </p>
          </div>
        </div>

        {/* Dynamic Workflow Progress Steps based on REAL actions */}
        <div className="pt-1">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-1">
            Operational Lifecycle & Execution Path:
          </div>
          <div className={`grid gap-1.5 text-center ${
            req.workflowSteps.length === 3 ? "grid-cols-3" :
            req.workflowSteps.length === 4 ? "grid-cols-4" :
            req.workflowSteps.length === 5 ? "grid-cols-5" : "grid-cols-2"
          }`}>
            {req.workflowSteps.map((st, sIdx) => {
              const isCompleted = st.status === "completed";
              const isCurrent = st.status === "current";

              return (
                <div key={sIdx} className="space-y-1 p-1 rounded bg-muted/20 border border-border/40">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      isCompleted
                        ? "bg-emerald-500"
                        : isCurrent
                        ? "bg-primary animate-pulse"
                        : "bg-muted"
                    }`}
                  />
                  <div
                    className={`text-[10px] font-medium leading-tight ${
                      isCompleted
                        ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                        : isCurrent
                        ? "text-primary font-bold"
                        : "text-muted-foreground"
                    }`}
                  >
                    {st.label}
                  </div>
                  <div className="text-[9px] text-muted-foreground leading-tight hidden sm:block">
                    {st.desc}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Resolution Statement (Automated Recovery Notice vs Physical Completion) */}
        {isAuto && (
          <div className="bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/25 text-xs flex items-start gap-2">
            <Cpu className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                Automated Resolution Confirmed
              </span>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Subsequent inverter telemetry indicates that the condition has returned to normal baseline. No physical intervention was recorded.
              </p>
            </div>
          </div>
        )}

        {isPhys && (
          <div className="bg-blue-500/10 p-2.5 rounded-lg border border-blue-500/25 text-xs flex items-start gap-2">
            <Wrench className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-blue-700 dark:text-blue-400">
                Physical Field Service Completed
              </span>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                A qualified solar technician was dispatched, performed physical work on site, and recorded photographic verification.
              </p>
            </div>
          </div>
        )}

        {/* Operational Findings / Telemetry Metrics */}
        {(req.preRepairMetric || req.postRepairMetric || req.technicianFindings) && (
          <div className="bg-muted/30 p-3 rounded-lg border text-xs space-y-1.5">
            <div className="font-semibold text-[11px] text-foreground flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-primary" />
              Operational Findings & Recovery Proof
            </div>

            {req.preRepairMetric && (
              <div className="text-muted-foreground flex items-start gap-2">
                <span className="font-medium text-foreground shrink-0">Pre-Service State:</span>
                <span>{req.preRepairMetric}</span>
              </div>
            )}

            {req.postRepairMetric && (
              <div className="text-muted-foreground flex items-start gap-2">
                <span className="font-medium text-emerald-600 dark:text-emerald-400 shrink-0">Verified Metric:</span>
                <span className="font-medium text-foreground">{req.postRepairMetric}</span>
              </div>
            )}

            {req.technicianFindings && (
              <div className="text-muted-foreground flex items-start gap-2 pt-1 border-t">
                <span className="font-medium text-foreground shrink-0">Technician Remarks:</span>
                <span>{req.technicianFindings}</span>
              </div>
            )}
          </div>
        )}

        {/* Photo Evidence Section */}
        {hasPhotos && (
          <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t text-xs">
            <span className="text-muted-foreground text-[11px] flex items-center gap-1">
              <Camera className="h-3 w-3" /> Photographic Inspection Proof Available
            </span>
            <ClientEvidenceViewer
              title={`Service Evidence • ${req.ticketNumber}`}
              subtitle={`Photographic inspection proof recorded for ${req.siteName}`}
              beforePhotoUrl={req.beforePhotoUrl}
              afterPhotoUrl={req.afterPhotoUrl}
              remarks={req.technicianFindings}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="border shadow-sm overflow-hidden" data-testid="client-service-requests-section">
      <CardHeader className="pb-3 border-b bg-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-semibold">{title}</CardTitle>
              <Badge variant="outline" className="text-xs font-mono ml-1">
                {serviceRequests.length} Total Events
              </Badge>
              {activeCount > 0 && (
                <Badge variant="warning" className="text-xs">
                  {activeCount} Active
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              {description}
            </CardDescription>
          </div>

          {/* Toggle Collapse & Filter Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-xs h-7 px-2.5 gap-1.5 font-medium"
            >
              <span>{isCollapsed ? `Open Operational History (${serviceRequests.length})` : "Collapse History"}</span>
              {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </Button>

            {!isCollapsed && (
              <div className="flex items-center gap-1 flex-wrap">
                <Button
                  variant={filter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("all")}
                  className="text-xs h-7 px-2"
                >
                  All ({serviceRequests.length})
                </Button>
                <Button
                  variant={filter === "active" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("active")}
                  className="text-xs h-7 px-2"
                >
                  Active ({activeCount})
                </Button>
                <Button
                  variant={filter === "automated" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("automated")}
                  className="text-xs h-7 px-2 text-emerald-600 dark:text-emerald-400"
                >
                  Automated ({autoResolvedCount})
                </Button>
                <Button
                  variant={filter === "technician" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("technician")}
                  className="text-xs h-7 px-2 text-blue-600 dark:text-blue-400"
                >
                  Technician ({physicallyResolvedCount})
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Summary Metrics Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
          <div className="p-2.5 rounded-lg border bg-muted/20 space-y-0.5">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Total Logged</span>
            <div className="text-lg font-bold font-mono text-foreground">{serviceRequests.length}</div>
            <div className="text-[10px] text-muted-foreground">Historical records</div>
          </div>
          <div className="p-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 space-y-0.5">
            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 uppercase font-semibold flex items-center gap-1">
              <Cpu className="h-3 w-3" /> Auto Recoveries
            </span>
            <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">{autoResolvedCount}</div>
            <div className="text-[10px] text-muted-foreground">Zero physical work required</div>
          </div>
          <div className="p-2.5 rounded-lg border border-blue-500/20 bg-blue-500/5 space-y-0.5">
            <span className="text-[10px] text-blue-700 dark:text-blue-400 uppercase font-semibold flex items-center gap-1">
              <Wrench className="h-3 w-3" /> Field Interventions
            </span>
            <div className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400">{physicallyResolvedCount}</div>
            <div className="text-[10px] text-muted-foreground">On-site work completed</div>
          </div>
          <div className="p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 space-y-0.5">
            <span className="text-[10px] text-amber-700 dark:text-amber-400 uppercase font-semibold flex items-center gap-1">
              <Clock className="h-3 w-3" /> Under Supervision
            </span>
            <div className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400">{activeCount}</div>
            <div className="text-[10px] text-muted-foreground">Monitored 24/7</div>
          </div>
        </div>

        {/* Major Fault History & Resolution Graph */}
        {chartData.length > 0 && !isCollapsed && (
          <div className="pt-3 border-t mt-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" />
                Operational History & Resolution Mode Breakdown
              </span>
              <span className="text-[11px] text-muted-foreground">
                Automated telemetry recovery vs physical technician work
              </span>
            </div>
            <div className="h-44 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                  <XAxis dataKey="period" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))", 
                      borderColor: "hsl(var(--border))", 
                      fontSize: "11px",
                      borderRadius: "8px"
                    }} 
                  />
                  <Legend 
                    wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }}
                    formatter={(value) => {
                      if (value === "automated") return "Automated Telemetry Recovery";
                      if (value === "technician") return "Field Technician Service";
                      return "Active Monitored";
                    }}
                  />
                  <Bar dataKey="automated" name="automated" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="technician" name="technician" fill="#3b82f6" radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="active" name="active" fill="#f59e0b" radius={[4, 4, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {!isCollapsed && serviceRequests.length > 2 && (
          <div className="mt-3 relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by issue type, error description, site name, action taken, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-8 text-xs bg-muted/40"
            />
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {serviceRequests.length === 0 ? (
          <div className="p-8 text-center border rounded-xl bg-accent/20 space-y-2">
            <ShieldCheck className="h-8 w-8 text-emerald-500 mx-auto" />
            <div className="text-sm font-semibold text-foreground">Zero Operational Issues Recorded</div>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              All solar installations are operating within normal baseline. No active operational faults detected.
            </p>
          </div>
        ) : isCollapsed ? (
          // Collapsed State: Show only the most recent / active issue
          <div className="space-y-3">
            {mostRecentActive ? (
              <>
                <div className="flex items-center justify-between text-xs text-muted-foreground pb-1">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-primary" />
                    {activeCount > 0 ? "Active Operational Item Under Supervision" : "Most Recent Service Record"}
                  </span>
                  <span className="text-[11px]">
                    History collapsed ({serviceRequests.length - 1} earlier records hidden)
                  </span>
                </div>
                {renderRequestCard(mostRecentActive)}
                {serviceRequests.length > 1 && (
                  <div className="pt-1 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsCollapsed(false)}
                      className="text-xs text-primary hover:text-primary hover:bg-primary/5 gap-1.5"
                    >
                      <span>Click to open full operational history ({serviceRequests.length} total records)</span>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </>
            ) : null}
          </div>
        ) : (
          // Expanded State: Show all filtered requests with search
          <div className="space-y-3">
            {filteredRequests.length === 0 ? (
              <div className="p-6 text-center border rounded-xl text-xs text-muted-foreground">
                No service records match your current filter or search criteria.
              </div>
            ) : (
              filteredRequests.map(renderRequestCard)
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
