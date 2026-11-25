import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { PlusCircle, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "super_admin" && profile.role !== "epc_admin")) {
    redirect("/dashboard");
  }

  const [locRes, clientRes] = await Promise.all([
    serviceClient.from("cleaning_locations").select("id, name, address").order("name"),
    serviceClient.from("profiles").select("id, full_name, email").eq("role", "client").order("full_name"),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-primary font-semibold uppercase tracking-wider mb-1">
            <PlusCircle className="h-4 w-4" />
            <span>Operational Infrastructure</span>
          </div>
          <h1 className="text-2xl font-bold font-display tracking-tight text-foreground flex items-center gap-2.5">
            <span>Automated Plant Onboarding</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono font-medium flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Zero Manual Stitching
            </span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            End-to-end solar plant provisioning: DC capacity, OEM inverter telemetry, string indexing, cleaning policies, and AMC contracts.
          </p>
        </div>
      </div>

      <OnboardingWizard
        cleaningLocations={locRes.data ?? []}
        clientProfiles={clientRes.data ?? []}
      />
    </div>
  );
}
