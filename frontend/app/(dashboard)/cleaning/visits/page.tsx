"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubNav } from "@/components/sub-nav";
import { formatDate } from "@/lib/utils";
import { CleaningEvidenceLinks } from "@/components/cleaning-evidence-links";
import { Search, Calendar, Camera, CheckCircle2, Clock, ShieldAlert, ArrowUpRight, MapPin } from "lucide-react";
import type { CleaningVisit, CleaningLog, Site, TechnicianTeam } from "@/lib/types";

export default function CleaningVisitsPage() {
  const sb = createClient();
  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [cyclePeriod, setCyclePeriod] = useState<string>(defaultPeriod);
  const [visits, setVisits] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [teams, setTeams] = useState<TechnicianTeam[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");

  async function loadData() {
    setLoading(true);
    const [{ data: vData }, { data: lData }, { data: tData }] = await Promise.all([
      sb
        .from("cleaning_visits")
        .select("*, sites(id, name, location, cleaning_cycle_days, last_cleaned_on), technician_teams(id, name, color_code)")
        .eq("cycle_period", cyclePeriod)
        .order("target_due_date", { ascending: true }),
      sb
        .from("cleaning_logs")
        .select("*, sites(id, name, location), profiles(full_name)")
        .order("performed_at", { ascending: false })
        .limit(50),
      sb.from("technician_teams").select("*").eq("is_active", true).order("name"),
    ]);

    setVisits(vData ?? []);
    setLogs(lData ?? []);
    setTeams((tData as TechnicianTeam[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [cyclePeriod]);

  const filteredVisits = visits.filter((v) => {
    const siteName = v.sites?.name || "";
    const siteLoc = v.sites?.location || "";
    const matchesSearch =
      !search ||
      siteName.toLowerCase().includes(search.toLowerCase()) ||
      siteLoc.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === "all" || v.status === statusFilter;
    const matchesTeam = teamFilter === "all" || v.assigned_team_id === teamFilter;

    return matchesSearch && matchesStatus && matchesTeam;
  });

  const totalVisits = visits.length;
  const completedVisits = visits.filter((v) => v.status === "completed").length;
  const publishedVisits = visits.filter((v) => ["published", "scheduled", "en_route", "in_progress"].includes(v.status)).length;
  const overdueVisits = visits.filter((v) => {
    if (v.status === "completed") return false;
    const targetMs = v.target_due_date ? new Date(v.target_due_date).getTime() : 0;
    return targetMs > 0 && Date.now() > targetMs;
  }).length;

  return (
    <div className="space-y-6 pb-12" data-testid="cleaning-visits-page">
      <SubNav hub="cleaning" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
            Cleaning Visits &amp; Execution History
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track operational visit progress, scheduled field assignments, and verified photographic proof of work.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={cyclePeriod} onValueChange={setCyclePeriod}>
            <SelectTrigger className="w-36 text-xs h-9 font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2026-09">Sept 2026</SelectItem>
              <SelectItem value="2026-10">Oct 2026 (Active)</SelectItem>
              <SelectItem value="2026-11">Nov 2026</SelectItem>
              <SelectItem value="2026-12">Dec 2026</SelectItem>
            </SelectContent>
          </Select>

          <Button asChild variant="default" size="sm" className="text-xs h-9 gap-1.5 shadow-sm">
            <Link href="/cleaning/planner">
              <Calendar className="h-4 w-4" /> Open Monthly Planner
            </Link>
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Total Cycle Visits</span>
            <div className="text-2xl font-bold font-mono text-foreground">{totalVisits}</div>
            <span className="text-xs text-muted-foreground">Visits planned for {cyclePeriod}</span>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/50">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-bold uppercase text-emerald-700 dark:text-emerald-400">Completed Cleanings</span>
            <div className="text-2xl font-bold font-mono text-emerald-800 dark:text-emerald-300">{completedVisits}</div>
            <span className="text-xs text-emerald-600/80 dark:text-emerald-400/80">
              {totalVisits > 0 ? `${Math.round((completedVisits / totalVisits) * 100)}% cycle completion` : "0% completion"}
            </span>
          </CardContent>
        </Card>

        <Card className="border shadow-sm bg-blue-50/40 dark:bg-blue-950/20 border-blue-200/50">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-bold uppercase text-blue-700 dark:text-blue-400">Published &amp; Active</span>
            <div className="text-2xl font-bold font-mono text-blue-800 dark:text-blue-300">{publishedVisits}</div>
            <span className="text-xs text-blue-600/80 dark:text-blue-400/80">Dispatched to technician routes</span>
          </CardContent>
        </Card>

        <Card className={`border shadow-sm ${overdueVisits > 0 ? "bg-red-50/50 border-red-300 dark:bg-red-950/20" : ""}`}>
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-bold uppercase text-red-700 dark:text-red-400">Overdue / Delayed</span>
            <div className="text-2xl font-bold font-mono text-red-800 dark:text-red-300">{overdueVisits}</div>
            <span className="text-xs text-red-600/80 dark:text-red-400/80">
              {overdueVisits > 0 ? "Past target maintenance window" : "0 overdue visits"}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="visits" className="space-y-6">
        <TabsList className="bg-muted p-1">
          <TabsTrigger value="visits" className="text-xs font-semibold px-4">
            Cycle Visits Schedule ({visits.length})
          </TabsTrigger>
          <TabsTrigger value="evidence" className="text-xs font-semibold px-4">
            Photographic Evidence Gallery ({logs.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Visits Schedule */}
        <TabsContent value="visits" className="space-y-4">
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="Search site or location..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 text-xs h-9"
                  />
                </div>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Visit Statuses</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="planned">Draft Planned</SelectItem>
                    <SelectItem value="unscheduled">Unscheduled</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={teamFilter} onValueChange={setTeamFilter}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder="All Teams" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Teams</SelectItem>
                    {teams.map((tm) => (
                      <SelectItem key={tm.id} value={tm.id}>
                        {tm.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <Table className="text-xs">
                <TableHeader className="bg-muted/50 uppercase tracking-wider font-semibold">
                  <TableRow>
                    <TableHead className="py-3 px-6">Site &amp; Location</TableHead>
                    <TableHead className="py-3 px-4">Target Due</TableHead>
                    <TableHead className="py-3 px-4">Scheduled Date</TableHead>
                    <TableHead className="py-3 px-4">Assigned Team</TableHead>
                    <TableHead className="py-3 px-4">Status</TableHead>
                    <TableHead className="py-3 px-4">Overdue Check</TableHead>
                    <TableHead className="py-3 px-6 text-right">Planner Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                        Loading cycle visits...
                      </TableCell>
                    </TableRow>
                  ) : filteredVisits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                        No visits match your filter criteria for {cyclePeriod}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredVisits.map((cv: any) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      let daysOverdue = 0;
                      if (cv.status !== "completed" && cv.target_due_date) {
                        const targetMs = new Date(cv.target_due_date).getTime();
                        if (today.getTime() > targetMs) {
                          daysOverdue = Math.floor((today.getTime() - targetMs) / 86400_000);
                        }
                      }

                      return (
                        <TableRow key={cv.id} className="hover:bg-muted/30">
                          <TableCell className="py-3.5 px-6 font-semibold">
                            <div>
                              <div className="text-foreground">{cv.sites?.name || "Solar Site"}</div>
                              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3 shrink-0" />
                                {cv.sites?.location || "Maharashtra"}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="py-3.5 px-4 font-mono text-muted-foreground">
                            {cv.target_due_date || "—"}
                          </TableCell>

                          <TableCell className="py-3.5 px-4 font-mono font-semibold text-foreground">
                            {cv.scheduled_date || <span className="text-muted-foreground italic font-normal">Unassigned</span>}
                          </TableCell>

                          <TableCell className="py-3.5 px-4 font-medium">
                            {cv.technician_teams ? (
                              <Badge variant="outline" className="text-[10px]" style={{ borderColor: cv.technician_teams.color_code || "#3b82f6" }}>
                                {cv.technician_teams.name}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground italic">Unassigned</span>
                            )}
                          </TableCell>

                          <TableCell className="py-3.5 px-4">
                            <Badge
                              variant={
                                cv.status === "completed"
                                  ? "success"
                                  : ["published", "scheduled", "in_progress", "en_route"].includes(cv.status)
                                  ? "default"
                                  : "secondary"
                              }
                              className="text-[10px] uppercase font-semibold"
                            >
                              {cv.status}
                            </Badge>
                          </TableCell>

                          <TableCell className="py-3.5 px-4 font-mono">
                            {daysOverdue > 0 ? (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5">
                                {daysOverdue}d overdue
                              </Badge>
                            ) : (
                              <span className="text-emerald-600 font-semibold text-[11px]">On time</span>
                            )}
                          </TableCell>

                          <TableCell className="py-3.5 px-6 text-right text-xs text-muted-foreground max-w-sm break-words leading-tight">
                            {cv.planner_rationale || "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Photographic Evidence Gallery */}
        <TabsContent value="evidence" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {logs.map((log: any) => (
              <Card key={log.id} className="border shadow-sm overflow-hidden flex flex-col justify-between">
                <div>
                  <CardHeader className="p-4 pb-2 border-b bg-muted/20">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-bold">{log.sites?.name || "Solar Site"}</CardTitle>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {log.performed_at ? formatDate(log.performed_at) : "Date N/A"}
                      </Badge>
                    </div>
                    <CardDescription className="text-[11px] break-words leading-tight mt-0.5">
                      {log.sites?.location || "Site location"}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="p-4 space-y-3">
                    <CleaningEvidenceLinks
                      beforePhotoUrl={log.before_photo_url}
                      afterPhotoUrl={log.after_photo_url}
                      className="border p-2 rounded-lg bg-muted/10"
                    />

                    {log.remarks && (
                      <div className="text-xs text-muted-foreground bg-muted/30 p-2.5 rounded-lg border">
                        <span className="font-semibold text-foreground">Technician Notes:</span> {log.remarks}
                      </div>
                    )}
                  </CardContent>
                </div>

                <div className="p-3 border-t bg-muted/10 text-[10px] text-muted-foreground flex justify-between">
                  <span>Logged by: <strong>{log.profiles?.full_name || "Field Tech"}</strong></span>
                  {log.next_due_on && <span>Next Due: <strong>{formatDate(log.next_due_on)}</strong></span>}
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
