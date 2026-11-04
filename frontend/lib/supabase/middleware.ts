import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const STAGING_URL = "https://xpjzuquqehjamqsqshwq.supabase.co";
const STAGING_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhwanp1cXVxZWhqYW1xc3FzaHdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5OTI3MzYsImV4cCI6MjEwODU2ODczNn0.pfWb62_WTMBu0K1V2cu25-Iu6tARTYq2hiawHY0Dnfk";

function getSupabaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/^["']|["']$/g, "");
  const target = (envUrl && envUrl.startsWith("https://")) ? envUrl : STAGING_URL;
  if (process.env.NODE_ENV === "test" && target.includes("ylnmjvgnjootrkywbcsj")) {
    throw new Error("CRITICAL SAFETY VIOLATION: Test execution against production Supabase (ylnmjvgnjootrkywbcsj) is prohibited.");
  }
  return target;
}

function getSupabaseAnonKey(): string {
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim().replace(/^["']|["']$/g, "");
  if (envKey && envKey.length > 20) {
    return envKey;
  }
  return STAGING_ANON_KEY;
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
      const role = request.cookies.get("user-role")?.value;
      if (role === "client") {
        return NextResponse.redirect(new URL("/client", request.url));
      } else if (role === "technician") {
        return NextResponse.redirect(new URL("/technician/route", request.url));
      }
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  } catch (err) {
    console.error("Middleware auth check failed:", err);
  }

  return response;
}
