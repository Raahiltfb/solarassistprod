import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://xpjzuquqehjamqsqshwq.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const DEFAULT_PASSWORD = "Solar@12345";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cookieStore = await cookies();

    const response = NextResponse.json({ success: true });

    const supabaseServer = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const adminClient = createAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch Profile
    let { data: profile } = await adminClient
      .from("profiles")
      .select("*")
      .ilike("email", cleanEmail)
      .maybeSingle();

    // 2. Authenticate user with password (try baseline then simulation passwords)
    const passwordsToTry = [DEFAULT_PASSWORD, "Simulation@12345"];
    let authData: any = null;
    let authErr: any = null;

    for (const pwd of passwordsToTry) {
      const res = await supabaseServer.auth.signInWithPassword({
        email: cleanEmail,
        password: pwd,
      });
      if (res.data?.user) {
        authData = res.data;
        authErr = null;
        break;
      }
      authErr = res.error;
    }

    if (authErr || !authData?.user) {
      return NextResponse.json({ error: authErr?.message || "Failed to sign in" }, { status: 400 });
    }

    if (!profile && authData?.user?.id) {
      const { data: profById } = await adminClient
        .from("profiles")
        .select("*")
        .eq("id", authData.user.id)
        .maybeSingle();
      profile = profById;
    }

    const role = profile?.role || "epc_admin";
    response.cookies.set("user-role", role, { path: "/" });

    let redirectUrl = "/dashboard";
    if (role === "client") {
      redirectUrl = "/client";
    } else if (role === "technician") {
      redirectUrl = "/technician/route";
    }

    return NextResponse.json({
      success: true,
      role,
      profile,
      redirectUrl,
    }, { headers: response.headers });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Server error during quick login" }, { status: 500 });
  }
}
