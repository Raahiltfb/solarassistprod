"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Users, Plus, UserPlus, MapPin, Settings, ShieldCheck, Clock, CheckCircle2, AlertCircle, Trash2, Mail, Phone, Lock, Wrench } from "lucide-react";
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

  // Add Technician dialog
  const [addTechOpen, setAddTechOpen] = useState(false);
  const [techForm, setTechForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [savingTech, setSavingTech] = useState(false);

  // Create Team dialog
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [teamForm, setTeamForm] = useState({
    name: "",
    base_address: "",
    color_code: "#3b82f6",
  });
  const [savingTeam, setSavingTeam] = useState(false);

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

  // Handle Delete Technician
  async function handleDeleteTechnician(tech: Profile) {
    if (!confirm(`Are you sure you want to remove technician ${tech.full_name}?`)) return;

    try {
      const res = await fetch(`/api/technicians?id=${tech.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to remove technician");
      } else {
        toast.success(`Removed technician ${tech.full_name}`);
        loadData();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to remove technician");
    }
  }

  // Handle Create Team
  async function handleCreateTeam() {
    if (!teamForm.name.trim()) return toast.error("Team name is required");

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
        toast.success(data.message || `Team ${teamForm.name} created successfully`);
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
        toast.success(`Updated crew members for ${manageTeam.name}`);
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

  const techTeamAssignmentMap = new Map<string, string>();
  teams.forEach((t) => {
    (t.technician_team_members || []).forEach((m) => {
      techTeamAssignmentMap.set(m.technician_id, t.name);
    });
  });

  const totalAssignedTechs = teams.reduce((sum, t) => sum + (t.technician_team_members?.length || 0), 0);
  const unassignedTechsCount = Math.max(0, technicians.length - totalAssignedTechs);

  return (
    <div className="space-y-6 pb-12" data-testid="cleaning-teams-page">
      <SubNav hub="cleaning" />

      {/* Header with Add Technician & Create Team CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-foreground">
            Workforce &amp; Cleaning Crews
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage field technicians individually, form cleaning crews as needed, and dispatch maintenance operations.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            onClick={() => setAddTechOpen(true)}
            size="sm"
            className="text-xs h-9 gap-1.5 bg-primary text-primary-foreground shadow-sm"
          >
            <UserPlus className="h-4 w-4" />
            <span>Add Technician</span>
          </Button>

          <Button
            onClick={() => setCreateTeamOpen(true)}
            variant="outline"
            size="sm"
            className="text-xs h-9 gap-1.5 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>Create Team</span>
          </Button>
        </div>
      </div>

      {/* High Level Fleet Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Registered Technicians</span>
            <div className="text-2xl font-bold font-mono text-foreground">{technicians.length}</div>
            <span className="text-xs text-muted-foreground">Individual field operators</span>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Active Teams</span>
            <div className="text-2xl font-bold font-mono text-foreground">{teams.length}</div>
            <span className="text-xs text-muted-foreground">Configured crew units</span>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Team Assignments</span>
            <div className="text-2xl font-bold font-mono text-foreground">{totalAssignedTechs} of {technicians.length}</div>
            <span className="text-xs text-muted-foreground">{unassignedTechsCount} unassigned / standalone</span>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Active Cleaning Tasks</span>
            <div className="text-2xl font-bold font-mono text-foreground">{cleaningVisits.length}</div>
            <span className="text-xs text-muted-foreground">Scheduled &amp; dispatched jobs</span>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Teams vs. Individual Technicians */}
      <Tabs defaultValue="teams" className="space-y-6">
        <TabsList className="bg-muted p-1">
          <TabsTrigger value="teams" className="text-xs font-semibold px-4">
            Cleaning Teams ({teams.length})
          </TabsTrigger>
          <TabsTrigger value="technicians" className="text-xs font-semibold px-4">
            Individual Technicians ({technicians.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Teams Grid */}
        <TabsContent value="teams" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map((team) => {
              const members = team.technician_team_members || [];
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
                        <CardTitle className="text-base font-bold">{team.name}</CardTitle>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 gap-1"
                          onClick={() => openMemberManager(team)}
                        >
                          <Settings className="h-3 w-3" /> Assign Techs
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteTeam(team)}
                          title="Delete team"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4 text-xs">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-[11px] font-mono">{team.base_address || "Operating Base"}</span>
                        <Badge variant="outline" className="text-[10px] uppercase font-mono">
                          {members.length} Members
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          Crew Members ({members.length})
                        </Label>
                        {members.length === 0 ? (
                          <div className="p-3 border border-dashed rounded-lg text-center text-muted-foreground text-xs space-y-1">
                            <div>No technicians assigned to this team yet.</div>
                            <Button
                              variant="link"
                              size="sm"
                              className="text-xs h-auto p-0 text-primary"
                              onClick={() => openMemberManager(team)}
                            >
                              + Assign technicians from list
                            </Button>
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
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </div>

                  <div className="p-4 pt-2 border-t bg-muted/10 flex justify-between text-[11px] text-muted-foreground font-mono">
                    <span>Assigned Tasks: <strong>{teamVisits.length}</strong></span>
                    <span>Completed: <strong className="text-emerald-600">{completedVisits.length}</strong></span>
                  </div>
                </Card>
              );
            })}
            {teams.length === 0 && (
              <div className="col-span-full p-8 border border-dashed rounded-xl text-center space-y-3">
                <Users className="h-10 w-10 text-muted-foreground mx-auto" />
                <h3 className="font-bold text-base">No Teams Created</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Teams are currently blank. You can create custom field crews whenever needed from your registered technicians.
                </p>
                <Button onClick={() => setCreateTeamOpen(true)} size="sm">
                  + Create First Team
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tab 2: Individual Technicians List */}
        <TabsContent value="technicians" className="space-y-6">
          <Card className="border shadow-sm">
            <CardHeader className="p-6 pb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold">Technicians Directory</CardTitle>
                <CardDescription className="text-sm mt-0.5">
                  All active field technicians registered in your organization.
                </CardDescription>
              </div>
              <Button onClick={() => setAddTechOpen(true)} size="sm" className="text-xs h-8 gap-1.5">
                <UserPlus className="h-3.5 w-3.5" />
                <span>+ Add Technician</span>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table className="text-xs">
                <TableHeader className="bg-muted/50 uppercase tracking-wider font-semibold">
                  <TableRow>
                    <TableHead className="py-3 px-6">Name</TableHead>
                    <TableHead className="py-3 px-4">Email / Login</TableHead>
                    <TableHead className="py-3 px-4">Assigned Team</TableHead>
                    <TableHead className="py-3 px-4">Base Location</TableHead>
                    <TableHead className="py-3 px-4">Status</TableHead>
                    <TableHead className="py-3 px-6 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {technicians.map((tech) => {
                    const assignedTeamName = techTeamAssignmentMap.get(tech.id);
                    return (
                      <TableRow key={tech.id} className="hover:bg-muted/30">
                        <TableCell className="py-3.5 px-6 font-semibold">
                          <div className="flex items-center gap-2.5">
                            <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                              {tech.full_name?.charAt(0) || "T"}
                            </div>
                            <span className="text-foreground">{tech.full_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3.5 px-4 font-mono text-muted-foreground">
                          {tech.email}
                        </TableCell>
                        <TableCell className="py-3.5 px-4">
                          {assignedTeamName ? (
                            <Badge variant="default" className="text-[10px]">
                              {assignedTeamName}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground border-dashed">
                              Standalone / Unassigned
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-3.5 px-4 text-muted-foreground">
                          {tech.base_address || "Mumbai Field Hub"}
                        </TableCell>
                        <TableCell className="py-3.5 px-4">
                          <Badge variant="success" className="text-[10px]">
                            Active
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3.5 px-6 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteTechnician(tech)}
                            title="Remove technician"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {technicians.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                        No technicians registered yet. Click &quot;Add Technician&quot; to onboard your field crew.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: Add Technician */}
      <Dialog open={addTechOpen} onOpenChange={setAddTechOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Technician</DialogTitle>
            <DialogDescription className="text-xs">
              Create an individual field technician profile with login credentials.
            </DialogDescription>
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
              <p className="text-[11px] text-muted-foreground">Leave empty to use standard default &quot;SolarTech2026!&quot;.</p>
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

      {/* Dialog: Create Team */}
      <Dialog open={createTeamOpen} onOpenChange={setCreateTeamOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Cleaning Crew Team</DialogTitle>
            <DialogDescription className="text-xs">
              Form a new operational field team to group technicians and assign bulk routes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label>Team Name <span className="text-red-500">*</span></Label>
              <Input
                placeholder="e.g. MMR North Crew or Team Alpha"
                value={teamForm.name}
                onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Base Hub / Address</Label>
              <Input
                placeholder="e.g. Malad West Hub, Mumbai"
                value={teamForm.base_address}
                onChange={(e) => setTeamForm({ ...teamForm, base_address: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Badge Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-8 w-10 cursor-pointer rounded border p-0.5 bg-background"
                  value={teamForm.color_code}
                  onChange={(e) => setTeamForm({ ...teamForm, color_code: e.target.value })}
                />
                <span className="font-mono text-xs">{teamForm.color_code}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateTeamOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateTeam} disabled={savingTeam}>
              {savingTeam ? "Creating..." : "Create Team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Assign Crew Technicians */}
      <Dialog open={manageMembersOpen} onOpenChange={setManageMembersOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Crew Technicians for {manageTeam?.name}</DialogTitle>
            <DialogDescription className="text-xs">
              Select technicians from your roster to assign to this team, or uncheck all to leave this team blank.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
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
                      <div className="text-[10px] text-muted-foreground font-mono">{tech.email}</div>
                    </div>
                    <Badge variant={isSelected ? "default" : "outline"} className="text-[10px]">
                      {isSelected ? "Selected" : "Add"}
                    </Badge>
                  </div>
                );
              })}
              {technicians.length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  No technicians available. Add technicians first.
                </div>
              )}
            </div>
            <div className="flex justify-between items-center text-[11px] text-muted-foreground font-mono">
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
