"use client";
import { createBrowserClient } from "@supabase/ssr";

// Canonical production Supabase instance
const PROD_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co";
const PROD_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjk1ODcsImV4cCI6MjA5MzY0NTU4N30.d9VUDRLSsruy7QSXf6GigVaIijkmmSdhP8nObWatB_8";

export function createClient() {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/^["']|["']$/g, "");
  const url = (envUrl && envUrl.startsWith("https://")) ? envUrl : PROD_URL;

  if (process.env.NODE_ENV === "test" && url.includes("ylnmjvgnjootrkywbcsj")) {
    throw new Error("CRITICAL SAFETY VIOLATION: Test execution against production Supabase (ylnmjvgnjootrkywbcsj) is prohibited.");
  }

  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 20)
    ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim().replace(/^["']|["']$/g, "")
    : PROD_ANON_KEY;

  return createBrowserClient(url, anonKey);
}
