"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Users, Plus, UserCheck, MapPin, Wrench, Calendar, CheckCircle2, Clock, ShieldAlert, Settings } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { SubNav } from "@/components/sub-nav";
import type { TechnicianTeam, Profile, WorkOrder, CleaningLog } from "@/lib/types";

interface ExtendedTeamMember {
  id: string;
  team_id: string;
  technician_id: string;
  profiles?: Profile | null;
}

interface ExtendedTeam extends TechnicianTeam {
  technician_team_members?: ExtendedTeamMember[];
}

export default function WorkforcePage() {
  const sb = createClient();

  const [teams, setTeams] = useState<ExtendedTeam[]>([]);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [cleaningLogs, setCleaningLogs] = useState<CleaningLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [teamForm, setTeamForm] = useState({ name: "", base_address: "", color_code: "#3b82f6" });
  const [savingTeam, setSavingTeam] = useState(false);

  const [addTechOpen, setAddTechOpen] = useState(false);
  const [techForm, setTechForm] = useState({ full_name: "", email: "", phone: "", password: "" });
  const [savingTech, setSavingTech] = useState(false);

  const [manageTeam, setManageTeam] = useState<ExtendedTeam | null>(null);
  const [manageMembersOpen, setManageMembersOpen] = useState(false);
  const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]);
  const [savingMembers, setSavingMembers] = useState(false);

  async function loadData() {
    setLoading(true);
    const [{ data: t }, { data: p }, { data: wo }, { data: cl }] = await Promise.all([
      sb.from("technician_teams").select("*, technician_team_members(*, profiles(*))").order("name"),
      sb.from("profiles").select("*").eq("role", "technician").order("full_name"),
      sb.from("work_orders").select("*"),
      sb.from("cleaning_logs").select("*"),
    ]);

    setTeams((t as ExtendedTeam[]) ?? []);
    setTechnicians((p as Profile[]) ?? []);
    setWorkOrders((wo as WorkOrder[]) ?? []);
    setCleaningLogs((cl as CleaningLog[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  // Handle Create Team
  async function handleCreateTeam() {
    if (!teamForm.name) return toast.error("Team name is required.");
    setSavingTeam(true);

    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(teamForm),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create team");
      } else {
        toast.success(`Created team ${teamForm.name}`);
        setCreateTeamOpen(false);
        setTeamForm({ name: "", base_address: "", color_code: "#3b82f6" });
        loadData();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create team");
    } finally {
      setSavingTeam(false);
    }
  }

  // Handle Add Technician
  async function handleAddTechnician() {
    if (!techForm.full_name.trim()) return toast.error("Technician name is required");
    if (!techForm.email.trim() || !techForm.email.includes("@")) return toast.error("Valid email is required");

    setSavingTech(true);
    try {
      const res = await fetch("/api/technicians", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(techForm),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create technician");
      } else {
        toast.success(data.message || `Technician ${techForm.full_name} created successfully`);
        setAddTechOpen(false);
        setTechForm({ full_name: "", email: "", phone: "", password: "" });
        loadData();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create technician");
    } finally {
      setSavingTech(false);
    }
  }

  // Handle Delete Team
  async function handleDeleteTeam(team: ExtendedTeam) {
    if (!confirm(`Delete team "${team.name}"? Any assigned tasks will become unassigned.`)) return;
    try {
      const res = await fetch(`/api/teams?id=${team.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to delete team");
      } else {
        toast.success(`Team "${team.name}" deleted`);
        loadData();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete team");
    }
  }

  // Handle Manage Team Members
  function openMemberManager(team: ExtendedTeam) {
    setManageTeam(team);
    const currentTechIds = (team.technician_team_members || []).map((m) => m.technician_id);
    setSelectedTechIds(currentTechIds);
    setManageMembersOpen(true);
  }

  async function handleSaveTeamMembers() {
    if (!manageTeam) return;
    setSavingMembers(true);

    try {
      const res = await fetch("/api/teams", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: manageTeam.id,
          technician_ids: selectedTechIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to update team members");
      } else {
        toast.success(`Updated members for ${manageTeam.name}`);
        setManageMembersOpen(false);
        loadData();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save team members");
    } finally {
      setSavingMembers(false);
    }
  }

  const toggleTechSelection = (tId: string) => {
    setSelectedTechIds((prev) =>
      prev.includes(tId) ? prev.filter((id) => id !== tId) : [...prev, tId]
    );
  };

  // Map technician stats
  function getTechnicianStats(techId: string) {
    const techWos = workOrders.filter((wo) => wo.technician_id === techId);
    const cleaningWos = techWos.filter((wo) => wo.type === "cleaning");
    const maintenanceWos = techWos.filter((wo) => wo.type !== "cleaning");
    const completedWos = techWos.filter((wo) => wo.status === "completed");

    let onTimeCount = 0;
    let totalDelayDays = 0;

    completedWos.forEach((wo) => {
      if (wo.scheduled_date && wo.completed_at) {
        const sched = new Date(wo.scheduled_date).getTime();
        const comp = new Date(wo.completed_at).getTime();
        const delay = Math.max(0, Math.round((comp - sched) / 86400_000));
        if (delay === 0) onTimeCount++;
        totalDelayDays += delay;
      } else {
        onTimeCount++;
      }
    });

    const onTimeRate = completedWos.length > 0 ? Math.round((onTimeCount / completedWos.length) * 100) : 100;
    const avgDelay = completedWos.length > 0 ? (totalDelayDays / completedWos.length).toFixed(1) : "0.0";

    return {
      cleaningCount: cleaningWos.length,
      maintenanceCount: maintenanceWos.length,
      totalCount: techWos.length,
      completedCount: completedWos.length,
      onTimeRate,
      avgDelay,
    };
  }

  // Find team for tech
  function getTeamForTech(techId: string) {
    for (const team of teams) {
      const match = (team.technician_team_members || []).some((m) => m.technician_id === techId);
      if (match) return team.name;
    }
    return "Unassigned";
  }

  return (
    <div className="space-y-6 pb-12" data-testid="workforce-page">
      <SubNav hub="operations" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
            Workforce & Team Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize field teams, manage technician allocations, and audit field execution performance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => setAddTechOpen(true)} variant="outline" className="text-xs h-9 gap-1.5">
            <Users className="h-4 w-4" /> Add Technician
          </Button>
          <Button onClick={() => setCreateTeamOpen(true)} variant="default" className="text-xs h-9 gap-1.5">
            <Plus className="h-4 w-4" /> Create Team
          </Button>
        </div>
      </div>

      <Tabs defaultValue="teams" className="space-y-6">
        <TabsList className="bg-muted p-1">
          <TabsTrigger value="teams" className="text-xs font-semibold px-4">
            Operational Teams ({teams.length})
          </TabsTrigger>
          <TabsTrigger value="technicians" className="text-xs font-semibold px-4">
            Technician Directory ({technicians.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Teams Management */}
        <TabsContent value="teams" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
            {teams.map((team) => {
              const members = team.technician_team_members || [];
              const teamTechIds = members.map((m) => m.technician_id);
              const teamWos = workOrders.filter((wo) => wo.technician_id && teamTechIds.includes(wo.technician_id));
              const completedTeamWos = teamWos.filter((wo) => wo.status === "completed");

              return (
                <Card key={team.id} className="border shadow-sm overflow-hidden">
                  <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="h-3.5 w-3.5 rounded-full"
                        style={{ backgroundColor: team.color_code || "#3b82f6" }}
                      />
                      <CardTitle className="text-base font-bold">{team.name}</CardTitle>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 gap-1"
                      onClick={() => openMemberManager(team)}
                    >
                      <Settings className="h-3 w-3" /> Edit Team Members
                    </Button>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4 text-xs">
                    <div className="flex items-center justify-end text-muted-foreground">
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {team.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Assigned Technicians ({members.length})
                      </Label>
                      {members.length === 0 ? (
                        <div className="p-3 border border-dashed rounded-lg text-center text-muted-foreground text-xs">
                          No technicians assigned to this team.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {members.map((m) => (
                            <div
                              key={m.id}
                              className="p-2 bg-muted/30 border rounded-lg flex items-center gap-2"
                            >
                              <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                                {m.profiles?.full_name?.charAt(0) || "T"}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-foreground break-words leading-tight">
                                  {m.profiles?.full_name || "Technician"}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t flex justify-between text-[11px] text-muted-foreground font-mono">
                      <span>Assigned Service Tasks: <strong>{teamWos.length}</strong></span>
                      <span>Completed: <strong>{completedTeamWos.length}</strong></span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab 2: Technician Directory & Performance KPIs */}
        <TabsContent value="technicians">
          <Card className="border shadow-sm">
            <CardHeader className="p-6 pb-4">
              <CardTitle className="text-lg font-bold">Technician Performance Directory</CardTitle>
              <CardDescription className="text-sm">
                Individual technician operational performance metrics calculated strictly from actual work execution logs.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table className="text-xs">
                <TableHeader className="bg-muted/50 uppercase tracking-wider font-semibold">
                  <TableRow>
                    <TableHead className="py-3 px-6">Technician</TableHead>
                    <TableHead className="py-3 px-4">Assigned Team</TableHead>
                    <TableHead className="py-3 px-4 text-center">Cleaning Jobs</TableHead>
                    <TableHead className="py-3 px-4 text-center">Maintenance Jobs</TableHead>
                    <TableHead className="py-3 px-4 text-center">Total Completed</TableHead>
                    <TableHead className="py-3 px-4 text-center">On-Time Rate</TableHead>
                    <TableHead className="py-3 px-6 text-right">Avg Delay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {technicians.map((tech) => {
                    const stats = getTechnicianStats(tech.id);
                    const teamName = getTeamForTech(tech.id);

                    return (
                      <TableRow key={tech.id} className="hover:bg-muted/30">
                        <TableCell className="py-3.5 px-6 font-semibold">
                          <div className="space-y-0.5">
                            <div className="text-foreground">{tech.full_name}</div>
                            <div className="text-[10px] text-muted-foreground font-normal">{tech.email}</div>
                          </div>
                        </TableCell>

                        <TableCell className="py-3.5 px-4 font-medium">
                          <Badge variant={teamName !== "Unassigned" ? "secondary" : "outline"} className="text-[10px]">
                            {teamName}
                          </Badge>
                        </TableCell>

                        <TableCell className="py-3.5 px-4 text-center font-mono font-semibold">
                          {stats.cleaningCount}
                        </TableCell>

                        <TableCell className="py-3.5 px-4 text-center font-mono font-semibold">
                          {stats.maintenanceCount}
                        </TableCell>

                        <TableCell className="py-3.5 px-4 text-center font-mono font-bold text-foreground">
                          {stats.completedCount} / {stats.totalCount}
                        </TableCell>

                        <TableCell className="py-3.5 px-4 text-center font-mono font-semibold">
                          <span className={stats.onTimeRate >= 90 ? "text-emerald-600" : "text-amber-600"}>
                            {stats.onTimeRate}%
                          </span>
                        </TableCell>

                        <TableCell className="py-3.5 px-6 text-right font-mono text-muted-foreground">
                          {stats.avgDelay} days
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Team Dialog */}
      <Dialog open={createTeamOpen} onOpenChange={setCreateTeamOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Operational Team</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs">
            <div className="space-y-1.5">
              <Label>Team Name</Label>
              <Input
                value={teamForm.name}
                onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
                placeholder="e.g. Team F"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Team Color Code</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={teamForm.color_code}
                  onChange={(e) => setTeamForm({ ...teamForm, color_code: e.target.value })}
                  className="h-8 w-12 cursor-pointer border rounded"
                />
                <Input
                  value={teamForm.color_code}
                  onChange={(e) => setTeamForm({ ...teamForm, color_code: e.target.value })}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateTeam} disabled={savingTeam} size="sm">
              {savingTeam ? "Creating..." : "Create Team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Team Members Dialog */}
      <Dialog open={manageMembersOpen} onOpenChange={setManageMembersOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Members for {manageTeam?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs max-h-64 overflow-y-auto pr-1">
            <Label className="font-bold">Select members for {manageTeam?.name}</Label>
            <div className="flex justify-between items-center text-muted-foreground text-[10px] mb-2">
              <span>Selected: {selectedTechIds.length} technician(s)</span>
              {selectedTechIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedTechIds([])}
                  className="text-destructive hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="space-y-2">
              {technicians.map((t) => {
                const isSelected = selectedTechIds.includes(t.id);
                return (
                  <label
                    key={t.id}
                    className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer select-none transition-colors ${
                      isSelected ? "bg-primary/10 border-primary font-semibold text-foreground" : "bg-card text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTechSelection(t.id)}
                        className="rounded text-primary"
                      />
                      <span>{t.full_name}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveTeamMembers} disabled={savingMembers} size="sm">
              {savingMembers ? "Saving..." : "Save Team Details"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Technician Dialog */}
      <Dialog open={addTechOpen} onOpenChange={setAddTechOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Technician</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label>Full Name <span className="text-red-500">*</span></Label>
              <Input
                placeholder="e.g. Ramesh Kumar"
                value={techForm.full_name}
                onChange={(e) => setTechForm({ ...techForm, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email Address <span className="text-red-500">*</span></Label>
              <Input
                type="email"
                placeholder="e.g. ramesh@solarassist.dev"
                value={techForm.email}
                onChange={(e) => setTechForm({ ...techForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mobile / Phone Number</Label>
              <Input
                type="tel"
                placeholder="e.g. +91 98765 43210"
                value={techForm.phone}
                onChange={(e) => setTechForm({ ...techForm, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Initial Password</Label>
              <Input
                type="text"
                placeholder="SolarTech2026! (default)"
                value={techForm.password}
                onChange={(e) => setTechForm({ ...techForm, password: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddTechOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddTechnician} disabled={savingTech}>
              {savingTech ? "Creating..." : "Save Technician"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
