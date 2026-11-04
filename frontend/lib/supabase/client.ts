"use client";
import { createBrowserClient } from "@supabase/ssr";

// Safe default to staging for local development when environment variables are unset
const STAGING_URL = "https://xpjzuquqehjamqsqshwq.supabase.co";
const STAGING_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhwanp1cXVxZWhqYW1xc3FzaHdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5OTI3MzYsImV4cCI6MjEwODU2ODczNn0.pfWb62_WTMBu0K1V2cu25-Iu6tARTYq2hiawHY0Dnfk";

export function createClient() {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/^["']|["']$/g, "");
  const url = (envUrl && envUrl.startsWith("https://")) ? envUrl : STAGING_URL;

  if (process.env.NODE_ENV === "test" && url.includes("ylnmjvgnjootrkywbcsj")) {
    throw new Error("CRITICAL SAFETY VIOLATION: Test execution against production Supabase (ylnmjvgnjootrkywbcsj) is prohibited.");
  }

  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 20)
    ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim().replace(/^["']|["']$/g, "")
    : STAGING_ANON_KEY;

  return createBrowserClient(url, anonKey);
}
