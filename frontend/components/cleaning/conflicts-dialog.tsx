"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, ShieldAlert, CheckCircle2, MapPin, Calendar, Clock, Wrench } from "lucide-react";
import { Site, SiteCleaningRule, TechnicianTeam, CleaningPlanAssignment } from "@/lib/types";

export interface ConflictItem {
  id: string;
  siteName: string;
  location: string;
  affectedDate: string;
  teamName: string;
  category: "Capacity" | "Allowed weekday" | "Blackout" | "Monthly visit limit" | "Physical-location batching" | "Missing configuration" | "Other";
  whyItConflicts: string;
  currentScheduledState: string;
  ruleInvolved: string;
  validAlternatives: string;
  recommendedAction: string;
  canAutoResolve: boolean;
}

interface ConflictsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sites: Site[];
  rules: SiteCleaningRule[];
  teams: TechnicianTeam[];
  assignments: CleaningPlanAssignment[];
  unconfiguredSites?: Site[];
  unscheduledSites?: Array<{ site: Site; targetDate: string; reason: string }>;
  onResolveConflict?: (siteId: string) => void;
}

export function ConflictsDialog({
  open,
  onOpenChange,
  sites,
  rules,
  teams,
  assignments,
  unconfiguredSites = [],
  unscheduledSites = [],
  onResolveConflict,
}: ConflictsDialogProps) {
  const ruleMap = new Map<string, SiteCleaningRule>();
  rules.forEach((r) => ruleMap.set(r.site_id, r));

  const conflicts: ConflictItem[] = [];

  // 1. Unconfigured Sites
  unconfiguredSites.forEach((site) => {
    conflicts.push({
      id: `unconfig-${site.id}`,
      siteName: site.name,
      location: site.location || "Site Location",
      affectedDate: "Unscheduled",
      teamName: "Unassigned",
      category: "Missing configuration",
      whyItConflicts: "Site cleaning rules have not been configured for this site.",
      currentScheduledState: "Unconfigured / Draft",
      ruleInvolved: "No active site_cleaning_rules record",
      validAlternatives: "Configure site rules with allowed weekdays & duration",
      recommendedAction: "Click 'Configure Rules' to set routine interval and allowed weekdays.",
      canAutoResolve: false,
    });
  });

  // 2. Unscheduled Visits
  unscheduledSites.forEach((un, i) => {
    conflicts.push({
      id: `unsched-${un.site.id}-${i}`,
      siteName: un.site.name,
      location: un.site.location || "Site Location",
      affectedDate: un.targetDate,
      teamName: "Unassigned",
      category: "Capacity",
      whyItConflicts: un.reason || "Unable to place visit within tolerance without capacity or weekday conflict.",
      currentScheduledState: "Unscheduled Bottleneck",
      ruleInvolved: "480 min daily team capacity & physical location batching",
      validAlternatives: "Target date ± 2 days or assign second team",
      recommendedAction: "Drag visit to adjacent allowed weekday or adjust team capacity.",
      canAutoResolve: true,
    });
  });

  // 3. Assignments with warnings or blocking states
  assignments.forEach((assign) => {
    if (assign.constraint_state !== "valid" && assign.constraint_notes) {
      const site = assign.sites || sites.find((s) => s.id === assign.site_id);
      const team = assign.technician_teams || teams.find((t) => t.id === assign.team_id);
      const rule = ruleMap.get(assign.site_id);

      let cat: ConflictItem["category"] = "Other";
      const notesLower = assign.constraint_notes.toLowerCase();

      if (notesLower.includes("allowed days") || notesLower.includes("weekday")) {
        cat = "Allowed weekday";
      } else if (notesLower.includes("blackout")) {
        cat = "Blackout";
      } else if (notesLower.includes("exceeds") || notesLower.includes("capacity") || notesLower.includes("workload")) {
        cat = "Capacity";
      } else if (notesLower.includes("3 cleaning visits") || notesLower.includes("monthly")) {
        cat = "Monthly visit limit";
      } else if (notesLower.includes("batching") || notesLower.includes("group")) {
        cat = "Physical-location batching";
      }

      conflicts.push({
        id: `assign-${assign.id}`,
        siteName: site?.name || "Site",
        location: site?.location || "Location",
        affectedDate: assign.scheduled_date,
        teamName: team?.name || "Team",
        category: cat,
        whyItConflicts: assign.constraint_notes,
        currentScheduledState: assign.constraint_state.toUpperCase(),
        ruleInvolved: rule
          ? `Allowed Days: ${rule.allowed_weekdays?.join(",") || "All"}, Est: ${rule.estimated_cleaning_mins}m`
          : "Standard Policy",
        validAlternatives: "Reschedule to adjacent weekday or rebalance team",
        recommendedAction: "Use Drag & Drop planner to move visit to a green highlighted date cell.",
        canAutoResolve: true,
      });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-display font-bold">
            <ShieldAlert className="h-6 w-6 text-amber-500" />
            Actionable Schedule Conflicts ({conflicts.length})
          </DialogTitle>
          <DialogDescription>
            Review operational bottlenecks, capacity warnings, and rule exceptions for the active monthly plan.
          </DialogDescription>
        </DialogHeader>

        {conflicts.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            <h3 className="font-semibold text-base">No Operational Conflicts Detected</h3>
            <p className="text-xs text-muted-foreground">All site visits satisfy allowed weekdays, capacity limits, and physical batching rules.</p>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {conflicts.map((item) => (
              <div
                key={item.id}
                className="p-4 border rounded-xl space-y-3 bg-card/60 hover:bg-card transition shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-foreground">{item.siteName}</span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      <MapPin className="h-3 w-3 mr-1 text-primary inline" />
                      {item.location}
                    </Badge>
                  </div>
                  <Badge
                    variant={item.category === "Capacity" ? "warning" : "destructive"}
                    className="uppercase text-[10px] font-mono tracking-wide"
                  >
                    {item.category}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1 bg-muted/40 p-2.5 rounded-lg border">
                    <div className="text-muted-foreground font-medium">Why It Conflicts:</div>
                    <div className="font-medium text-foreground">{item.whyItConflicts}</div>
                    <div className="text-muted-foreground pt-1">
                      <strong className="text-foreground">Rule Involved:</strong> {item.ruleInvolved}
                    </div>
                  </div>

                  <div className="space-y-1 bg-muted/40 p-2.5 rounded-lg border">
                    <div className="text-muted-foreground font-medium">Operational Context:</div>
                    <div>
                      <span className="text-muted-foreground">Affected Date:</span>{" "}
                      <strong className="font-mono text-foreground">{item.affectedDate}</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Assigned Team:</span>{" "}
                      <strong className="text-foreground">{item.teamName}</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Valid Alternatives:</span>{" "}
                      <span className="text-emerald-600 font-medium">{item.validAlternatives}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Wrench className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span><strong>Recommended Action:</strong> {item.recommendedAction}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close Conflict Panel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
