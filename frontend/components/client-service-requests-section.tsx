"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Check
} from "lucide-react";
import type { ClientServiceRequest } from "@/lib/client-sanitizer";
import { ClientEvidenceViewer } from "@/components/client-evidence-viewer";
import { formatDateTime } from "@/lib/utils";

interface ClientServiceRequestsSectionProps {
  serviceRequests: ClientServiceRequest[];
  title?: string;
  description?: string;
}

export function ClientServiceRequestsSection({
  serviceRequests,
  title = "Service Requests & Operational Care",
  description = "Transparent lifecycle tracking from automated fault detection to field intervention and telemetry verification.",
}: ClientServiceRequestsSectionProps) {
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
        req.statusLabel.toLowerCase().includes(q)
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

  return (
    <Card className="border shadow-sm overflow-hidden">
      <CardHeader className="pb-3 border-b bg-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-semibold">{title}</CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              {description}
            </CardDescription>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 self-start md:self-auto">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
              className="text-xs h-7 px-2.5"
            >
              All ({serviceRequests.length})
            </Button>
            <Button
              variant={filter === "active" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("active")}
              className="text-xs h-7 px-2.5"
            >
              Active ({activeCount})
            </Button>
            <Button
              variant={filter === "resolved" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("resolved")}
              className="text-xs h-7 px-2.5"
            >
              Resolved ({resolvedCount})
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {filteredRequests.length === 0 ? (
          <div className="p-8 text-center border rounded-xl bg-accent/20 space-y-2">
            <ShieldCheck className="h-8 w-8 text-emerald-500 mx-auto" />
            <div className="text-sm font-semibold text-foreground">No Service Requests In This View</div>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {filter === "active"
                ? "All solar installations are operating within normal baseline. No active field interventions required."
                : "No service request records matching your filter."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRequests.map((req) => {
              const hasPhotos = Boolean(req.beforePhotoUrl || req.afterPhotoUrl);

              return (
                <div
                  key={req.id}
                  className="p-4 border rounded-xl bg-card hover:border-primary/40 transition-colors space-y-3.5"
                >
                  {/* Top Bar: Identifier, Site, Status Badge */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-foreground bg-muted px-2 py-0.5 rounded">
                        {req.ticketNumber}
                      </span>
                      <span className="text-xs font-medium text-foreground">{req.siteName}</span>
                      <span className="text-xs text-muted-foreground">• {req.macroCategory}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {formatDateTime(req.updatedAt)}
                      </span>
                      <Badge variant={req.statusBadgeVariant} className="text-xs capitalize">
                        {req.statusLabel}
                      </Badge>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div className="space-y-1">
                    <h3 className="font-semibold text-sm text-foreground">{req.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{req.explanation}</p>
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
                    <div className="bg-muted/40 p-3 rounded-lg border text-xs space-y-1.5">
                      <div className="font-semibold text-[11px] text-foreground flex items-center gap-1.5">
                        <Activity className="h-3.5 w-3.5 text-primary" />
                        Operational Verification Findings
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
                        <Camera className="h-3 w-3" /> Service Proof Photos Available
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
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
