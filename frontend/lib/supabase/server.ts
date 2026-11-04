import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createSbClient } from "@supabase/supabase-js";

const STAGING_URL = "https://xpjzuquqehjamqsqshwq.supabase.co";
const STAGING_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhwanp1cXVxZWhqYW1xc3FzaHdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5OTI3MzYsImV4cCI6MjA5MzY0NTU4N30.pfWb62_WTMBu0K1V2cu25-Iu6tARTYq2hiawHY0Dnfk";

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
