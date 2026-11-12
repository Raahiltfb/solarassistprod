import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createSbClient } from "@supabase/supabase-js";

// Canonical production Supabase instance
const PROD_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co";
const PROD_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjk1ODcsImV4cCI6MjA5MzY0NTU4N30.d9VUDRLSsruy7QSXf6GigVaIijkmmSdhP8nObWatB_8";

function getSupabaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/^["']|["']$/g, "");
  const target = (envUrl && envUrl.startsWith("https://")) ? envUrl : PROD_URL;
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
  return PROD_ANON_KEY;
}

function getSupabaseServiceKey(): string {
  const envKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.TEST_SUPABASE_SERVICE_ROLE_KEY)?.trim().replace(/^["']|["']$/g, "");
  if (envKey && envKey.length > 20) {
    return envKey;
  }
  return "";
}

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(toSet: { name: string; value: string; options?: any }[]) {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch { /* called from a Server Component, ignored */ }
        },
      },
    },
  );
}

export function createServiceClient() {
  return createSbClient(
    getSupabaseUrl(),
    getSupabaseServiceKey(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
