import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ylnmjvgnjootrkywbcsj.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjk1ODcsImV4cCI6MjA5MzY0NTU4N30.d9VUDRLSsruy7QSXf6GigVaIijkmmSdhP8nObWatB_8";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE";

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

    // 2. Authenticate user with default password
    let { data: authData, error: authErr } = await supabaseServer.auth.signInWithPassword({
      email: cleanEmail,
      password: DEFAULT_PASSWORD,
    });

    // If login failed, try ensuring the user password in Auth DB via admin key
    if (authErr || !authData.user) {
      const { data: usersData } = await adminClient.auth.admin.listUsers();
      const existingAuthUser = usersData.users.find((u) => u.email?.toLowerCase() === cleanEmail);

      if (existingAuthUser) {
        await adminClient.auth.admin.updateUserById(existingAuthUser.id, {
          password: DEFAULT_PASSWORD,
          email_confirm: true,
        });
      } else {
        // Create auth user if missing
        await adminClient.auth.admin.createUser({
          email: cleanEmail,
          password: DEFAULT_PASSWORD,
          email_confirm: true,
        });
      }

      // Retry sign in
      const retry = await supabaseServer.auth.signInWithPassword({
        email: cleanEmail,
        password: DEFAULT_PASSWORD,
      });

      if (retry.error) {
        return NextResponse.json({ error: retry.error.message || "Failed to sign in" }, { status: 400 });
      }
      authData = retry.data;
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
      redirectUrl = "/technician";
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
