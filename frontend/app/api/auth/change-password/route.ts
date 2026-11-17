import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const sb = await createClient();
    const {
      data: { user },
      error: authError,
    } = await sb.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in to change your password." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { newPassword } = body;

    if (!newPassword || typeof newPassword !== "string") {
      return NextResponse.json(
        { error: "New password is required." },
        { status: 400 }
      );
    }

    const trimmedPassword = newPassword.trim();
    if (trimmedPassword.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters long." },
        { status: 400 }
      );
    }

    // Update using admin client to ensure clean, reliable password update
    const serviceClient = createServiceClient();
    const { error: updateError } = await serviceClient.auth.admin.updateUserById(
      user.id,
      { password: trimmedPassword }
    );

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || "Failed to update password." },
        { status: 400 }
      );
    }

    // Refresh current user session
    await sb.auth.updateUser({ password: trimmedPassword }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: "Password updated successfully.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal server error occurred." },
      { status: 500 }
    );
  }
}

