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
    const [profilesRes, membersRes, teamsRes] = await Promise.all([
      service
        .from("profiles")
        .select("id, email, full_name, role, org_id, base_address, created_at")
        .eq("role", "technician")
        .order("full_name"),
      service
        .from("technician_team_members")
        .select("id, team_id, technician_id"),
      service
        .from("technician_teams")
        .select("id, name, color_code, is_active"),
    ]);

    const teamMap = new Map<string, any>();
    (teamsRes.data ?? []).forEach((t) => teamMap.set(t.id, t));

    const techTeamMap = new Map<string, any>();
    (membersRes.data ?? []).forEach((m) => {
      const team = teamMap.get(m.team_id);
      if (team) {
        techTeamMap.set(m.technician_id, team);
      }
    });

    const technicians = (profilesRes.data ?? []).map((p) => ({
      ...p,
      assigned_team: techTeamMap.get(p.id) || null,
    }));

    return NextResponse.json({ technicians });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load technicians" }, { status: 500 });
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
      return NextResponse.json({ error: "Forbidden: Admin privileges required to add technicians" }, { status: 403 });
    }

    const body = await req.json();
    const fullName = (body.full_name || body.name || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const phone = (body.phone || "").trim();
    const password = (body.password || "").trim() || "SolarTech2026!";
    const baseAddress = (body.base_address || "Mumbai Field Hub").trim();
    const orgId = userProfile.org_id || "ac763745-aed5-469d-9956-459fb00a337e";

    if (!fullName || fullName.length < 2) {
      return NextResponse.json({ error: "Full name must be at least 2 characters" }, { status: 400 });
    }

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
    }

    // 1. Create or fetch Auth user in Supabase
    const { data: authData, error: authErr } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: "technician",
        phone,
      },
    });

    let userId: string;

    if (authErr) {
      // If user already exists in auth, check if profile exists
      if (authErr.message.toLowerCase().includes("already registered") || authErr.message.toLowerCase().includes("unique constraint")) {
        const { data: existingProf } = await service
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();

        if (existingProf) {
          // Update existing profile to technician
          await service
            .from("profiles")
            .update({
              full_name: fullName,
              role: "technician",
              base_address: baseAddress,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingProf.id);

          return NextResponse.json({
            success: true,
            message: `Updated existing user ${fullName} (${email}) as technician`,
            technician: { id: existingProf.id, email, full_name: fullName, role: "technician" },
          });
        } else {
          return NextResponse.json({ error: `User with email ${email} already exists in auth` }, { status: 400 });
        }
      } else {
        return NextResponse.json({ error: `Failed to create auth user: ${authErr.message}` }, { status: 400 });
      }
    } else {
      userId = authData.user.id;
    }

    // 2. Ensure profile record is inserted/upserted in public.profiles
    const { data: profile, error: profErr } = await service
      .from("profiles")
      .upsert({
        id: userId,
        org_id: orgId,
        email,
        full_name: fullName,
        role: "technician",
        base_address: baseAddress,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (profErr) {
      return NextResponse.json({ error: `Failed to create profile: ${profErr.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Technician ${fullName} created successfully`,
      technician: profile,
    }, { status: 201 });
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
    const techId = searchParams.get("id");

    if (!techId) {
      return NextResponse.json({ error: "Technician ID is required" }, { status: 400 });
    }

    // Remove team memberships
    await service.from("technician_team_members").delete().eq("technician_id", techId);

    // Delete profile
    const { error: delProfErr } = await service.from("profiles").delete().eq("id", techId);
    if (delProfErr) {
      return NextResponse.json({ error: delProfErr.message }, { status: 500 });
    }

    // Delete auth user
    await service.auth.admin.deleteUser(techId).catch(() => null);

    return NextResponse.json({ success: true, message: "Technician removed" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

