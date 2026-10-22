"use client";

import React, { useState } from "react";
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
  ArrowRight, 
  RefreshCw,
  Search,
  Check,
  Info,
  Radio,
  Zap,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import type { ClientServiceRequest } from "@/lib/client-sanitizer";
import { ClientEvidenceViewer } from "@/components/client-evidence-viewer";
import { formatDateTime } from "@/lib/utils";

interface ClientServiceRequestsSectionProps {
  serviceRequests: ClientServiceRequest[];
  title?: string;
  description?: string;
  defaultCollapsed?: boolean;
}

export function ClientServiceRequestsSection({
  serviceRequests,
  title = "System Operational Log & Service Care",
  description = "Transparent operational tracking from automated fault detection to field intervention and telemetry recovery verification.",
  defaultCollapsed = true,
}: ClientServiceRequestsSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [filter, setFilter] = useState<"all" | "active" | "resolved">("all");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredRequests = serviceRequests.filter((req) => {
    const isResolved = req.status === "resolved";
    if (filter === "active" && isResolved) return false;
    if (filter === "resolved" && !isResolved) return false;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        req.ticketNumber.toLowerCase().includes(q) ||
        req.title.toLowerCase().includes(q) ||
        req.siteName.toLowerCase().includes(q) ||
        req.statusLabel.toLowerCase().includes(q) ||
        (req.whatIsGoingOn && req.whatIsGoingOn.toLowerCase().includes(q)) ||
        (req.whatSaIsDoing && req.whatSaIsDoing.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const activeCount = serviceRequests.filter((r) => r.status !== "resolved").length;
  const resolvedCount = serviceRequests.filter((r) => r.status === "resolved").length;

  const getStepStatus = (
    currentStatus: ClientServiceRequest["status"],
    stepIndex: number
  ): "completed" | "current" | "upcoming" => {
    const statusOrder: Record<ClientServiceRequest["status"], number> = {
      reported: 0,
      dispatched: 1,
      on_site: 2,
      verifying: 3,
      resolved: 4,
      follow_up: 2, // Reopened/follow-up cycles back to intervention
    };

    const currentOrder = statusOrder[currentStatus] ?? 0;
    if (currentStatus === "resolved") return "completed";
    if (currentOrder > stepIndex) return "completed";
    if (currentOrder === stepIndex) return "current";
    return "upcoming";
  };

  const steps = [
    { label: "1. Detected", desc: "Monitored 24/7" },
    { label: "2. Dispatched", desc: "Engineer Assigned" },
    { label: "3. On Site", desc: "Physical Work" },
    { label: "4. Verifying", desc: "Telemetry Check" },
    { label: "5. Resolved", desc: "Verified Safe" },
  ];

  const mostRecentActive = serviceRequests.find((r) => r.status !== "resolved") || serviceRequests[0];

  const renderRequestCard = (req: ClientServiceRequest) => {
    const hasPhotos = Boolean(req.beforePhotoUrl || req.afterPhotoUrl);

    return (
      <div
        key={req.id}
        className="p-4 border rounded-xl bg-card hover:border-primary/40 transition-colors space-y-3.5 shadow-sm"
      >
        {/* Top Bar: Identifier, Site, Status Badge */}
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

        {/* Title */}
        <div>
          <h3 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-primary shrink-0" />
            {req.title}
          </h3>
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

        {/* 5-Step Progress Bar */}
        <div className="pt-1">
          <div className="grid grid-cols-5 gap-1 text-center">
            {steps.map((st, sIdx) => {
              const stepState = getStepStatus(req.status, sIdx);
              const isCompleted = stepState === "completed";
              const isCurrent = stepState === "current";

              return (
                <div key={sIdx} className="space-y-1">
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
                  <div className="text-[9px] text-muted-foreground hidden sm:block">
                    {st.desc}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

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
                {serviceRequests.length} Events
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
              <span>{isCollapsed ? `Open History (${serviceRequests.length})` : "Collapse History"}</span>
              {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </Button>

            {!isCollapsed && (
              <div className="flex items-center gap-1">
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
                  variant={filter === "resolved" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("resolved")}
                  className="text-xs h-7 px-2"
                >
                  Resolved ({resolvedCount})
                </Button>
              </div>
            )}
          </div>
        </div>

        {!isCollapsed && serviceRequests.length > 2 && (
          <div className="mt-3 relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by issue type, error description, site name, or ID..."
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
                    {activeCount > 0 ? "Active Operational Item" : "Most Recent Service Record"}
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
                      <span>Click to open full history ({serviceRequests.length} total records)</span>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </>
            ) : null}
          </div>
        ) : (
          // Expanded State: Show all filtered requests with search
          <>
            {filteredRequests.length === 0 ? (
              <div className="p-8 text-center border rounded-xl bg-accent/20 space-y-2">
                <ShieldCheck className="h-8 w-8 text-emerald-500 mx-auto" />
                <div className="text-sm font-semibold text-foreground">No Items In This Filter</div>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {filter === "active"
                    ? "No active operational faults currently open."
                    : "No records matching your search or filter."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredRequests.map(renderRequestCard)}
              </div>
            )}

            <div className="pt-2 flex justify-center border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCollapsed(true)}
                className="text-xs h-7 px-3 gap-1.5 text-muted-foreground"
              >
                <span>Collapse Operational History</span>
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
