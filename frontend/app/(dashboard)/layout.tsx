import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

import { Shell } from "@/components/shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = await createClient();

  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  return (
    <Shell profile={profile}>
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="container mx-auto p-4 lg:p-8">
          {children}
        </div>
      </main>
    </Shell>
  );
}