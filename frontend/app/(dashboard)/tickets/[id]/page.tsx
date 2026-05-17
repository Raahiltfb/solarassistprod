"use client";

import { use, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
        alerts(title),
        profiles!tickets_assignee_id_fkey(full_name)
      `)
      .eq("id", id)
      .single();

    if (data) {
      setTicket(data);
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
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {ticket.title}
          </h1>

          <p className="mt-2 text-sm text-gray-500">
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

          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              severityColors[ticket.severity_level] ||
              "bg-gray-100 text-gray-700"
            }`}
          >
            {ticket.severity_level}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded-xl p-4 bg-white">
          <h2 className="text-sm font-medium text-gray-500 mb-3">
            Ticket Information
          </h2>

          <div className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Ticket Type:</span>{" "}
              {ticket.ticket_type || "Not set"}
            </p>

            <p>
              <span className="font-medium">Severity:</span>{" "}
              {ticket.severity_level || "Not set"}
            </p>

            <p>
              <span className="font-medium">Source:</span>{" "}
              {ticket.source || "Unknown"}
            </p>

            <p>
              <span className="font-medium">Auto Resolvable:</span>{" "}
              {ticket.auto_resolvable ? "Yes" : "No"}
            </p>

            <p>
              <span className="font-medium">SLA:</span>{" "}
              {ticket.resolution_sla_hours
                ? `${ticket.resolution_sla_hours} hrs`
                : "Not set"}
            </p>

            <p>
              <span className="font-medium">Status:</span>{" "}
              {ticket.status.replace("_", " ")}
            </p>

            <p>
              <span className="font-medium">Priority:</span>{" "}
              {ticket.priority}
            </p>

            <p>
              <span className="font-medium">Created:</span>{" "}
              {new Date(ticket.created_at).toLocaleString()}
            </p>

            <p>
              <span className="font-medium">Resolved:</span>{" "}
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
              <span className="font-medium">Organization:</span>{" "}
              {ticket.organizations?.name || "Unknown Organization"}
            </p>

            <p>
              <span className="font-medium">Site:</span>{" "}
              {ticket.sites?.name || "Unknown Site"}
            </p>

            <p>
              <span className="font-medium">Alert:</span>{" "}
              {ticket.alerts?.title || "No linked alert"}
            </p>

            <p>
              <span className="font-medium">Assigned To:</span>{" "}
              {ticket.profiles?.full_name || "Unassigned"}
            </p>
          </div>
        </div>
      </div>

      <div className="border rounded-xl p-4 bg-white">
        <h2 className="text-sm font-medium text-gray-500 mb-4">
          Actions
        </h2>

        <div className="flex flex-wrap gap-3">
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