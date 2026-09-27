"use client";
import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjk1ODcsImV4cCI6MjA5MzY0NTU4N30.d9VUDRLSsruy7QSXf6GigVaIijkmmSdhP8nObWatB_8";

export function createClient() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith("https://")) 
    ? process.env.NEXT_PUBLIC_SUPABASE_URL.trim().replace(/^["']|["']$/g, "") 
    : SUPABASE_URL;

  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.startsWith("eyJhbGci"))
    ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim().replace(/^["']|["']$/g, "")
    : SUPABASE_ANON_KEY;

  return createBrowserClient(url, anonKey);
}
