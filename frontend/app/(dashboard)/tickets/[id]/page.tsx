"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AlarmIntelligenceCard } from "@/components/alarm-intelligence-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Camera,
  Image as ImageIcon,
  ArrowLeft,
  Wrench,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileText,
  Building2,
  ExternalLink,
  UserCheck,
  Upload,
  ShieldAlert,
} from "lucide-react";
import type { Profile } from "@/lib/types";
import { CleaningEvidenceLinks } from "@/components/cleaning-evidence-links";

const statusColors: Record<string, string> = {
  open: "bg-red-100 text-red-700 border-red-300",
  assigned: "bg-yellow-100 text-yellow-700 border-yellow-300",
  in_progress: "bg-blue-100 text-blue-700 border-blue-300",
  resolved: "bg-green-100 text-green-700 border-green-300",
  closed: "bg-gray-200 text-gray-700 border-gray-300",
  on_hold: "bg-amber-100 text-amber-800 border-amber-300",
};

const priorityColors: Record<string, string> = {
  p1: "bg-red-100 text-red-700 border-red-300 font-bold",
  p2: "bg-orange-100 text-orange-700 border-orange-300",
  p3: "bg-yellow-100 text-yellow-700 border-yellow-300",
  p4: "bg-blue-100 text-blue-700 border-blue-300",
};

const severityColors: Record<string, string> = {
  L1: "bg-blue-100 text-blue-700 border-blue-300",
  L2: "bg-yellow-100 text-yellow-700 border-yellow-300",
  L3: "bg-red-100 text-red-700 border-red-300 font-bold",
};

export default function TicketDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = createClient();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [ticket, setTicket] = useState<any>(null);
  const [linkedWorkOrder, setLinkedWorkOrder] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Technician log form states
  const [beforePhoto, setBeforePhoto] = useState<string>("");
  const [afterPhoto, setAfterPhoto] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");
  const [uploadingKind, setUploadingKind] = useState<"before" | "after" | null>(null);
  const [showLogForm, setShowLogForm] = useState(false);
  const [savingLog, setSavingLog] = useState(false);

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    setLoading(true);
    await Promise.all([fetchProfile(), fetchTicket(), fetchLinkedWorkOrder(), fetchActivities()]);
    setLoading(false);
  }

  async function fetchProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      setProfile(prof as Profile);
    }
  }

  async function fetchTicket() {
    const { data } = await supabase
      .from("tickets")
      .select(`
        *,
        organizations(name),
        sites(name, location),
        alerts!tickets_alert_id_fkey(id, title, code, alarm_code, oem, description)
      `)
      .eq("id", id)
      .maybeSingle();

    let targetTicket = data;

    if (!targetTicket) {
      try {
        const apiRes = await fetch(`/api/tickets/${id}`);
        if (apiRes.ok) {
          const apiJson = await apiRes.json();
          targetTicket = apiJson.ticket;
        }
      } catch (err) {
        console.error("API ticket fallback fetch error:", err);
      }
    }

    if (targetTicket) {
      let assigneeProfile = targetTicket.profiles || null;
      if (targetTicket.assignee_id && !assigneeProfile) {
        const { data: profData } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", targetTicket.assignee_id)
          .maybeSingle();
        assigneeProfile = profData;
      }

      const enrichedTicket = {
        ...targetTicket,
        profiles: assigneeProfile,
      };

      setTicket(enrichedTicket);
      setRemarks(targetTicket.technician_remarks || "");
      setBeforePhoto(targetTicket.before_photo_url || "");
      setAfterPhoto(targetTicket.after_photo_url || "");
    }
  }

  async function fetchLinkedWorkOrder() {
    const { data } = await supabase
      .from("work_orders")
      .select(`
        *,
        profiles:technician_id(full_name, email, phone)
      `)
      .eq("ticket_id", id)
      .order("created_at", { ascending: false })
      .maybeSingle();

    setLinkedWorkOrder(data);
  }

  async function fetchActivities() {
    const { data } = await supabase
      .from("ticket_activity")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: false });

    if (data) {
      setActivities(data);
    }
  }

  async function uploadPhoto(file: File, kind: "before" | "after") {
    setUploadingKind(kind);
    try {
      const path = `tickets/${crypto.randomUUID()}-${kind}-${file.name}`;
      const { error } = await supabase.storage
        .from("solar-uploads")
        .upload(path, file, { upsert: true });

      if (error) {
        toast.error(error.message);
        return;
      }

      const { data } = supabase.storage.from("solar-uploads").getPublicUrl(path);

      if (kind === "before") {
        setBeforePhoto(data.publicUrl);
      } else {
        setAfterPhoto(data.publicUrl);
      }

      toast.success(`${kind === "before" ? "Before Work" : "After Work"} photo uploaded`);
    } finally {
      setUploadingKind(null);
    }
  }

  async function saveTechnicianLog() {
    if (!beforePhoto && !afterPhoto) {
      return toast.error("At least one evidence photo (Before or After) is required to save the field log.");
    }
    
    setSavingLog(true);
    try {
      const { error } = await supabase
        .from("tickets")
        .update({
          before_photo_url: beforePhoto,
          after_photo_url: afterPhoto,
          technician_remarks: remarks,
        })
        .eq("id", id);

      if (error) {
        return toast.error(error.message);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      await supabase.from("ticket_activity").insert({
        ticket_id: id,
        activity_type: "update",
        message: `Field work log updated by ${profile?.full_name || user?.email || "Technician"}.`,
      });

      toast.success("Operational log saved successfully");
      setShowLogForm(false);
      fetchData();
    } finally {
      setSavingLog(false);
    }
  }

  async function updateStatus(status: string) {
    const updates: any = {
      status,
    };

    if (status === "resolved") {
      updates.resolved_at = new Date().toISOString();
    }

    const { error } = await supabase.from("tickets").update(updates).eq("id", id);

    if (error) {
      return toast.error(error.message);
    }

    await supabase.from("ticket_activity").insert({
      ticket_id: id,
      activity_type: "status_change",
      message: `Ticket marked as ${status.replace("_", " ")} by ${profile?.full_name || "Admin"}.`,
    });

    toast.success(`Ticket status updated to ${status.replace("_", " ")}`);
    fetchData();
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground animate-pulse">Loading ticket details...</p>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-8 text-center space-y-4">
        <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
        <h1 className="text-xl font-bold">Ticket Not Found</h1>
        <Link href="/tickets">
          <Button variant="outline">Back to Tickets</Button>
        </Link>
      </div>
    );
  }

  const isAdmin = ["super_admin", "epc_admin"].includes(profile?.role || "");
  const isTechnician = profile?.role === "technician";
  const hasLogData = Boolean(beforePhoto || afterPhoto || remarks);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto pb-12" data-testid="ticket-details-page">
      {/* Back button */}
      <div>
        <Link
          href="/tickets"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Tickets
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{ticket.title}</h1>
          <p className="mt-1 text-xs text-muted-foreground font-mono">ID: {ticket.id}</p>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <Badge variant="outline" className={`text-xs px-3 py-1 font-semibold capitalize ${statusColors[ticket.status] || ""}`}>
            {ticket.status.replace("_", " ")}
          </Badge>

          <Badge variant="outline" className={`text-xs px-3 py-1 font-semibold uppercase ${priorityColors[ticket.priority] || ""}`}>
            {ticket.priority}
          </Badge>

          {ticket.severity_level && (
            <Badge variant="outline" className={`text-xs px-3 py-1 font-semibold ${severityColors[ticket.severity_level] || ""}`}>
              {ticket.severity_level}
            </Badge>
          )}
        </div>
      </div>

      {/* Info Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Ticket Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Ticket Type:</span>
              <strong className="text-foreground">{ticket.ticket_type || "Standard Alert"}</strong>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Severity:</span>
              <strong className="text-foreground">{ticket.severity_level || "Not set"}</strong>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Source:</span>
              <strong className="text-foreground">{ticket.source || "System Alert"}</strong>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Auto Resolvable:</span>
              <strong className="text-foreground">{ticket.auto_resolvable ? "Yes" : "No"}</strong>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Created:</span>
              <span className="font-mono text-foreground">{new Date(ticket.created_at).toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Resolved:</span>
              <span className="font-mono text-foreground">
                {ticket.resolved_at ? new Date(ticket.resolved_at).toLocaleString() : "Not resolved"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Linked Records</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Organization:</span>
              <strong className="text-foreground">{ticket.organizations?.name || "Unknown Organization"}</strong>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Site:</span>
              <strong className="text-foreground">
                {ticket.sites?.name} ({ticket.sites?.location || "No location"})
              </strong>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Alert:</span>
              <strong className="text-foreground">{ticket.alerts?.title || "No linked alert"}</strong>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Assigned Technician:</span>
              <strong className="text-foreground">{ticket.profiles?.full_name || "Unassigned"}</strong>
            </div>
          </CardContent>
        </Card>
      </div>

      {ticket.description && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Description & Context</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
          </CardContent>
        </Card>
      )}

      {/* ALARM INTELLIGENCE & FIELD GUIDANCE */}
      {(ticket.alerts?.alarm_code ||
        ticket.alerts?.code ||
        ticket.title?.includes("1045") ||
        ticket.title?.includes("1021") ||
        ticket.title?.includes("1011")) && (
        <AlarmIntelligenceCard
          code={
            ticket.alerts?.alarm_code ||
            ticket.alerts?.code ||
            (ticket.title?.includes("1045")
              ? "1045"
              : ticket.title?.includes("1021")
              ? "1021"
              : ticket.title?.includes("1011")
              ? "1011"
              : "1045")
          }
          oem={ticket.alerts?.oem || "solis"}
        />
      )}

      {/* ───────────────────────────────────────────────────────── */}
      {/* FIELD DISPATCH & SERVICE REQUEST STATUS */}
      {/* ───────────────────────────────────────────────────────── */}
      <Card className="shadow-sm border-amber-200/80 bg-amber-50/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Wrench className="h-4 w-4 text-amber-600" />
                Field Dispatch &amp; Service Request
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Technician field assignment status for this ticket
              </CardDescription>
            </div>
            {linkedWorkOrder && (
              <Badge variant="outline" className="capitalize bg-amber-100 text-amber-900 border-amber-300 font-semibold">
                {linkedWorkOrder.status.replace("_", " ")}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {linkedWorkOrder ? (
            <div className="bg-card p-4 rounded-lg border space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                    Linked Service Request #{linkedWorkOrder.id.slice(0, 8)}
                  </span>
                  <h3 className="font-bold text-base mt-1 text-foreground">{linkedWorkOrder.title}</h3>
                </div>

                <Link href={`/service-requests/${linkedWorkOrder.id}`}>
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white font-semibold">
                    Open Service Request Execution <ExternalLink className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </Link>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-muted/40 p-2.5 rounded border">
                <div>
                  <span className="text-muted-foreground block">Assigned Tech</span>
                  <strong className="text-foreground">{linkedWorkOrder.profiles?.full_name || "Unassigned"}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground block">Scheduled Date</span>
                  <strong className="text-foreground font-mono">{linkedWorkOrder.scheduled_date || "Not scheduled"}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground block">Est. Duration</span>
                  <strong className="text-foreground">{linkedWorkOrder.estimated_duration_mins || 60} mins</strong>
                </div>
              </div>

              <p className="text-xs text-muted-foreground italic">
                * Note: Ticket status updates automatically when field service requests are completed by the technician and OEM telemetry clears.
              </p>
            </div>
          ) : (
            <div className="bg-card p-4 rounded-lg border border-dashed text-center space-y-3">
              <p className="text-xs text-muted-foreground">
                No field service request has been created for this ticket yet.
              </p>
              {isAdmin && (
                <Link
                  href={`/service-requests?site_id=${ticket.site_id}&ticket_id=${ticket.id}&title=${encodeURIComponent("Task: " + ticket.title)}`}
                  className="inline-block"
                >
                  <Button className="bg-amber-600 hover:bg-amber-700 text-white font-semibold">
                    <Wrench className="h-4 w-4 mr-1.5" /> + Dispatch Service Request to Field Technician
                  </Button>
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ───────────────────────────────────────────────────────── */}
      {/* TECHNICIAN OPERATIONAL LOG & EVIDENCE */}
      {/* ───────────────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Camera className="h-4 w-4 text-primary" />
                Technician Operational Log &amp; Evidence
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Before &amp; after work photos and field execution remarks logged by technician
              </CardDescription>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLogForm(!showLogForm)}
              className="text-xs"
            >
              {showLogForm ? "Close Form" : hasLogData ? "Edit Operational Log" : "Add Operational Log"}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* READ-ONLY VIEW OF LOG & EVIDENCE */}
          {!showLogForm && (
            <div className="space-y-4">
              <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
                <span className="text-xs font-semibold text-muted-foreground block">
                  Service Evidence Records
                </span>
                <CleaningEvidenceLinks
                  beforePhotoUrl={beforePhoto}
                  afterPhotoUrl={afterPhoto}
                />
              </div>
            </div>
          )}

          {/* EDIT/UPLOAD LOG FORM */}
          {showLogForm && (
            <div className="space-y-4 pt-2 border-t">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Upload Before Work Photo</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0], "before")}
                  />
                  {uploadingKind === "before" && (
                    <p className="text-xs text-muted-foreground animate-pulse">Uploading before photo...</p>
                  )}
                  {beforePhoto && (
                    <div className="mt-2 relative aspect-video w-32 rounded border overflow-hidden">
                      <img src={beforePhoto} alt="Before preview" className="object-cover w-full h-full" />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Upload After Work Photo</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0], "after")}
                  />
                  {uploadingKind === "after" && (
                    <p className="text-xs text-muted-foreground animate-pulse">Uploading after photo...</p>
                  )}
                  {afterPhoto && (
                    <div className="mt-2 relative aspect-video w-32 rounded border overflow-hidden">
                      <img src={afterPhoto} alt="After preview" className="object-cover w-full h-full" />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">Technician Remarks &amp; Actions Taken</Label>
                <Textarea
                  placeholder="Describe findings, repair actions taken, components tested or replaced..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="h-28"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowLogForm(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={saveTechnicianLog} disabled={savingLog || Boolean(uploadingKind)}>
                  {savingLog ? "Saving..." : "Save Operational Log"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ───────────────────────────────────────────────────────── */}
      {/* ADMIN STATUS OVERRIDES */}
      {/* ───────────────────────────────────────────────────────── */}
      {isAdmin && (
        <Card className="shadow-sm border-muted bg-muted/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              Manual Exception Controls (Advanced)
            </CardTitle>
            <CardDescription className="text-xs">
              Usually, you just dispatch a Service Request and the ticket updates itself. Use these buttons ONLY if you need to bypass the normal process.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 border rounded-md bg-card space-y-1">
                <span className="font-semibold text-slate-800 block">Close Ticket (False Alarm)</span>
                <p className="text-muted-foreground text-[11px]">Use this if the alert was a mistake (e.g., grid outage, duplicate) and no action is needed.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateStatus("closed")}
                  className="mt-1 bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200 h-7 text-xs"
                >
                  Close Ticket
                </Button>
              </div>

              <div className="p-2.5 border rounded-md bg-card space-y-1">
                <span className="font-semibold text-amber-900 block">Put On Hold (Awaiting Parts)</span>
                <p className="text-muted-foreground text-[11px]">Use this to pause the ticket if you are waiting for spare parts or site access.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateStatus("on_hold")}
                  className="mt-1 bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 h-7 text-xs"
                >
                  Put On Hold
                </Button>
              </div>

              <div className="p-2.5 border rounded-md bg-card space-y-1">
                <span className="font-semibold text-green-900 block">Resolve (Fixed Remotely)</span>
                <p className="text-muted-foreground text-[11px]">Use this if you fixed the issue from the command center and DO NOT need to send a technician.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateStatus("resolved")}
                  className="mt-1 bg-green-50 text-green-800 border-green-300 hover:bg-green-100 h-7 text-xs"
                >
                  Resolve Ticket
                </Button>
              </div>

              <div className="p-2.5 border rounded-md bg-card space-y-1">
                <span className="font-semibold text-blue-900 block">Reopen Ticket</span>
                <p className="text-muted-foreground text-[11px]">Use this if you accidentally closed a ticket and need to investigate it again.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateStatus("in_progress")}
                  className="mt-1 bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100 h-7 text-xs"
                >
                  Reopen Ticket
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ───────────────────────────────────────────────────────── */}
      {/* ACTIVITY TIMELINE */}
      {/* ───────────────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Activity &amp; Audit Log</CardTitle>
          <CardDescription className="text-xs">
            Chronological audit trail of ticket events and field log updates
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {activities.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No activity recorded yet for this ticket.</p>
          ) : (
            activities.map((activity) => (
              <div key={activity.id} className="border rounded-lg p-3 text-xs space-y-1 bg-card">
                <p className="text-foreground font-medium">{activity.message}</p>
                <p className="text-muted-foreground font-mono text-[11px]">
                  {new Date(activity.created_at).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}