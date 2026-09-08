"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus,
  Wrench,
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Play,
  Navigation,
  Check,
  Search,
  UserCheck,
  SprayCan,
  FileText,
  XCircle,
  Filter,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type {
  WorkOrder,
  WorkOrderType,
  WorkOrderStatus,
  Site,
  Profile,
  Ticket,
} from "@/lib/types";

const typeLabels: Record<WorkOrderType, string> = {
  cleaning: "Cleaning",
  maintenance: "Maintenance",
  inspection: "Inspection",
  alarm_investigation: "Alarm Investigation",
};

const typeBadges: Record<WorkOrderType, string> = {
  cleaning: "bg-emerald-100 text-emerald-800 border-emerald-300",
  maintenance: "bg-blue-100 text-blue-800 border-blue-300",
  inspection: "bg-purple-100 text-purple-800 border-purple-300",
  alarm_investigation: "bg-amber-100 text-amber-800 border-amber-300",
};

const statusBadges: Record<WorkOrderStatus, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-300",
  scheduled: "bg-blue-100 text-blue-700 border-blue-300",
  en_route: "bg-indigo-100 text-indigo-700 border-indigo-300",
  in_progress: "bg-amber-100 text-amber-800 border-amber-300",
  completed: "bg-green-100 text-green-800 border-green-300",
  cancelled: "bg-red-100 text-red-700 border-red-300",
};

function WorkOrdersContent() {
  const sb = createClient();
  const searchParams = useSearchParams();

  const querySiteId = searchParams.get("site_id");
  const queryTicketId = searchParams.get("ticket_id");
  const queryTitle = searchParams.get("title");

  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [techFilter, setTechFilter] = useState<string>("all");
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Create Work Order state
  const [createOpen, setCreateOpen] = useState(Boolean(querySiteId || queryTicketId));
  const [createForm, setCreateForm] = useState({
    site_id: querySiteId || "",
    type: "maintenance" as WorkOrderType,
    title: queryTitle || "",
    description: "",
    scheduled_date: "",
    estimated_duration_mins: 60,
    technician_id: "unassigned",
    ticket_id: queryTicketId || "none",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    initData();
  }, []);

  async function initData() {
    setLoading(true);
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) return;

    const { data: prof } = await sb
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    setCurrentProfile(prof as Profile);

    await loadAllData(prof as Profile);
    setLoading(false);
  }

  async function loadAllData(prof: Profile) {
    let woQuery = sb
      .from("work_orders")
      .select(
        `
        *,
        sites(id, name, location, client_id, org_id),
        profiles!work_orders_technician_id_fkey(id, full_name, email),
        tickets(id, title, priority, status)
      `
      )
      .order("created_at", { ascending: false });

    // Fetch related master data
    const [{ data: woData }, { data: siteData }, { data: techData }, { data: ticketData }] =
      await Promise.all([
        woQuery,
        sb.from("sites").select("*"),
        sb.from("profiles").select("*").in("role", ["technician", "epc_admin", "super_admin"]),
        sb.from("tickets").select("*").in("status", ["open", "in_progress", "on_hold"]),
      ]);

    setWorkOrders(woData ?? []);
    setSites((siteData as Site[]) ?? []);
    setTechnicians((techData as Profile[]) ?? []);
    setTickets((ticketData as Ticket[]) ?? []);
  }

  async function handleCreateWorkOrder() {
    if (!createForm.site_id) {
      return toast.error("Site is required");
    }
    if (!createForm.title.trim()) {
      return toast.error("Work Order title is required");
    }

    const selectedSite = sites.find((s) => s.id === createForm.site_id);
    if (!selectedSite) {
      return toast.error("Invalid site selected");
    }

    const techId =
      createForm.technician_id === "unassigned" ? null : createForm.technician_id;

    // Organization validation rule
    if (techId) {
      const selectedTech = technicians.find((t) => t.id === techId);
      if (
        selectedTech &&
        selectedTech.org_id &&
        selectedSite.org_id &&
        selectedTech.org_id !== selectedSite.org_id
      ) {
        return toast.error(
          "Technician must belong to the same organization as the site"
        );
      }
    }

    const ticketId =
      createForm.ticket_id === "none" ? null : createForm.ticket_id;

    // Status transition rule: scheduled if technician + date present, else draft
    const finalStatus: WorkOrderStatus =
      techId && createForm.scheduled_date ? "scheduled" : "draft";

    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await sb.auth.getUser();

      const { error } = await sb.from("work_orders").insert({
        org_id: selectedSite.org_id,
        site_id: selectedSite.id,
        ticket_id: ticketId,
        technician_id: techId,
        created_by: user?.id ?? null,
        title: createForm.title.trim(),
        description: createForm.description.trim() || null,
        type: createForm.type,
        status: finalStatus,
        scheduled_date: createForm.scheduled_date || null,
        estimated_duration_mins: createForm.estimated_duration_mins || 60,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Work Order created successfully");
      setCreateOpen(false);
      setCreateForm({
        site_id: "",
        type: "cleaning",
        title: "",
        description: "",
        scheduled_date: "",
        estimated_duration_mins: 60,
        technician_id: "unassigned",
        ticket_id: "none",
      });

      if (currentProfile) {
        loadAllData(currentProfile);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Filtered work orders calculation
  const todayStr = new Date().toISOString().slice(0, 10);

  const filteredWorkOrders = workOrders.filter((wo) => {
    if (statusFilter !== "all" && wo.status !== statusFilter) return false;
    if (typeFilter !== "all" && wo.type !== typeFilter) return false;
    if (techFilter !== "all") {
      if (techFilter === "unassigned" && wo.technician_id !== null) return false;
      if (techFilter !== "unassigned" && wo.technician_id !== techFilter)
        return false;
    }
    if (siteFilter !== "all" && wo.site_id !== siteFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = wo.title?.toLowerCase().includes(q);
      const matchSite = wo.sites?.name?.toLowerCase().includes(q);
      if (!matchTitle && !matchSite) return false;
    }

    return true;
  });

  // Summary counts for Admin Overview
  const countDraft = workOrders.filter((w) => w.status === "draft").length;
  const countScheduled = workOrders.filter((w) => w.status === "scheduled").length;
  const countEnRoute = workOrders.filter((w) => w.status === "en_route").length;
  const countInProgress = workOrders.filter((w) => w.status === "in_progress").length;
  const countCompleted = workOrders.filter((w) => w.status === "completed").length;
  const countCancelled = workOrders.filter((w) => w.status === "cancelled").length;
  const countToday = workOrders.filter((w) => w.scheduled_date === todayStr).length;
  const countOverdue = workOrders.filter(
    (w) =>
      w.scheduled_date &&
      w.scheduled_date < todayStr &&
      ["draft", "scheduled"].includes(w.status)
  ).length;

  if (loading) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground animate-pulse">
          Loading Work Orders...
        </p>
      </div>
    );
  }

  const role = currentProfile?.role || "client";

  // ─────────────────────────────────────────────────────────
  // TECHNICIAN "MY JOBS" MOBILE-FIRST VIEW
  // ─────────────────────────────────────────────────────────
  if (role === "technician") {
    const myJobs = workOrders.filter(
      (wo) => wo.technician_id === currentProfile?.id
    );

    const activeJob = myJobs.find((wo) =>
      ["en_route", "in_progress"].includes(wo.status)
    );
    const todayJobs = myJobs.filter(
      (wo) => wo.scheduled_date === todayStr && !["completed", "cancelled"].includes(wo.status)
    );
    const upcomingJobs = myJobs.filter(
      (wo) =>
        wo.scheduled_date &&
        wo.scheduled_date > todayStr &&
        !["completed", "cancelled"].includes(wo.status)
    );
    const completedJobs = myJobs.filter((wo) => wo.status === "completed");

    return (
      <div className="space-y-6 max-w-xl mx-auto pb-12" data-testid="technician-my-jobs">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">My Jobs</h1>
            <p className="text-sm text-muted-foreground">
              Field execution tasks for today &amp; upcoming sites
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/technician/route">
              <Button size="sm" variant="outline" className="text-xs font-semibold">
                <Navigation className="h-3.5 w-3.5 mr-1 text-primary" /> Today's Route
              </Button>
            </Link>
            <Badge variant="outline" className="font-mono text-xs px-2.5 py-1 bg-primary/5">
              {todayStr}
            </Badge>
          </div>
        </div>

        {/* ACTIVE JOB SURFACED CARD */}
        {activeJob && (
          <Card className="border-amber-400 bg-amber-50/50 shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                  Active Job In Progress
                </span>
                <Badge variant="outline" className={statusBadges[activeJob.status as WorkOrderStatus]}>
                  {activeJob.status.replace("_", " ")}
                </Badge>
              </div>
              <CardTitle className="text-xl mt-1">{activeJob.title}</CardTitle>
              <CardDescription className="flex items-center gap-1 text-sm font-medium text-foreground/80">
                <MapPin className="h-4 w-4 text-amber-600 shrink-0" />
                {activeJob.sites?.name} ({activeJob.sites?.location})
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground bg-white/80 p-2.5 rounded-lg border">
                <span>Type: <strong className="text-foreground">{typeLabels[activeJob.type as WorkOrderType]}</strong></span>
                <span>Est. Duration: <strong className="text-foreground">{activeJob.estimated_duration_mins} mins</strong></span>
              </div>
              <Link href={`/work-orders/${activeJob.id}`} className="block">
                <Button className="w-full h-12 text-base bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow">
                  Continue Active Job
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* TODAY'S JOBS */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Today's Schedule ({todayJobs.length})
            </h2>
          </div>

          {todayJobs.length === 0 && !activeJob && (
            <Card className="border-dashed p-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
              <p className="font-medium text-sm">No remaining jobs for today</p>
              <p className="text-xs text-muted-foreground mt-1">
                You are all caught up for today's scheduled site visits.
              </p>
            </Card>
          )}

          {todayJobs.map((job) => (
            <Card key={job.id} className="hover:border-primary/50 transition shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${typeBadges[job.type as WorkOrderType]}`}>
                      {typeLabels[job.type as WorkOrderType]}
                    </span>
                    <h3 className="font-bold text-base mt-1.5 leading-snug">
                      {job.title}
                    </h3>
                  </div>
                  <Badge variant="outline" className={statusBadges[job.status as WorkOrderStatus]}>
                    {job.status.replace("_", " ")}
                  </Badge>
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                    {job.sites?.name}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> {job.estimated_duration_mins} mins
                    </span>
                    {job.tickets && (
                      <span className="flex items-center gap-1 text-amber-700 font-medium">
                        <FileText className="h-3.5 w-3.5" /> Ticket linked
                      </span>
                    )}
                  </div>
                </div>

                <Link href={`/work-orders/${job.id}`} className="block pt-1">
                  <Button className="w-full h-10 text-sm font-semibold" variant="outline">
                    View &amp; Start Job
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* UPCOMING JOBS */}
        {upcomingJobs.length > 0 && (
          <div className="space-y-3 pt-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Upcoming Assigned ({upcomingJobs.length})
            </h2>
            {upcomingJobs.map((job) => (
              <Card key={job.id} className="bg-card/50">
                <CardContent className="p-3.5 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-semibold text-sm">{job.title}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {job.sites?.name} &bull; {job.scheduled_date}
                    </p>
                  </div>
                  <Link href={`/work-orders/${job.id}`}>
                    <Button variant="ghost" size="sm">
                      Details
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* COMPLETED JOBS HISTORY */}
        {completedJobs.length > 0 && (
          <div className="space-y-2 pt-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Completed Recently ({completedJobs.length})
            </h2>
            {completedJobs.slice(0, 3).map((job) => (
              <div key={job.id} className="text-xs p-3 rounded-lg border bg-muted/30 flex items-center justify-between">
                <div>
                  <span className="font-medium text-foreground">{job.title}</span>
                  <p className="text-muted-foreground">{job.sites?.name} &bull; Done {job.completed_at ? formatDateTime(job.completed_at) : "recently"}</p>
                </div>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Completed</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // CLIENT READ-ONLY VIEW
  // ─────────────────────────────────────────────────────────
  if (role === "client") {
    return (
      <div className="space-y-6" data-testid="client-work-orders">
        <div>
          <h1 className="text-3xl font-display font-semibold">Site Service &amp; Work Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Read-only operational timeline for field maintenance and cleaning visits across your sites.
          </p>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Work Order</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Scheduled Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Completed At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workOrders.map((wo) => (
                  <TableRow key={wo.id}>
                    <TableCell className="font-semibold text-foreground">
                      {wo.title}
                    </TableCell>
                    <TableCell className="text-sm">{wo.sites?.name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${typeBadges[wo.type as WorkOrderType]}`}>
                        {typeLabels[wo.type as WorkOrderType]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{wo.scheduled_date || "TBD"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${statusBadges[wo.status as WorkOrderStatus]}`}>
                        {wo.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {wo.completed_at ? formatDateTime(wo.completed_at) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {workOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No work orders scheduled or recorded for your sites yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // ADMIN / EPC ADMIN OPERATIONS DASHBOARD & MANAGEMENT
  // ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6" data-testid="admin-work-orders">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-semibold">Work Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dispatch, route, and manage field technicians across solar operations.
          </p>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="new-work-order-btn" className="h-10 px-4">
              <Plus className="h-4 w-4 mr-2" /> New Work Order
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Work Order</DialogTitle>
              <DialogDescription>
                Dispatch a new field task for maintenance, cleaning, or inspection.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>
                  Site <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={createForm.site_id}
                  onValueChange={(v) =>
                    setCreateForm({ ...createForm, site_id: v })
                  }
                >
                  <SelectTrigger data-testid="wo-site-select">
                    <SelectValue placeholder="Select target solar site" />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.location})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Work Order Type</Label>
                  <Select
                    value={createForm.type}
                    onValueChange={(v) =>
                      setCreateForm({
                        ...createForm,
                        type: v as WorkOrderType,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cleaning">Cleaning</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="inspection">Inspection</SelectItem>
                      <SelectItem value="alarm_investigation">
                        Alarm Investigation
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Est. Duration (Mins)</Label>
                  <Input
                    type="number"
                    min={15}
                    step={15}
                    value={createForm.estimated_duration_mins}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        estimated_duration_mins:
                          parseInt(e.target.value) || 60,
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>
                  Title / Task Summary <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder="e.g. Scheduled Monthly Panel Wash"
                  value={createForm.title}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, title: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label>Work Instructions / Description</Label>
                <Textarea
                  placeholder="Provide specific notes for the field technician..."
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      description: e.target.value,
                    })
                  }
                  className="h-20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Assign Technician</Label>
                  <Select
                    value={createForm.technician_id}
                    onValueChange={(v) =>
                      setCreateForm({ ...createForm, technician_id: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned (Draft)</SelectItem>
                      {technicians.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.full_name || t.email} ({t.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Scheduled Date</Label>
                  <Input
                    type="date"
                    value={createForm.scheduled_date}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        scheduled_date: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Link Originating Ticket (Optional)</Label>
                <Select
                  value={createForm.ticket_id}
                  onValueChange={(v) =>
                    setCreateForm({ ...createForm, ticket_id: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Stand-alone Job)</SelectItem>
                    {tickets.map((tk) => (
                      <SelectItem key={tk.id} value={tk.id}>
                        {tk.title} (Ticket #{tk.id.slice(0, 6)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <p className="text-xs text-muted-foreground italic">
                Note: Work orders with an assigned technician and scheduled date will automatically mark as <strong>Scheduled</strong>. Otherwise saved as <strong>Draft</strong>.
              </p>
            </div>

            <DialogFooter>
              <Button
                onClick={handleCreateWorkOrder}
                disabled={submitting}
                className="w-full"
              >
                {submitting ? "Creating..." : "Create & Dispatch Work Order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* OPERATIONAL SUMMARY HEADER CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground font-medium uppercase">Draft</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{countDraft}</p>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-blue-700 font-medium uppercase">Scheduled</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">{countScheduled}</p>
          </CardContent>
        </Card>

        <Card className="bg-indigo-50 border-indigo-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-indigo-700 font-medium uppercase">En Route</p>
            <p className="text-2xl font-bold text-indigo-900 mt-1">{countEnRoute}</p>
          </CardContent>
        </Card>

        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-amber-700 font-medium uppercase">In Progress</p>
            <p className="text-2xl font-bold text-amber-900 mt-1">{countInProgress}</p>
          </CardContent>
        </Card>

        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-emerald-700 font-medium uppercase">Completed</p>
            <p className="text-2xl font-bold text-emerald-900 mt-1">{countCompleted}</p>
          </CardContent>
        </Card>

        <Card className="bg-rose-50 border-rose-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-rose-700 font-medium uppercase">Cancelled</p>
            <p className="text-2xl font-bold text-rose-900 mt-1">{countCancelled}</p>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-primary font-semibold uppercase">Today's Jobs</p>
            <p className="text-2xl font-bold text-primary mt-1">{countToday}</p>
          </CardContent>
        </Card>

        <Card className="bg-red-100 border-red-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-red-800 font-bold uppercase">Overdue</p>
            <p className="text-2xl font-bold text-red-900 mt-1">{countOverdue}</p>
          </CardContent>
        </Card>
      </div>

      {/* FILTERS & SEARCH */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="h-4 w-4" /> Filter &amp; Search Operations
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-3 text-muted-foreground" />
              <Input
                placeholder="Search site or title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="en_route">En Route</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Job Types</SelectItem>
                <SelectItem value="cleaning">Cleaning</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="inspection">Inspection</SelectItem>
                <SelectItem value="alarm_investigation">Alarm Investigation</SelectItem>
              </SelectContent>
            </Select>

            <Select value={techFilter} onValueChange={setTechFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Technicians" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Technicians</SelectItem>
                <SelectItem value="unassigned">Unassigned Only</SelectItem>
                {technicians.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.full_name || t.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={siteFilter} onValueChange={setSiteFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Sites" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sites</SelectItem>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* TABLE WORK ORDERS LIST */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title &amp; Type</TableHead>
                <TableHead>Site Location</TableHead>
                <TableHead>Assigned Technician</TableHead>
                <TableHead>Scheduled Date</TableHead>
                <TableHead>Est. Mins</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWorkOrders.map((wo) => (
                <TableRow key={wo.id}>
                  <TableCell className="max-w-xs">
                    <Link
                      href={`/work-orders/${wo.id}`}
                      className="font-semibold text-primary hover:underline block truncate"
                    >
                      {wo.title}
                    </Link>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <span className={`px-1.5 py-0.5 rounded border text-[10px] uppercase font-medium ${typeBadges[wo.type as WorkOrderType]}`}>
                        {typeLabels[wo.type as WorkOrderType]}
                      </span>
                      {wo.tickets && (
                        <span className="text-amber-700 font-medium">
                          &bull; Ticket #{wo.tickets.id.slice(0, 6)}
                        </span>
                      )}
                    </span>
                  </TableCell>

                  <TableCell className="text-sm font-medium">
                    {wo.sites?.name || "—"}
                  </TableCell>

                  <TableCell className="text-sm">
                    {wo.profiles?.full_name || (
                      <span className="text-amber-600 italic">Unassigned</span>
                    )}
                  </TableCell>

                  <TableCell className="text-xs font-mono">
                    {wo.scheduled_date || (
                      <span className="text-muted-foreground font-sans italic">
                        Not scheduled
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-xs text-muted-foreground">
                    {wo.estimated_duration_mins}m
                  </TableCell>

                  <TableCell>
                    <Badge variant="outline" className={`capitalize ${statusBadges[wo.status as WorkOrderStatus]}`}>
                      {wo.status.replace("_", " ")}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-right">
                    <Link href={`/work-orders/${wo.id}`}>
                      <Button variant="ghost" size="sm">
                        Manage
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {filteredWorkOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    No work orders found matching the filter criteria.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function WorkOrdersPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground animate-pulse">Loading work orders...</div>}>
      <WorkOrdersContent />
    </Suspense>
  );
}
