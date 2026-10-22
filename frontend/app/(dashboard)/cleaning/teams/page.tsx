"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Users, MapPin, Settings, ShieldCheck, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { SubNav } from "@/components/sub-nav";
import type { TechnicianTeam, Profile, WorkOrder, CleaningVisit } from "@/lib/types";

interface ExtendedTeamMember {
  id: string;
  team_id: string;
  technician_id: string;
  profiles?: Profile | null;
}

interface ExtendedTeam extends TechnicianTeam {
  technician_team_members?: ExtendedTeamMember[];
}

export default function CleaningTeamsPage() {
  const sb = createClient();

  const [teams, setTeams] = useState<ExtendedTeam[]>([]);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [cleaningVisits, setCleaningVisits] = useState<CleaningVisit[]>([]);
  const [cleaningWorkOrders, setCleaningWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit team members dialog
  const [manageTeam, setManageTeam] = useState<ExtendedTeam | null>(null);
  const [manageMembersOpen, setManageMembersOpen] = useState(false);
  const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]);
  const [savingMembers, setSavingMembers] = useState(false);

  async function loadData() {
    setLoading(true);
    const [{ data: t }, { data: p }, { data: cv }, { data: wo }] = await Promise.all([
      sb.from("technician_teams").select("*, technician_team_members(*, profiles(*))").order("name"),
      sb.from("profiles").select("*").eq("role", "technician").order("full_name"),
      sb.from("cleaning_visits").select("*"),
      sb.from("work_orders").select("*").eq("type", "cleaning"),
    ]);

    setTeams((t as ExtendedTeam[]) ?? []);
    setTechnicians((p as Profile[]) ?? []);
    setCleaningVisits((cv as CleaningVisit[]) ?? []);
    setCleaningWorkOrders((wo as WorkOrder[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function openMemberManager(team: ExtendedTeam) {
    setManageTeam(team);
    const currentTechIds = (team.technician_team_members || []).map((m) => m.technician_id);
    setSelectedTechIds(currentTechIds);
    setManageMembersOpen(true);
  }

  async function handleSaveTeamMembers() {
    if (!manageTeam) return;
    setSavingMembers(true);

    await sb.from("technician_team_members").delete().eq("team_id", manageTeam.id);

    if (selectedTechIds.length > 0) {
      const inserts = selectedTechIds.map((tId) => ({
        team_id: manageTeam.id,
        technician_id: tId,
      }));
      const { error } = await sb.from("technician_team_members").insert(inserts);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success(`Updated crew members for ${manageTeam.name}`);
        setManageMembersOpen(false);
        loadData();
      }
    } else {
      toast.success(`Updated crew members for ${manageTeam.name}`);
      setManageMembersOpen(false);
      loadData();
    }
    setSavingMembers(false);
  }

  const toggleTechSelection = (tId: string) => {
    setSelectedTechIds((prev) =>
      prev.includes(tId) ? prev.filter((id) => id !== tId) : [...prev, tId]
    );
  };

  const totalAssignedTechs = teams.reduce((sum, t) => sum + (t.technician_team_members?.length || 0), 0);

  return (
    <div className="space-y-6 pb-12" data-testid="cleaning-teams-page">
      <SubNav hub="cleaning" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
            Cleaning Teams &amp; Shift Capacity
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Operational 2-person module cleaning crews, regional hub locks, and daily planning capacity assumptions.
          </p>
        </div>
      </div>

      {/* High Level Fleet Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Active Field Crews</span>
            <div className="text-2xl font-bold font-mono text-foreground">{teams.length} Teams</div>
            <span className="text-xs text-muted-foreground">4 Mumbai/MMR · 1 Pune Dedicated</span>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Assigned Technicians</span>
            <div className="text-2xl font-bold font-mono text-foreground">{totalAssignedTechs} of {technicians.length}</div>
            <span className="text-xs text-emerald-600 font-medium">100% paired (2 techs/crew)</span>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Planning Capacity</span>
            <div className="text-2xl font-bold font-mono text-foreground">480 mins</div>
            <span className="text-xs text-muted-foreground">8.0 working hours / crew / day</span>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Assigned Cleaning Tasks</span>
            <div className="text-2xl font-bold font-mono text-foreground">{cleaningVisits.length}</div>
            <span className="text-xs text-muted-foreground">Active planned/published visits</span>
          </CardContent>
        </Card>
      </div>

      {/* Teams Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.map((team) => {
          const members = team.technician_team_members || [];
          const isPune = (team.name || "").toLowerCase().includes("pune");
          const teamVisits = cleaningVisits.filter((cv) => cv.assigned_team_id === team.id);
          const completedVisits = teamVisits.filter((cv) => cv.status === "completed");

          return (
            <Card key={team.id} className="border shadow-sm overflow-hidden flex flex-col justify-between">
              <div>
                <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="h-3.5 w-3.5 rounded-full shrink-0"
                      style={{ backgroundColor: team.color_code || "#3b82f6" }}
                    />
                    <div>
                      <CardTitle className="text-base font-bold">{team.name}</CardTitle>
                      {isPune && (
                        <span className="text-[10px] text-pink-600 dark:text-pink-400 font-semibold uppercase tracking-wider">
                          Solely Pune &amp; Pimpri Cluster
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 gap-1"
                    onClick={() => openMemberManager(team)}
                  >
                    <Settings className="h-3 w-3" /> Pair Technicians
                  </Button>
                </CardHeader>
                <CardContent className="pt-4 space-y-4 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1 font-mono">
                      <MapPin className="h-3.5 w-3.5 text-primary" /> {team.base_address || "Hub"}
                    </span>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono">
                      {isPune ? "Pune Metro" : "Mumbai & MMR"}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Assigned Crew ({members.length})
                    </Label>
                    {members.length === 0 ? (
                      <div className="p-3 border border-dashed rounded-lg text-center text-muted-foreground text-xs">
                        No technicians assigned to this crew.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {members.map((m) => (
                          <div
                            key={m.id}
                            className="p-2.5 bg-muted/30 border rounded-lg flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                                {m.profiles?.full_name?.charAt(0) || "T"}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-foreground break-words leading-tight">
                                  {m.profiles?.full_name || "Technician"}
                                </div>
                                <div className="text-[10px] text-muted-foreground break-all font-mono">
                                  {m.profiles?.email}
                                </div>
                              </div>
                            </div>
                            <span className="text-[10px] text-muted-foreground font-mono shrink-0 ml-2">
                              {m.profiles?.base_address?.split(",")[0] || "Hub"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </div>

              <div className="p-4 pt-2 border-t bg-muted/10 flex justify-between text-[11px] text-muted-foreground font-mono">
                <span>Assigned Visits: <strong>{teamVisits.length}</strong></span>
                <span>Completed: <strong className="text-emerald-600">{completedVisits.length}</strong></span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Edit Crew Members Dialog */}
      <Dialog open={manageMembersOpen} onOpenChange={setManageMembersOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Crew Technicians for {manageTeam?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p className="text-muted-foreground">
              Select 2 field technicians to operate as this dedicated module cleaning crew.
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto border p-2 rounded-lg">
              {technicians.map((tech) => {
                const isSelected = selectedTechIds.includes(tech.id);
                return (
                  <div
                    key={tech.id}
                    onClick={() => toggleTechSelection(tech.id)}
                    className={`p-2 rounded-md flex items-center justify-between cursor-pointer transition-colors border ${
                      isSelected
                        ? "bg-primary/10 border-primary font-semibold text-primary"
                        : "bg-background border-border hover:bg-muted/50"
                    }`}
                  >
                    <div>
                      <div>{tech.full_name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{tech.email} · {tech.base_address}</div>
                    </div>
                    <Badge variant={isSelected ? "default" : "outline"} className="text-[10px]">
                      {isSelected ? "Selected" : "Add"}
                    </Badge>
                  </div>
                );
              })}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              Currently selected: {selectedTechIds.length} technician(s)
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setManageMembersOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveTeamMembers} disabled={savingMembers}>
              {savingMembers ? "Saving..." : "Save Crew Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
