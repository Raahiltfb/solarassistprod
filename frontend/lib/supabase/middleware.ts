import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjk1ODcsImV4cCI6MjA5MzY0NTU4N30.d9VUDRLSsruy7QSXf6GigVaIijkmmSdhP8nObWatB_8";

function getSupabaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/^["']|["']$/g, "");
  if (envUrl && envUrl.startsWith("https://")) {
    return envUrl;
  }
  return SUPABASE_URL;
}

function getSupabaseAnonKey(): string {
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim().replace(/^["']|["']$/g, "");
  if (envKey && envKey.startsWith("eyJhbGci")) {
    return envKey;
  }
  return SUPABASE_ANON_KEY;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  try {
    const supabase = createServerClient(
      getSupabaseUrl(),
      getSupabaseAnonKey(),
      {
        cookies: {
          getAll() { return request.cookies.getAll(); },
          setAll(toSet: { name: string; value: string; options?: any }[]) {
            toSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          },
        },
      },
    );

    const { data: { user } } = await supabase.auth.getUser();
    const { pathname } = request.nextUrl;

    const publicPaths = ["/login", "/register", "/_next", "/api/auth", "/api/cron", "/api/health", "/api/automation", "/api/work-orders", "/api/tickets", "/manifest.json", "/icons", "/icon-"];
    const isPublic = publicPaths.some((p) => pathname.startsWith(p));

    if (!user && !isPublic && pathname !== "/") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (user && (pathname === "/login" || pathname === "/")) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  } catch (err) {
    console.error("Middleware auth check failed:", err);
  }

  return response;
}
