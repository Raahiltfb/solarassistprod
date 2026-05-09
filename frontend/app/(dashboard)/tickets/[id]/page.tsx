import { createClient } from "@/lib/supabase/server";

const statusColors: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  assigned: "bg-yellow-100 text-yellow-700",
  "in progress": "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-200 text-gray-700",
};

const priorityColors: Record<string, string> = {
  p1: "bg-red-100 text-red-700",
  p2: "bg-orange-100 text-orange-700",
  p3: "bg-yellow-100 text-yellow-700",
  p4: "bg-blue-100 text-blue-700",
};

export default async function TicketDetailsPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();

  const { data: ticket, error } = await supabase
    .from("tickets")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !ticket) {
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

        <div className="flex gap-2">
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${
              statusColors[ticket.status] ||
              "bg-gray-100 text-gray-700"
            }`}
          >
            {ticket.status}
          </span>

          <span
            className={`px-3 py-1 rounded-full text-xs font-medium uppercase ${
              priorityColors[ticket.priority] ||
              "bg-gray-100 text-gray-700"
            }`}
          >
            {ticket.priority}
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
              <span className="font-medium">Status:</span>{" "}
              {ticket.status}
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
              {ticket.org_id}
            </p>

            <p>
              <span className="font-medium">Site:</span>{" "}
              {ticket.site_id}
            </p>

            <p>
              <span className="font-medium">Alert:</span>{" "}
              {ticket.alert_id || "No linked alert"}
            </p>

            <p>
              <span className="font-medium">Assigned To:</span>{" "}
              {ticket.assignee_id || "Unassigned"}
            </p>
          </div>
        </div>
      </div>

      <div className="border rounded-xl p-4 bg-white">
        <h2 className="text-sm font-medium text-gray-500 mb-4">
          Actions
        </h2>

        <div className="flex flex-wrap gap-3">
          <button className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 transition">
            Mark In Progress
          </button>

          <button className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 transition">
            Resolve Ticket
          </button>

          <button className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm hover:bg-black transition">
            Close Ticket
          </button>
        </div>
      </div>
    </div>
  );
}