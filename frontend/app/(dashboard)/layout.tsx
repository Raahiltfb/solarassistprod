import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Shell } from "@/components/shell";
import type { Profile } from "@/lib/types";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");

  return <Shell profile={profile as Profile}>{children}</Shell>;
}
