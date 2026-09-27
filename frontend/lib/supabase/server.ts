import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createSbClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjk1ODcsImV4cCI6MjA5MzY0NTU4N30.d9VUDRLSsruy7QSXf6GigVaIijkmmSdhP8nObWatB_8";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE";

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

function getSupabaseServiceKey(): string {
  const envKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim().replace(/^["']|["']$/g, "");
  if (envKey && envKey.startsWith("eyJhbGci")) {
    return envKey;
  }
  return SUPABASE_SERVICE_ROLE_KEY;
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
