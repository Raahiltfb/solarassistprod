"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Calendar, Truck, Clock, Info, MapPin, ArrowRight, ShieldAlert, CheckCircle2, UserCheck, Wrench, Edit3, Trash2 } from "lucide-react";
import { Site, TechnicianTeam, CleaningPlanAssignment } from "@/lib/types";

interface PlannerMatrixProps {
  year: number;
  month: number;
  teams: TechnicianTeam[];
  sites: Site[];
  assignments: CleaningPlanAssignment[];
  serviceRequests?: any[];
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

  // Calculate days in target month
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const monthName = new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "long" });

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

    // Calculate daily workloads
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

      {/* Main Interactive Matrix Calendar - Viewport Fit (No Horizontal Scroll) */}
      <Card className="border shadow-sm">
        <CardHeader className="p-4 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold">
                {monthName} {year} Workforce Schedule Matrix
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Month-at-a-glance. Click any day cell to view & reassign scheduled visits.
              </CardDescription>
            </div>
            <Button size="sm" variant="default" className="text-xs h-8 gap-1.5" onClick={() => handleOpenManual()}>
              <Calendar className="h-3.5 w-3.5" />
              <span>+ Add Manual Visit</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[2000px] border-collapse text-xs">
              <thead className="bg-muted/60 border-y text-muted-foreground font-semibold">
                <tr>
                  <th className="py-3 px-3 text-left w-48 border-r text-xs">
                    Team / Date
                  </th>
                  {daysArray.map((day) => {
                    const dateObj = new Date(year, month - 1, day);
                    const dayOfWeek = dateObj.toLocaleString("en-IN", { weekday: "narrow" });
                    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

                    return (
                      <th
                        key={day}
                        className={`py-2 px-1 w-32 text-center border-r ${isWeekend ? "bg-muted/80 text-muted-foreground font-normal" : ""
                          }`}
                      >
                        <div className="text-[10px] uppercase leading-none text-muted-foreground">{dayOfWeek}</div>
                        <div className="font-bold text-sm text-foreground mt-1">{day}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y">
                {teams.map((team) => (
                  <tr key={team.id} className="hover:bg-muted/20 transition-colors">
                    {/* Team Header Cell */}
                    <td className="py-2.5 px-2 font-semibold border-r space-y-0.5">
                      <div className="flex items-center gap-1.5 truncate">
                        <div
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: team.color_code || "#3b82f6" }}
                        />
                        <span className="text-foreground truncate text-xs">{team.name}</span>
                      </div>
                      <div className="text-[9px] text-muted-foreground font-normal truncate">
                        {team.base_address || "Base MMR"}
                      </div>
                    </td>

                    {/* Day Cells - Compact & Viewport-Fit */}
                    {daysArray.map((day) => {
                      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                      const key = `${team.id}:${dateStr}`;
                      const cellAssigns = assignmentGrid.get(key) || [];
                      const cellSr = srGrid.get(`${team.id}:${day}`) || [];

                      let totalDayMins = 0;
                      cellAssigns.forEach(
                        (a) => (totalDayMins += (a.estimated_cleaning_mins || 90) + (a.estimated_travel_mins || 0))
                      );

                      const isOverloaded = totalDayMins > planningCapacityMins;
                      const hasBlocking = cellAssigns.some((a) => a.constraint_state === "blocking");

                      return (
                        <td
                          key={day}
                          onClick={() => {
                            if (cellAssigns.length > 0) {
                              handleOpenEdit(cellAssigns[0]);
                            } else {
                              handleOpenManual(team.id, day);
                            }
                          }}
                          className={`p-0.5 border-r border-b text-center align-middle cursor-pointer transition-colors hover:bg-primary/10 ${isOverloaded ? "bg-amber-500/10" : ""
                            }`}
                        >
                          <div className="min-h-24 h-full flex flex-col items-center justify-start p-1.5 gap-1.5">
                            {cellAssigns.length > 0 && cellAssigns.map((assign, idx) => (
                              <div
                                key={idx}
                                className={`w-full p-1.5 rounded-md text-xs text-left shadow-sm border ${hasBlocking
                                    ? "bg-destructive/10 border-destructive/30 text-destructive-foreground"
                                    : isOverloaded
                                      ? "bg-amber-500/10 border-amber-500/30 text-amber-900"
                                      : "bg-emerald-50 border-emerald-200 text-emerald-900"
                                  }`}
                              >
                                <div className="font-bold truncate" title={assign.sites?.name}>{assign.sites?.name}</div>
                                <div className="text-[10px] mt-0.5 font-medium opacity-80">Cleaning</div>
                              </div>
                            ))}
                            
                            {cellSr.length > 0 && cellSr.map((sr, idx) => (
                              <div
                                key={idx}
                                className="w-full p-1.5 rounded-md text-xs text-left shadow-sm border bg-purple-50 border-purple-200 text-purple-900"
                              >
                                <div className="font-bold truncate" title={sr.sites?.name}>{sr.sites?.name}</div>
                                <div className="text-[10px] mt-0.5 font-medium opacity-80">SR</div>
                              </div>
                            ))}

                            {cellAssigns.length === 0 && cellSr.length === 0 && (
                              <span className="text-xs text-muted-foreground/30 hover:text-muted-foreground py-4">·</span>
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

              <div className="space-y-1.5">
                <Label>Assigned Team</Label>
                <Select value={targetTeamId} onValueChange={setTargetTeamId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Scheduled Date</Label>
                <Input
                  type="date"
                  value={targetDateStr}
                  onChange={(e) => setTargetDateStr(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
            <Button
              variant="destructive"
              size="sm"
              className="text-xs h-8 gap-1"
              onClick={() => {
                if (selectedAssignment) {
                  onRemoveAssignment(selectedAssignment.id);
                  setEditDialogOpen(false);
                  setSelectedAssignment(null);
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove Visit
            </Button>
            <Button onClick={handleSaveEdit} size="sm" variant="default" className="text-xs h-8">
              Update Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Add Visit Dialog */}
      <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Manual Cleaning Visit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <Label>Site</Label>
              <Select value={manualSiteId} onValueChange={setManualSiteId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select site" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.capacity_kwp} kWp)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Assigned Team</Label>
              <Select value={manualTeamId} onValueChange={setManualTeamId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Scheduled Date</Label>
              <Input
                type="date"
                value={manualDateStr}
                onChange={(e) => setManualDateStr(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveManual} size="sm" variant="default" className="text-xs">
              Add Visit to Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
