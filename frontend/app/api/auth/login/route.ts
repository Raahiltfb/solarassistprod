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

// Canonical username to email resolution
const USERNAME_MAP: Record<string, string> = {
  // Administration
  "admin": "admin@solarassist.dev",
  "solarassist": "admin@solarassist.dev",
  "solarassistadmin": "admin@solarassist.dev",
  "super": "super@solarassist.dev",
  "superadmin": "super@solarassist.dev",

  // Field Technicians
  "faisal": "faisal.sorathiya@solarassist.dev",
  "faisal.sorathiya": "faisal.sorathiya@solarassist.dev",
  "faisalsorathiya": "faisal.sorathiya@solarassist.dev",
  "tech1": "faisal.sorathiya@solarassist.dev",

  "sandesh": "sandesh.tambe@solarassist.dev",
  "sandesh.tambe": "sandesh.tambe@solarassist.dev",
  "sandeshtambe": "sandesh.tambe@solarassist.dev",
  "tech2": "sandesh.tambe@solarassist.dev",

  "faiz": "faiz.adani@solarassist.dev",
  "faiz.adani": "faiz.adani@solarassist.dev",
  "faizadani": "faiz.adani@solarassist.dev",
  "tech3": "faiz.adani@solarassist.dev",

  "imran": "imran.qureshi@solarassist.dev",
  "imran.qureshi": "imran.qureshi@solarassist.dev",
  "imranqureshi": "imran.qureshi@solarassist.dev",
  "tech4": "imran.qureshi@solarassist.dev",

  "aphjal": "aphjal.khan@solarassist.dev",
  "aphjal.khan": "aphjal.khan@solarassist.dev",
  "aphjalkhan": "aphjal.khan@solarassist.dev",
  "tech5": "aphjal.khan@solarassist.dev",

  "amir": "amir.khan@solarassist.dev",
  "amir.khan": "amir.khan@solarassist.dev",
  "amirkhan": "amir.khan@solarassist.dev",
  "tech6": "amir.khan@solarassist.dev",

  // Client Portals
  "anoopam": "client@anoopam.com",
  "anoopammission": "client@anoopam.com",
  "cilantro": "client@cilantro.com",
  "manavsthal": "client@manavsthal.com",
  "alcove": "client@alcove.com",
  "belmac": "client@belmac.com",
  "bwssb": "client@bwssb.com",
  "casaflorea": "client@casaflorea.com",
  "crestia": "client@crestia.com",
  "dostijade": "client@dostijade.com",
  "garcinia": "client@garcinia.com",
  "ivy": "client@ivy.com",
  "madhukosh": "client@madhukosh.com",
  "maitrianand": "client@maitrianand.com",
  "maxima": "client@maxima.com",
  "mkthakur": "client@mkthakur.com",
  "patwardhan": "client@patwardhan.com",
  "regalia": "client@regalia.com",
  "sophistica": "client@sophistica.com",
  "stp": "client@stp.com",
  "suvarnapushpa": "client@suvarnapushpa.com",
  "suyash": "client@suyash.com",
  "venecia": "client@venecia.com",
  "vijayvatika": "client@vijayvatika.com",
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawIdentifier = (body.username || body.email || "").trim().toLowerCase();
    const password = (body.password || "").trim();

    if (!rawIdentifier || !password) {
      return NextResponse.json(
        { error: "Username and password are required." },
        { status: 400 }
      );
    }

    let targetEmail = USERNAME_MAP[rawIdentifier] || rawIdentifier;

    // Fallback: If not an email address, try resolving by client domain or solarassist.dev domain
    if (!targetEmail.includes("@")) {
      targetEmail = `${rawIdentifier}@solarassist.dev`;
    }

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
        { error: "Invalid username or password. Please verify your credentials." },
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
