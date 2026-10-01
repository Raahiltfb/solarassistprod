"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  AlertCircle,
  Calendar,
  Truck,
  Clock,
  Info,
  MapPin,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  UserCheck,
  Wrench,
  Edit3,
  Trash2,
  GripVertical,
  Ban,
} from "lucide-react";
import { Site, TechnicianTeam, CleaningPlanAssignment, SiteCleaningRule } from "@/lib/types";
import { validateAssignmentConstraint, getIsoWeekday } from "@/lib/cleaning-scheduler";

interface PlannerMatrixProps {
  year: number;
  month: number;
  teams: TechnicianTeam[];
  sites: Site[];
  assignments: CleaningPlanAssignment[];
  serviceRequests?: any[];
  rules?: SiteCleaningRule[];
  planningCapacityMins: number;
  schedulingToleranceDays: number;
  onUpdateAssignment: (assignmentId: string, newTeamId: string, newDateStr: string) => void;
  onRemoveAssignment: (assignmentId: string) => void;
  onAddManualAssignment: (siteId: string, teamId: string, dateStr: string) => void;
}

export function PlannerMatrix({
  year,
  month,
  teams,
  sites,
  assignments,
  serviceRequests = [],
  rules = [],
  planningCapacityMins,
  schedulingToleranceDays,
  onUpdateAssignment,
  onRemoveAssignment,
  onAddManualAssignment,
}: PlannerMatrixProps) {
  const [selectedAssignment, setSelectedAssignment] = useState<CleaningPlanAssignment | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [targetTeamId, setTargetTeamId] = useState("");
  const [targetDateStr, setTargetDateStr] = useState("");

  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualSiteId, setManualSiteId] = useState("");
  const [manualTeamId, setManualTeamId] = useState("");
  const [manualDateStr, setManualDateStr] = useState("");

  // Drag & Drop Rescheduling State
  const [draggedAssignment, setDraggedAssignment] = useState<CleaningPlanAssignment | null>(null);
  const [hoveredCellKey, setHoveredCellKey] = useState<string | null>(null);

  // Calculate days in target month
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const monthName = new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "long" });

  const ruleMap = new Map<string, SiteCleaningRule>();
  rules.forEach((r) => ruleMap.set(r.site_id, r));

  const siteMap = new Map<string, Site>();
  sites.forEach((s) => siteMap.set(s.id, s));

  // Map assignments by key `${team_id}:${dateStr}`
  const assignmentGrid = new Map<string, CleaningPlanAssignment[]>();
  assignments.forEach((a) => {
    const dateStr = a.scheduled_date.split("T")[0];
    const key = `${a.team_id}:${dateStr}`;
    const list = assignmentGrid.get(key) || [];
    list.push(a);
    assignmentGrid.set(key, list);
  });

  const srGrid = new Map<string, any[]>();
  serviceRequests.forEach((sr) => {
    const dateStr = (sr.scheduled_date || sr.created_at).split("T")[0];
    const day = parseInt(dateStr.split("-")[2], 10);
    const key = `${sr.team_id}:${day}`;
    const list = srGrid.get(key) || [];
    list.push(sr);
    srGrid.set(key, list);
  });

  // Calculate team monthly summary metrics
  const teamSummaries = teams.map((team) => {
    const teamAssigns = assignments.filter((a) => a.team_id === team.id);
    const totalVisits = teamAssigns.length;

    let totalMins = 0;
    let totalKm = 0;
    const overloadedDays = new Set<number>();

    const dayWorkloadMap = new Map<number, number>();
    teamAssigns.forEach((a) => {
      const dateStr = a.scheduled_date.split("T")[0];
      const day = parseInt(dateStr.split("-")[2], 10);
      const current = dayWorkloadMap.get(day) || 0;
      const mins = (a.estimated_cleaning_mins || 90) + (a.estimated_travel_mins || 0);
      dayWorkloadMap.set(day, current + mins);
      totalMins += mins;
      totalKm += Number(a.estimated_distance_km || 0);
    });

    dayWorkloadMap.forEach((mins, day) => {
      if (mins > planningCapacityMins) {
        overloadedDays.add(day);
      }
    });

    return {
      team,
      totalVisits,
      totalHours: (totalMins / 60).toFixed(1),
      totalKm: totalKm.toFixed(0),
      overloadedDaysCount: overloadedDays.size,
    };
  });

  // Pre-Drop Validation Helper for Drag & Drop
  function validateDragTarget(targetTeamId: string, targetDateStr: string): { isValid: boolean; reason: string } {
    if (!draggedAssignment) return { isValid: true, reason: "" };

    const site = siteMap.get(draggedAssignment.site_id) || draggedAssignment.sites;
    const rule = ruleMap.get(draggedAssignment.site_id);

    const dObj = new Date(targetDateStr + "T12:00:00");
    const isoWk = getIsoWeekday(dObj);

    // Rule 1: Allowed Weekdays Check
    if (rule?.allowed_weekdays && rule.allowed_weekdays.length > 0) {
      if (!rule.allowed_weekdays.includes(isoWk)) {
        const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        return { isValid: false, reason: `Blocked: ${dayNames[isoWk - 1]} not allowed for this site` };
      }
    }

    // Rule 2: Blackout Dates Check
    if (rule?.blackout_dates && rule.blackout_dates.includes(targetDateStr)) {
      return { isValid: false, reason: `Blocked: ${targetDateStr} is a configured site blackout date` };
    }

    // Rule 3: Team Capacity Check (480 min capacity limit)
    const existingAssigns = assignmentGrid.get(`${targetTeamId}:${targetDateStr}`) || [];
    let currentWorkloadMins = existingAssigns
      .filter((a) => a.id !== draggedAssignment.id)
      .reduce((sum, a) => sum + (a.estimated_cleaning_mins || 90) + (a.estimated_travel_mins || 0), 0);

    const newVisitMins = (draggedAssignment.estimated_cleaning_mins || 90) + (draggedAssignment.estimated_travel_mins || 15);
    if (currentWorkloadMins + newVisitMins > planningCapacityMins + 60) {
      const projectedMins = currentWorkloadMins + newVisitMins;
      return { isValid: false, reason: `Blocked: team workload (${projectedMins}m) exceeds ${planningCapacityMins}m capacity limit` };
    }

    // Rule 4: Hard Monthly Visit Limit Check (Max 3 visits per month)
    const siteMonthVisits = assignments.filter(
      (a) => a.site_id === draggedAssignment.site_id && a.id !== draggedAssignment.id
    ).length;
    if (siteMonthVisits >= 3) {
      return { isValid: false, reason: "Blocked: site would exceed 3 monthly visits limit" };
    }

    return { isValid: true, reason: "Valid placement target" };
  }

  // Drag & Drop Handlers
  function handleDragStart(e: React.DragEvent, assign: CleaningPlanAssignment) {
    setDraggedAssignment(assign);
    e.dataTransfer.setData("text/plain", assign.id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, teamId: string, dateStr: string) {
    e.preventDefault();
    const cellKey = `${teamId}:${dateStr}`;
    if (hoveredCellKey !== cellKey) {
      setHoveredCellKey(cellKey);
    }
  }

  function handleDrop(e: React.DragEvent, targetTeamId: string, targetDateStr: string) {
    e.preventDefault();
    if (!draggedAssignment) return;

    const validation = validateDragTarget(targetTeamId, targetDateStr);
    if (!validation.isValid) {
      toast.error(validation.reason);
      setDraggedAssignment(null);
      setHoveredCellKey(null);
      return;
    }

    // Perform Assignment Move
    onUpdateAssignment(draggedAssignment.id, targetTeamId, targetDateStr);
    toast.success(`Rescheduled ${draggedAssignment.sites?.name || "Visit"} to ${targetDateStr}`);
    setDraggedAssignment(null);
    setHoveredCellKey(null);
  }

  function handleOpenEdit(assign: CleaningPlanAssignment) {
    setSelectedAssignment(assign);
    setTargetTeamId(assign.team_id);
    setTargetDateStr(assign.scheduled_date);
    setEditDialogOpen(true);
  }

  function handleSaveEdit() {
    if (selectedAssignment && targetTeamId && targetDateStr) {
      onUpdateAssignment(selectedAssignment.id, targetTeamId, targetDateStr);
      setEditDialogOpen(false);
      setSelectedAssignment(null);
    }
  }

  function handleOpenManual(teamId?: string, day?: number) {
    setManualSiteId(sites[0]?.id || "");
    setManualTeamId(teamId || teams[0]?.id || "");

    const dayStr = day ? String(day).padStart(2, "0") : "01";
    const mStr = String(month).padStart(2, "0");
    setManualDateStr(`${year}-${mStr}-${dayStr}`);
    setManualDialogOpen(true);
  }

  function handleSaveManual() {
    if (manualSiteId && manualTeamId && manualDateStr) {
      onAddManualAssignment(manualSiteId, manualTeamId, manualDateStr);
      setManualDialogOpen(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="planner-matrix">
      {/* Team Monthly Summary Workload Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {teamSummaries.map(({ team, totalVisits, totalHours, totalKm, overloadedDaysCount }) => (
          <Card key={team.id} className="hover:shadow-sm transition-shadow border">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: team.color_code || "#3b82f6" }}
                  />
                  <span className="font-bold text-sm text-foreground">{team.name}</span>
                </div>
                {overloadedDaysCount > 0 ? (
                  <Badge variant="warning" className="text-[10px] px-1.5 py-0">
                    {overloadedDaysCount} Overload
                  </Badge>
                ) : (
                  <Badge variant="success" className="text-[10px] px-1.5 py-0">
                    Normal
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs font-mono border-t pt-2 text-muted-foreground">
                <div>
                  <div className="text-[10px] uppercase font-sans">Visits</div>
                  <div className="font-bold text-foreground">{totalVisits}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-sans">Hours</div>
                  <div className="font-bold text-foreground">{totalHours}h</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-sans">Travel</div>
                  <div className="font-bold text-foreground">{totalKm} km</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Interactive Matrix Calendar - High End Full-Screen Planning Board */}
      <Card className="border shadow-md overflow-hidden">
        <CardHeader className="p-4 pb-3 border-b bg-card">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                {monthName} {year} Master Workforce Planning Board
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Drag and drop cleaning cards between dates & teams to reschedule. Pre-drop safety rules prevent constraint violations.
              </CardDescription>
            </div>
            <Button size="sm" variant="default" className="text-xs h-8 gap-1.5" onClick={() => handleOpenManual()}>
              <Calendar className="h-3.5 w-3.5" />
              <span>+ Add Manual Visit</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="w-full overflow-x-auto max-h-[75vh] overflow-y-auto">
            <table className="w-full border-collapse text-xs select-none">
              <thead className="sticky top-0 z-30 bg-card border-b shadow-sm text-muted-foreground font-semibold">
                <tr>
                  <th className="sticky left-0 z-40 bg-card py-3 px-4 text-left w-56 border-r border-b text-xs font-bold shadow-sm">
                    Team / Date
                  </th>
                  {daysArray.map((day) => {
                    const dateObj = new Date(year, month - 1, day);
                    const dayOfWeek = dateObj.toLocaleString("en-IN", { weekday: "short" });
                    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

                    return (
                      <th
                        key={day}
                        className={`py-2.5 px-3 min-w-[170px] text-center border-r border-b ${
                          isWeekend ? "bg-muted/70 text-muted-foreground font-normal" : "bg-card"
                        }`}
                      >
                        <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{dayOfWeek}</div>
                        <div className="font-bold text-base text-foreground mt-0.5">{day}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y">
                {teams.map((team) => (
                  <tr key={team.id} className="hover:bg-muted/10 transition-colors">
                    {/* Sticky Team Header Column */}
                    <td className="sticky left-0 z-20 bg-card py-3 px-4 font-semibold border-r border-b space-y-1 shadow-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: team.color_code || "#3b82f6" }}
                        />
                        <span className="text-foreground font-bold text-sm truncate">{team.name}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground font-normal truncate">
                        {team.base_address || "Base MMR"}
                      </div>
                    </td>

                    {/* Generous Width Day Cells */}
                    {daysArray.map((day) => {
                      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                      const cellKey = `${team.id}:${dateStr}`;
                      const cellAssigns = assignmentGrid.get(cellKey) || [];
                      const cellSr = srGrid.get(`${team.id}:${day}`) || [];

                      let totalDayMins = 0;
                      cellAssigns.forEach(
                        (a) => (totalDayMins += (a.estimated_cleaning_mins || 90) + (a.estimated_travel_mins || 0))
                      );

                      const isOverloaded = totalDayMins > planningCapacityMins;
                      const hasBlocking = cellAssigns.some((a) => a.constraint_state === "blocking");

                      // Drag over validation state
                      const isHovered = hoveredCellKey === cellKey;
                      const validation = draggedAssignment ? validateDragTarget(team.id, dateStr) : { isValid: true, reason: "" };
                      const isValidTarget = draggedAssignment && validation.isValid;
                      const isBlockedTarget = draggedAssignment && !validation.isValid;

                      return (
                        <td
                          key={day}
                          onDragOver={(e) => handleDragOver(e, team.id, dateStr)}
                          onDrop={(e) => handleDrop(e, team.id, dateStr)}
                          onClick={() => {
                            if (cellAssigns.length > 0) {
                              handleOpenEdit(cellAssigns[0]);
                            } else {
                              handleOpenManual(team.id, day);
                            }
                          }}
                          className={`p-2 border-r border-b text-center align-top cursor-pointer transition-all min-w-[170px] ${
                            isHovered && isValidTarget
                              ? "bg-emerald-500/20 border-emerald-500 ring-2 ring-emerald-500/50"
                              : isHovered && isBlockedTarget
                              ? "bg-red-500/15 border-red-500/50 ring-2 ring-red-500/50"
                              : draggedAssignment && isValidTarget
                              ? "bg-emerald-500/5 border-dashed border-emerald-500/40"
                              : draggedAssignment && isBlockedTarget
                              ? "bg-red-500/5 opacity-50 cursor-not-allowed"
                              : isOverloaded
                              ? "bg-amber-500/10"
                              : "hover:bg-muted/20"
                          }`}
                        >
                          <div className="min-h-[100px] h-full flex flex-col items-center justify-start gap-2">
                            {/* Drag status indicator */}
                            {isHovered && isBlockedTarget && (
                              <div className="w-full p-1 bg-red-600 text-white font-semibold text-[10px] rounded flex items-center justify-center gap-1 shadow-sm animate-pulse">
                                <Ban className="h-3 w-3" />
                                <span className="truncate">{validation.reason}</span>
                              </div>
                            )}

                            {cellAssigns.length > 0 &&
                              cellAssigns.map((assign) => (
                                <div
                                  key={assign.id}
                                  draggable={true}
                                  onDragStart={(e) => handleDragStart(e, assign)}
                                  className={`w-full p-2.5 rounded-lg text-xs text-left shadow-sm border transition-all transform hover:-translate-y-0.5 cursor-grab active:cursor-grabbing ${
                                    hasBlocking
                                      ? "bg-destructive/10 border-destructive/30 text-destructive-foreground"
                                      : isOverloaded
                                      ? "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-300"
                                      : "bg-card border-emerald-500/30 text-foreground hover:border-emerald-500"
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-bold text-sm text-foreground truncate" title={assign.sites?.name}>
                                      {assign.sites?.name}
                                    </span>
                                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] mt-1 text-muted-foreground font-mono">
                                    <span>{assign.estimated_cleaning_mins || 90}m cleaning</span>
                                    <span>{assign.estimated_distance_km || 0} km</span>
                                  </div>
                                </div>
                              ))}

                            {cellSr.length > 0 &&
                              cellSr.map((sr, idx) => (
                                <div
                                  key={idx}
                                  className="w-full p-2 rounded-lg text-xs text-left shadow-sm border bg-purple-500/10 border-purple-500/30 text-purple-900 dark:text-purple-300"
                                >
                                  <div className="font-bold text-xs truncate" title={sr.sites?.name}>
                                    {sr.sites?.name}
                                  </div>
                                  <div className="text-[10px] mt-0.5 font-medium opacity-80">Service Request</div>
                                </div>
                              ))}

                            {cellAssigns.length === 0 && cellSr.length === 0 && (
                              <span className="text-xs text-muted-foreground/20 hover:text-muted-foreground py-6 font-mono">
                                + Add
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Edit / Reassign Assignment Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Modify Visit Assignment</DialogTitle>
          </DialogHeader>
          {selectedAssignment && (
            <div className="space-y-4 text-xs">
              <div className="p-3 bg-muted/40 rounded-lg border space-y-1">
                <div className="font-bold text-sm text-foreground">
                  {selectedAssignment.sites?.name || "Site Visit"}
                </div>
                <div className="text-muted-foreground">
                  Ideal Target Date: <strong className="font-mono text-foreground">{selectedAssignment.target_date}</strong>
                </div>
              </div>

              {selectedAssignment.scheduler_rationale && (
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs space-y-1">
                  <div className="font-semibold text-primary flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5" /> Placement Rationale
                  </div>
                  <p className="text-muted-foreground leading-relaxed">{selectedAssignment.scheduler_rationale}</p>
                </div>
              )}

              {selectedAssignment.constraint_notes && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs space-y-1 text-amber-700 dark:text-amber-300">
                  <div className="font-semibold flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-500" /> Constraint Warning
                  </div>
                  <p className="leading-relaxed">{selectedAssignment.constraint_notes}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Assigned Team</Label>
                <Select value={targetTeamId} onValueChange={setTargetTeamId}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder="Select Team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">
                        {t.name} ({t.base_address || "MMR"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Scheduled Date</Label>
                <Input
                  type="date"
                  value={targetDateStr.split("T")[0]}
                  onChange={(e) => setTargetDateStr(e.target.value)}
                  className="text-xs h-9 font-mono"
                />
              </div>

              <DialogFooter className="flex justify-between items-center gap-2 pt-2 border-t">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (selectedAssignment) {
                      onRemoveAssignment(selectedAssignment.id);
                      setEditDialogOpen(false);
                      setSelectedAssignment(null);
                    }
                  }}
                  className="text-xs h-8"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear Visit
                </Button>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(false)} className="text-xs h-8">
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSaveEdit} className="text-xs h-8">
                    Save Changes
                  </Button>
                </div>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Manual Visit Addition Dialog */}
      <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Manual Cleaning Visit</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-xs">
            <div className="space-y-2">
              <Label>Select Solar Site</Label>
              <Select value={manualSiteId} onValueChange={setManualSiteId}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Select Site" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      {s.name} ({s.location})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Assigned Team</Label>
              <Select value={manualTeamId} onValueChange={setManualTeamId}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Select Team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Scheduled Date</Label>
              <Input
                type="date"
                value={manualDateStr}
                onChange={(e) => setManualDateStr(e.target.value)}
                className="text-xs h-9 font-mono"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" size="sm" onClick={() => setManualDialogOpen(false)} className="text-xs h-8">
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveManual} className="text-xs h-8">
                Add Visit
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
