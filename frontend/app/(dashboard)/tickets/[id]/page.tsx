"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AlarmIntelligenceCard } from "@/components/alarm-intelligence-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Camera, Image as ImageIcon } from "lucide-react";

const statusColors: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  assigned: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-200 text-gray-700",
};

const priorityColors: Record<string, string> = {
  p1: "bg-red-100 text-red-700",
  p2: "bg-orange-100 text-orange-700",
  p3: "bg-yellow-100 text-yellow-700",
  p4: "bg-blue-100 text-blue-700",
};

const severityColors: Record<string, string> = {
  L1: "bg-blue-100 text-blue-700",
  L2: "bg-yellow-100 text-yellow-700",
  L3: "bg-red-100 text-red-700",
};

export default function TicketDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = createClient();

  const [ticket, setTicket] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Technician log states
  const [beforePhoto, setBeforePhoto] = useState<string>("");
  const [afterPhoto, setAfterPhoto] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    await Promise.all([fetchTicket(), fetchActivities()]);
    setLoading(false);
  }

  async function fetchTicket() {
    const { data } = await supabase
      .from("tickets")
      .select(`
        *,
        organizations(name),
        sites(name),
        alerts(id, title, code, alarm_code, oem, description),
        profiles!tickets_assignee_id_fkey(full_name)
      `)
      .eq("id", id)
      .single();

    if (data) {
      setTicket(data);
      setRemarks(data.technician_remarks || "");
      setBeforePhoto(data.before_photo_url || "");
      setAfterPhoto(data.after_photo_url || "");
    }
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

    toast.success(`${kind} photo uploaded`);
  }

  async function saveTechnicianLog() {
    const { error } = await supabase
      .from("tickets")
      .update({
        before_photo_url: beforePhoto,
        after_photo_url: afterPhoto,
        technician_remarks: remarks
      })
      .eq("id", id);

    if (error) {
      return toast.error(error.message);
    }

    await supabase.from("ticket_activity").insert({
      ticket_id: id,
      activity_type: "update",
      message: "Technician work log updated."
    });

    toast.success("Technician work log saved");
    fetchData();
  }

  async function updateStatus(status: string) {
    const updates: any = {
      status,
    };

    if (status === "resolved") {
      updates.resolved_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("tickets")
      .update(updates)
      .eq("id", id);

    if (!error) {
      await supabase.from("ticket_activity").insert({
        ticket_id: id,
        activity_type: "status_change",
        message: `Ticket marked as ${status.replace("_", " ")}`,
      });

      fetchData();
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Loading ticket...</h1>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Ticket not found</h1>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="ticket-details-page">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {ticket.title}
          </h1>

          <p className="mt-2 text-sm text-gray-500 font-mono">
            Ticket ID: {ticket.id}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${
              statusColors[ticket.status] ||
              "bg-gray-100 text-gray-700"
            }`}
          >
            {ticket.status.replace("_", " ")}
          </span>

          <span
            className={`px-3 py-1 rounded-full text-xs font-medium uppercase ${
              priorityColors[ticket.priority] ||
              "bg-gray-100 text-gray-700"
            }`}
          >
            {ticket.priority}
          </span>

          {ticket.severity_level && (
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                severityColors[ticket.severity_level] ||
                "bg-gray-100 text-gray-700"
              }`}
            >
              {ticket.severity_level}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded-xl p-4 bg-white">
          <h2 className="text-sm font-medium text-gray-500 mb-3">
            Ticket Information
          </h2>

          <div className="space-y-2 text-sm">
            <p>
              <span className="font-medium text-muted-foreground">Ticket Type:</span>{" "}
              {ticket.ticket_type || "Standard Alert"}
            </p>

            <p>
              <span className="font-medium text-muted-foreground">Severity:</span>{" "}
              {ticket.severity_level || "Not set"}
            </p>

            <p>
              <span className="font-medium text-muted-foreground">Source:</span>{" "}
              {ticket.source || "System Alert"}
            </p>

            <p>
              <span className="font-medium text-muted-foreground">Auto Resolvable:</span>{" "}
              {ticket.auto_resolvable ? "Yes" : "No"}
            </p>

            <p>
              <span className="font-medium text-muted-foreground">Created:</span>{" "}
              {new Date(ticket.created_at).toLocaleString()}
            </p>

            <p>
              <span className="font-medium text-muted-foreground">Resolved:</span>{" "}
              {ticket.resolved_at
                ? new Date(ticket.resolved_at).toLocaleString()
                : "Not resolved"}
            </p>
          </div>
        </div>

        <div className="border rounded-xl p-4 bg-white">
          <h2 className="text-sm font-medium text-gray-500 mb-3">
            Linked Records
          </h2>

          <div className="space-y-2 text-sm">
            <p>
              <span className="font-medium text-muted-foreground">Organization:</span>{" "}
              {ticket.organizations?.name || "Unknown Organization"}
            </p>

            <p>
              <span className="font-medium text-muted-foreground">Site:</span>{" "}
              {ticket.sites?.name || "Unknown Site"}
            </p>

            <p>
              <span className="font-medium text-muted-foreground">Alert:</span>{" "}
              {ticket.alerts?.title || "No linked alert"}
            </p>

            <p>
              <span className="font-medium text-muted-foreground">Assigned To:</span>{" "}
              {ticket.profiles?.full_name || "Unassigned"}
            </p>
          </div>
        </div>
      </div>

      {ticket.description && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Description</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
          </CardContent>
        </Card>
      )}

      {/* ALARM INTELLIGENCE & FIELD GUIDANCE */}
      {(ticket.alerts?.alarm_code || ticket.alerts?.code || ticket.title?.includes("1045") || ticket.title?.includes("1021") || ticket.title?.includes("1011")) && (
        <AlarmIntelligenceCard
          code={
            ticket.alerts?.alarm_code ||
            ticket.alerts?.code ||
            (ticket.title?.includes("1045") ? "1045" : ticket.title?.includes("1021") ? "1021" : ticket.title?.includes("1011") ? "1011" : "1045")
          }
          oem={ticket.alerts?.oem || "solis"}
        />
      )}

      {/* Technician operational work log */}
      <div className="border rounded-xl p-4 bg-white space-y-4">
        <h2 className="text-sm font-medium text-gray-500">
          Technician Operational Log
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Before Work Photo</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0], "before")}
            />
            {beforePhoto && (
              <a href={beforePhoto} target="_blank" rel="noreferrer" className="text-xs text-primary underline flex items-center gap-1 mt-1">
                <ImageIcon className="h-3 w-3" /> View uploaded before photo
              </a>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs">After Work Photo</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0], "after")}
            />
            {afterPhoto && (
              <a href={afterPhoto} target="_blank" rel="noreferrer" className="text-xs text-primary underline flex items-center gap-1 mt-1">
                <ImageIcon className="h-3 w-3" /> View uploaded after photo
              </a>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Technician Remarks & Actions Taken</Label>
          <Textarea
            placeholder="Describe findings, work completed, parts replaced..."
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="h-24"
          />
        </div>

        <Button onClick={saveTechnicianLog} size="sm">
          Save Operational Log
        </Button>
      </div>

      <div className="border rounded-xl p-4 bg-white">
        <h2 className="text-sm font-medium text-gray-500 mb-4">
          Actions &amp; Field Dispatch
        </h2>

        <div className="flex flex-wrap gap-3">
          <Link href={`/work-orders?site_id=${ticket.site_id}&ticket_id=${ticket.id}&title=${encodeURIComponent("Field Job: " + ticket.title)}`}>
            <button
              className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition flex items-center gap-1.5"
            >
              + Create Work Order
            </button>
          </Link>

          <button
            onClick={() => updateStatus("in_progress")}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 transition"
          >
            Mark In Progress
          </button>

          <button
            onClick={() => updateStatus("resolved")}
            className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 transition"
          >
            Resolve Ticket
          </button>

          <button
            onClick={() => updateStatus("closed")}
            className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm hover:bg-black transition"
          >
            Close Ticket
          </button>
        </div>
      </div>

      <div className="border rounded-xl p-4 bg-white">
        <h2 className="text-sm font-medium text-gray-500 mb-4">
          Activity Timeline
        </h2>

        <div className="space-y-3">
          {activities.length === 0 && (
            <p className="text-sm text-gray-500">
              No activity yet.
            </p>
          )}

          {activities.map((activity) => (
            <div
              key={activity.id}
              className="border rounded-lg p-3"
            >
              <p className="text-sm text-gray-900">
                {activity.message}
              </p>

              <p className="text-xs text-gray-500 mt-1">
                {new Date(activity.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}