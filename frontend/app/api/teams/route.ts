import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = createServiceClient();
    const { data: teams, error } = await service
      .from("technician_teams")
      .select("*, technician_team_members(*, profiles(*))")
      .order("name");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ teams: teams ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load teams" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = createServiceClient();
    const { data: userProfile } = await service
      .from("profiles")
      .select("role, org_id")
      .eq("id", user.id)
      .single();

    if (!userProfile || (userProfile.role !== "super_admin" && userProfile.role !== "epc_admin")) {
      return NextResponse.json({ error: "Forbidden: Admin privileges required" }, { status: 403 });
    }

    const body = await req.json();
    const name = (body.name || "").trim();
    const baseAddress = (body.base_address || "Operating Base").trim();
    const colorCode = body.color_code || "#3b82f6";
    const orgId = userProfile.org_id || "ac763745-aed5-469d-9956-459fb00a337e";
    const technicianIds: string[] = Array.isArray(body.technician_ids) ? body.technician_ids : [];

    if (!name || name.length < 2) {
      return NextResponse.json({ error: "Team name must be at least 2 characters" }, { status: 400 });
    }

    const { data: newTeam, error: teamErr } = await service
      .from("technician_teams")
      .insert({
        org_id: orgId,
        name,
        base_address: baseAddress,
        color_code: colorCode,
        is_active: true,
      })
      .select()
      .single();

    if (teamErr || !newTeam) {
      return NextResponse.json({ error: teamErr?.message || "Failed to create team" }, { status: 500 });
    }

    if (technicianIds.length > 0) {
      const inserts = technicianIds.map((tId) => ({
        team_id: newTeam.id,
        technician_id: tId,
      }));
      await service.from("technician_team_members").insert(inserts);
    }

    return NextResponse.json({
      success: true,
      message: `Team "${name}" created successfully`,
      team: newTeam,
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = createServiceClient();
    const { data: userProfile } = await service
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userProfile || (userProfile.role !== "super_admin" && userProfile.role !== "epc_admin")) {
      return NextResponse.json({ error: "Forbidden: Admin privileges required" }, { status: 403 });
    }

    const body = await req.json();
    const teamId = body.team_id;
    const technicianIds: string[] = Array.isArray(body.technician_ids) ? body.technician_ids : [];

    if (!teamId) {
      return NextResponse.json({ error: "team_id is required" }, { status: 400 });
    }

    // Replace team members
    await service.from("technician_team_members").delete().eq("team_id", teamId);

    if (technicianIds.length > 0) {
      const inserts = technicianIds.map((tId) => ({
        team_id: teamId,
        technician_id: tId,
      }));
      const { error: insErr } = await service.from("technician_team_members").insert(inserts);
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, message: "Team members updated" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = createServiceClient();
    const { data: userProfile } = await service
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userProfile || (userProfile.role !== "super_admin" && userProfile.role !== "epc_admin")) {
      return NextResponse.json({ error: "Forbidden: Admin privileges required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("id");

    if (!teamId) {
      return NextResponse.json({ error: "Team ID is required" }, { status: 400 });
    }

    // Delete memberships first
    await service.from("technician_team_members").delete().eq("team_id", teamId);

    // Unassign visits
    await service.from("cleaning_visits").update({ assigned_team_id: null }).eq("assigned_team_id", teamId);
    await service.from("work_orders").update({ team_id: null }).eq("team_id", teamId);

    // Delete team
    const { error: delErr } = await service.from("technician_teams").delete().eq("id", teamId);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Team deleted successfully" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

