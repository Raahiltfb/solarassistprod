import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * DELETE: remove the "Internet Down" label from a site by closing its open
 * connectivity ticket(s). The site is then re-evaluated by the attention queue.
 */
export async function DELETE(req: Request) {
  try {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { site_id, ticket_id } = await req.json();
    if (!site_id) return NextResponse.json({ error: "site_id is required" }, { status: 400 });

    const service = createServiceClient();
    const { data: open, error: fetchErr } = await service
      .from("tickets")
      .select("id, title, ticket_type, description")
      .eq("site_id", site_id)
      .not("status", "in", "(resolved,closed)");
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    const ids = (open ?? [])
      .filter(
        (t) =>
          t.id === ticket_id ||
          t.ticket_type === "connectivity" ||
          t.title?.includes("[Internet/WiFi Down]") ||
          t.description?.includes("[Root Cause Classification]: INTERNET OUTAGE")
      )
      .map((t) => t.id);

    if (ids.length === 0) return NextResponse.json({ success: true, closed: 0 });

    const { error: updErr } = await service
      .from("tickets")
      .update({ status: "closed", resolved_at: new Date().toISOString() })
      .in("id", ids);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({ success: true, closed: ids.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
