"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AlarmIntelligenceCard } from "@/components/alarm-intelligence-card";
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
  MapPin,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Navigation,
  Check,
  SprayCan,
  FileText,
  XCircle,
  Camera,
  UserCheck,
  Building2,
  ArrowLeft,
  Upload,
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

const statusBadges: Record<WorkOrderStatus, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-300",
  scheduled: "bg-blue-100 text-blue-700 border-blue-300",
  en_route: "bg-indigo-100 text-indigo-700 border-indigo-300",
  in_progress: "bg-amber-100 text-amber-800 border-amber-300",
  completed: "bg-green-100 text-green-800 border-green-300",
  cancelled: "bg-red-100 text-red-700 border-red-300",
};

export default function ServiceRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const sb = createClient();

  const [workOrder, setWorkOrder] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Admin edit form
  const [editForm, setEditForm] = useState({
    technician_id: "unassigned",
    scheduled_date: "",
    estimated_duration_mins: 60,
    title: "",
    description: "",
  });

  // Completion dialog states
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completionNotes, setCompletionNotes] = useState("");
  const [evidencePhoto, setEvidencePhoto] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
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

    setProfile(prof as Profile);

    const [{ data: woData, error: woError }, { data: techData }] = await Promise.all([
      sb
        .from("work_orders")
        .select(
          `
          *,
          sites(*),
          tickets(id, title, priority, status, description, alert_id, alerts!tickets_alert_id_fkey(id, code, alarm_code, oem, title, description, severity))
        `
        )
        .eq("id", id)
        .maybeSingle(),
      sb.from("profiles").select("*").in("role", ["technician", "epc_admin", "super_admin"]),
    ]);

    let targetWO = woData;

    if (!targetWO) {
      try {
        const apiRes = await fetch(`/api/service-requests/${id}`);
        if (apiRes.ok) {
          const apiJson = await apiRes.json();
          targetWO = apiJson.service_request || apiJson.work_order;
        }
      } catch (err) {
        console.error("API fallback fetch error:", err);
      }
    }

    if (targetWO) {
      let assignedTechProfile = targetWO.profiles || null;
      if (targetWO.technician_id && !assignedTechProfile) {
        const { data: techProf } = await sb
          .from("profiles")
          .select("id, full_name, email, phone")
          .eq("id", targetWO.technician_id)
          .maybeSingle();
        assignedTechProfile = techProf;
      }

      const enrichedWO = {
        ...targetWO,
        profiles: assignedTechProfile,
      };

      setWorkOrder(enrichedWO);
      setEditForm({
        technician_id: targetWO.technician_id || "unassigned",
        scheduled_date: targetWO.scheduled_date || "",
        estimated_duration_mins: targetWO.estimated_duration_mins || 60,
        title: targetWO.title || "",
        description: targetWO.description || "",
      });
    }

    setTechnicians((techData as Profile[]) ?? []);
    setLoading(false);
  }

  // 1. Scheduled -> En Route
  async function handleStartTravel() {
    if (profile?.role === "technician" && workOrder.technician_id !== profile.id) {
      return toast.error("You can only update service requests assigned to you.");
    }

    setActionLoading(true);
    try {
      const { error } = await sb
        .from("work_orders")
        .update({
          status: "en_route",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) return toast.error(error.message);

      toast.success("Travel started — Service Request status set to En Route");
      fetchData();
    } finally {
      setActionLoading(false);
    }
  }

  // 2. En Route -> Check In (GPS Capture) -> In Progress
  async function handleCheckIn() {
    if (profile?.role === "technician" && workOrder.technician_id !== profile.id) {
      return toast.error("You can only update service requests assigned to you.");
    }

    setActionLoading(true);
    const checkInTime = new Date().toISOString();

    const applyCheckIn = async (lat: number | null, lng: number | null, note?: string) => {
      const { error } = await sb
        .from("work_orders")
        .update({
          status: "in_progress",
          check_in_at: checkInTime,
          check_in_lat: lat,
          check_in_lng: lng,
          updated_at: checkInTime,
        })
        .eq("id", id);

      if (error) {
        toast.error(error.message);
        setActionLoading(false);
        return;
      }

      if (note) {
        toast.info(note);
      }
      toast.success("Checked in at site — Service Request status set to In Progress");
      setActionLoading(false);
      fetchData();
    };

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          applyCheckIn(pos.coords.latitude, pos.coords.longitude);
        },
        (err) => {
          applyCheckIn(
            null,
            null,
            `GPS location unavailable (${err.message}). Check-in time recorded.`
          );
        },
        { timeout: 10000, enableHighAccuracy: true }
      );
    } else {
      applyCheckIn(null, null, "Geolocation API not supported by browser. Check-in time recorded.");
    }
  }

  // 3. Upload Evidence Photo
  async function handleUploadEvidence(file: File) {
    setUploadingPhoto(true);
    try {
      const path = `work-orders/${id}-completion-${crypto.randomUUID()}-${file.name}`;
      const { error } = await sb.storage
        .from("solar-uploads")
        .upload(path, file, { upsert: true });

      if (error) return toast.error(error.message);

      const { data } = sb.storage.from("solar-uploads").getPublicUrl(path);
      setEvidencePhoto(data.publicUrl);
      toast.success("Evidence photo uploaded");
    } finally {
      setUploadingPhoto(false);
    }
  }

  // 4. Complete Service Request
  async function handleCompleteGeneralJob() {
    if (profile?.role === "technician" && workOrder.technician_id !== profile.id) {
      return toast.error("You can only complete service requests assigned to you.");
    }

    if (!evidencePhoto) {
      return toast.error("An evidence photo is required to complete this service request. Please upload a photo.");
    }

    setActionLoading(true);
    try {
      const completedTime = new Date().toISOString();
      const updatedDescription = completionNotes
        ? `${workOrder.description ? workOrder.description + "\n\n" : ""}Completion Notes: ${completionNotes}${
            evidencePhoto ? `\nEvidence Photo: ${evidencePhoto}` : ""
          }`
        : workOrder.description;

      const { error } = await sb
        .from("work_orders")
        .update({
          status: "completed",
          completed_at: completedTime,
          description: updatedDescription,
          updated_at: completedTime,
        })
        .eq("id", id);

      if (error) return toast.error(error.message);

      if (workOrder.ticket_id) {
        await sb
          .from("tickets")
          .update({
            status: "in_progress",
            after_photo_url: evidencePhoto,
            technician_remarks: completionNotes || "Service request completed by field technician.",
          })
          .eq("id", workOrder.ticket_id);

        if (profile?.id) {
          await sb.from("maintenance_remarks").insert({
            ticket_id: workOrder.ticket_id,
            author_id: profile.id,
            body: `Service Request completed. Awaiting OEM telemetry clearance verification. Notes: ${completionNotes || "None"}`,
          });
        }
      }

      toast.success("Service Request completed. Ticket set to Awaiting Telemetry Verification.");
      setCompleteOpen(false);
      fetchData();
    } finally {
      setActionLoading(false);
    }
  }

  // 5. Admin Cancel Service Request
  async function handleCancelWorkOrder() {
    setActionLoading(true);
    try {
      const { error } = await sb
        .from("work_orders")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) return toast.error(error.message);

      toast.success("Service Request cancelled");
      fetchData();
    } finally {
      setActionLoading(false);
    }
  }

  // 6. Admin Update Details
  async function handleUpdateAdminDetails() {
    const techId =
      editForm.technician_id === "unassigned" ? null : editForm.technician_id;

    let newStatus: WorkOrderStatus = workOrder.status;
    if (workOrder.status === "draft" && techId && editForm.scheduled_date) {
      newStatus = "scheduled";
    }

    setActionLoading(true);
    try {
      const { error } = await sb
        .from("work_orders")
        .update({
          technician_id: techId,
          scheduled_date: editForm.scheduled_date || null,
          estimated_duration_mins: editForm.estimated_duration_mins,
          title: editForm.title.trim() || workOrder.title,
          description: editForm.description.trim() || null,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) return toast.error(error.message);

      toast.success("Service Request updated successfully");
      fetchData();
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground animate-pulse">
          Loading Service Request details...
        </p>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="p-8 text-center space-y-4">
        <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
        <h1 className="text-xl font-bold">Service Request Not Found</h1>
        <Link href="/service-requests">
          <Button variant="outline">Back to Service Requests</Button>
        </Link>
      </div>
    );
  }

  const isTechnician = profile?.role === "technician";
  const isAdmin = ["super_admin", "epc_admin"].includes(profile?.role || "");
  const isAssignedTech = workOrder.technician_id === profile?.id;

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12" data-testid="work-order-detail">
      {/* Back button */}
      <div>
        <Link href="/service-requests" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Service Requests
        </Link>
      </div>

      {/* Main Details Card */}
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${typeLabels[workOrder.type as WorkOrderType]}`}>
                {typeLabels[workOrder.type as WorkOrderType]}
              </span>
              <h1 className="text-2xl font-bold tracking-tight mt-2">
                {workOrder.title}
              </h1>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                <Building2 className="h-4 w-4 text-primary shrink-0" />
                <strong className="text-foreground">{workOrder.sites?.name}</strong> ({workOrder.sites?.location})
              </p>
            </div>
            <Badge variant="outline" className={`text-sm px-3 py-1 font-semibold ${statusBadges[workOrder.status as WorkOrderStatus]}`}>
              {workOrder.status.replace("_", " ")}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 border-t pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs bg-muted/30 p-3 rounded-lg border">
            <div>
              <span className="text-muted-foreground block">Scheduled Date</span>
              <strong className="text-foreground text-sm font-mono">{workOrder.scheduled_date || "Not set"}</strong>
            </div>
            <div>
              <span className="text-muted-foreground block">Est. Duration</span>
              <strong className="text-foreground text-sm">{workOrder.estimated_duration_mins} Mins</strong>
            </div>
            <div>
              <span className="text-muted-foreground block">Technician</span>
              <strong className="text-foreground text-sm">{workOrder.profiles?.full_name || "Unassigned"}</strong>
            </div>
            <div>
              <span className="text-muted-foreground block">Site Capacity</span>
              <strong className="text-foreground text-sm">{workOrder.sites?.capacity_kwp} kWp</strong>
            </div>
          </div>

          {workOrder.description && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Task Instructions / Notes</Label>
              <p className="text-sm text-foreground bg-card p-3 rounded-md border whitespace-pre-wrap">
                {workOrder.description}
              </p>
            </div>
          )}

          {/* ALARM INTELLIGENCE & FIELD GUIDANCE */}
          {(workOrder.type === "alarm_investigation" || workOrder.tickets?.alerts) && (
            <AlarmIntelligenceCard
              code={
                workOrder.tickets?.alerts?.alarm_code ||
                workOrder.tickets?.alerts?.code ||
                (workOrder.title.includes("1045") ? "1045" : workOrder.title.includes("1021") ? "1021" : workOrder.title.includes("1011") ? "1011" : "1045")
              }
              oem={workOrder.tickets?.alerts?.oem || "solis"}
            />
          )}

          {/* CHECK-IN TRACKING SUMMARY */}
          {workOrder.check_in_at && (
            <div className="border rounded-lg p-3 bg-amber-50/50 border-amber-200 text-xs space-y-1">
              <span className="font-semibold text-amber-900 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-amber-600" />
                Checked In at Site
              </span>
              <p className="text-amber-800">
                Timestamp: <strong>{formatDateTime(workOrder.check_in_at)}</strong>
              </p>
              {workOrder.check_in_lat && workOrder.check_in_lng ? (
                <p className="text-amber-800 font-mono">
                  GPS Location: {workOrder.check_in_lat.toFixed(6)}, {workOrder.check_in_lng.toFixed(6)}
                </p>
              ) : (
                <p className="text-amber-700 italic">
                  GPS coordinates unavailable (Check-in timestamp recorded successfully).
                </p>
              )}
            </div>
          )}

          {/* COMPLETION SUMMARY */}
          {workOrder.completed_at && (
            <div className="border rounded-lg p-3 bg-emerald-50 border-emerald-200 text-xs space-y-1">
              <span className="font-semibold text-emerald-900 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Service Request Completed
              </span>
              <p className="text-emerald-800">
                Completed Timestamp: <strong>{formatDateTime(workOrder.completed_at)}</strong>
              </p>
            </div>
          )}

          {/* LINKED TICKET INFO */}
          {workOrder.tickets && (
            <div className="border rounded-lg p-3 bg-blue-50/50 border-blue-200 text-xs space-y-1">
              <span className="font-semibold text-blue-900 flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-blue-600" />
                Linked Originating Ticket
              </span>
              <p className="text-blue-800">
                Ticket Title: <strong>{workOrder.tickets.title}</strong> ({workOrder.tickets.priority?.toUpperCase()})
              </p>
              <Link href={`/tickets/${workOrder.tickets.id}`} className="text-blue-700 underline font-medium block mt-1">
                View Full Ticket Details &rarr;
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* TECHNICIAN ACTION BAR */}
      {(!isTechnician || isAssignedTech) && workOrder.status !== "completed" && workOrder.status !== "cancelled" && (
        <Card className="border-primary/30 bg-primary/5 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Task Execution Flow</CardTitle>
            <CardDescription className="text-xs">
              Perform next status action for this field task.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-1">
            {workOrder.status === "scheduled" && (
              <Button
                onClick={handleStartTravel}
                disabled={actionLoading}
                className="w-full h-14 text-base font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg"
              >
                <Navigation className="h-5 w-5 mr-2" />
                Start Travel (En Route)
              </Button>
            )}

            {workOrder.status === "en_route" && (
              <Button
                onClick={handleCheckIn}
                disabled={actionLoading}
                className="w-full h-14 text-base font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-lg"
              >
                <MapPin className="h-5 w-5 mr-2" />
                Check In at Site (Capture GPS &amp; Start)
              </Button>
            )}

            {workOrder.status === "in_progress" && (
              <div className="space-y-3">
                {workOrder.type === "cleaning" ? (
                  <Link
                    href={`/technician/cleaning?work_order_id=${workOrder.id}&site_id=${workOrder.site_id}`}
                    className="block"
                  >
                    <Button className="w-full h-14 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg">
                      <SprayCan className="h-5 w-5 mr-2" />
                      Execute Cleaning Form (3 Photos Required)
                    </Button>
                  </Link>
                ) : (
                  <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
                    <DialogTrigger asChild>
                      <Button className="w-full h-14 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg">
                        <CheckCircle2 className="h-5 w-5 mr-2" />
                        Complete Task &amp; Submit Evidence
                      </Button>
                    </DialogTrigger>

                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Complete Service Request</DialogTitle>
                        <DialogDescription>
                          Record completion notes and photo evidence for this task.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                          <Label>Completion Notes / Findings</Label>
                          <Textarea
                            placeholder="Describe actions taken, parts replaced, or site observations..."
                            value={completionNotes}
                            onChange={(e) => setCompletionNotes(e.target.value)}
                            className="h-24"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">
                            Evidence Photo <span className="text-red-500 font-bold">* (Required)</span>
                          </Label>
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={(e) =>
                              e.target.files?.[0] && handleUploadEvidence(e.target.files[0])
                            }
                          />
                          {uploadingPhoto && (
                            <p className="text-xs text-muted-foreground animate-pulse">
                              Uploading photo...
                            </p>
                          )}
                          {evidencePhoto && (
                            <p className="text-xs text-green-600 font-medium">
                              ✓ Photo uploaded successfully
                            </p>
                          )}
                        </div>
                      </div>

                      <DialogFooter>
                        <Button
                          onClick={handleCompleteGeneralJob}
                          disabled={actionLoading || uploadingPhoto}
                          className="w-full"
                        >
                          Confirm &amp; Mark Completed
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ADMIN CONTROLS */}
      {isAdmin && (
        <Card className="border-muted">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Admin Operational Controls</CardTitle>
            <CardDescription className="text-xs">
              Reassign technician, update schedule date/duration, or cancel service request.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Assign Technician</Label>
                <Select
                  value={editForm.technician_id}
                  onValueChange={(v) => setEditForm({ ...editForm, technician_id: v })}
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
                <Label className="text-xs">Scheduled Date</Label>
                <Input
                  type="date"
                  value={editForm.scheduled_date}
                  onChange={(e) => setEditForm({ ...editForm, scheduled_date: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={handleUpdateAdminDetails}
                disabled={actionLoading}
                variant="outline"
                size="sm"
              >
                Save Schedule Changes
              </Button>

              {workOrder.status !== "cancelled" && workOrder.status !== "completed" && (
                <Button
                  onClick={handleCancelWorkOrder}
                  disabled={actionLoading}
                  variant="destructive"
                  size="sm"
                >
                  Cancel Service Request
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
