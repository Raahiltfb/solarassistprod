import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const PROD_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co";
const PROD_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjk1ODcsImV4cCI6MjA5MzY0NTU4N30.d9VUDRLSsruy7QSXf6GigVaIijkmmSdhP8nObWatB_8";
const PROD_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || PROD_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PROD_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || PROD_SERVICE_KEY;

// Canonical alias resolution to allow technicians & operators to log in easily
const EMAIL_ALIASES: Record<string, string> = {
  // Faisal Sorathiya
  "faisal": "faisal.sorathiya@solarassist.dev",
  "faisal@solarassist.dev": "faisal.sorathiya@solarassist.dev",
  "tech1": "faisal.sorathiya@solarassist.dev",
  "tech1@solarassist.dev": "faisal.sorathiya@solarassist.dev",

  // Sandesh Tambe
  "sandesh": "sandesh.tambe@solarassist.dev",
  "sandesh@solarassist.dev": "sandesh.tambe@solarassist.dev",
  "tech2": "sandesh.tambe@solarassist.dev",
  "tech2@solarassist.dev": "sandesh.tambe@solarassist.dev",

  // Faiz Adani
  "faiz": "faiz.adani@solarassist.dev",
  "faiz@solarassist.dev": "faiz.adani@solarassist.dev",
  "tech3": "faiz.adani@solarassist.dev",
  "tech3@solarassist.dev": "faiz.adani@solarassist.dev",

  // Imran Qureshi
  "imran": "imran.qureshi@solarassist.dev",
  "imran@solarassist.dev": "imran.qureshi@solarassist.dev",
  "tech4": "imran.qureshi@solarassist.dev",
  "tech4@solarassist.dev": "imran.qureshi@solarassist.dev",

  // Aphjal Khan
  "aphjal": "aphjal.khan@solarassist.dev",
  "aphjal@solarassist.dev": "aphjal.khan@solarassist.dev",
  "tech5": "aphjal.khan@solarassist.dev",
  "tech5@solarassist.dev": "aphjal.khan@solarassist.dev",

  // Amir Khan
  "amir": "amir.khan@solarassist.dev",
  "amir@solarassist.dev": "amir.khan@solarassist.dev",
  "tech6": "amir.khan@solarassist.dev",
  "tech6@solarassist.dev": "amir.khan@solarassist.dev",

  // Admin & Super Admin
  "admin": "admin@solarassist.dev",
  "super": "super@solarassist.dev",
};

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    const cleanInput = email.trim().toLowerCase();
    const targetEmail = EMAIL_ALIASES[cleanInput] || cleanInput;

    let cookieStore: any = null;
    try {
      cookieStore = await cookies();
    } catch {
      // In standalone test or build environment
    }

    const response = NextResponse.json({ success: true });

    const supabaseServer = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return cookieStore ? cookieStore.getAll() : [];
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value, options }) => {
            if (cookieStore?.set) {
              try {
                cookieStore.set(name, value, options);
              } catch {}
            }
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const { data: authData, error: authErr } = await supabaseServer.auth.signInWithPassword({
      email: targetEmail,
      password: password,
    });

    if (authErr || !authData?.user) {
      return NextResponse.json(
        { error: "Invalid email or password. Please verify your credentials." },
        { status: 401 }
      );
    }

    const adminClient = createAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let { data: profile } = await adminClient
      .from("profiles")
      .select("*")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (!profile) {
      const { data: profByEmail } = await adminClient
        .from("profiles")
        .select("*")
        .ilike("email", targetEmail)
        .maybeSingle();
      profile = profByEmail;
    }

    const role = profile?.role || (authData.user.user_metadata?.role as string) || "epc_admin";
    response.cookies.set("user-role", role, { path: "/", maxAge: 60 * 60 * 24 * 7 });

    let redirectUrl = "/dashboard";
    if (role === "client") {
      redirectUrl = "/client";
    } else if (role === "technician") {
      redirectUrl = "/technician/route";
    }

    return NextResponse.json(
      {
        success: true,
        role,
        profile,
        redirectUrl,
      },
      { headers: response.headers }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error during sign in" },
      { status: 500 }
    );
  }
}
