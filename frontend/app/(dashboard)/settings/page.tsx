import { createClient, createServiceClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubNav } from "@/components/sub-nav";
import { ClientChangePasswordForm } from "@/components/client-change-password-form";

export default async function SettingsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();

  const profileRes = user
    ? await sb.from("profiles").select("*, organizations(*)").eq("id", user.id).single()
    : { data: null };

  const profile = profileRes.data;

  // Client Role Account Settings:
  // Overhauled view showing ONLY username, site name, and the option to change password.
  // Integrations, API keys, sub-navigation tabs and developer options are excluded.
  if (profile?.role === "client") {
    const serviceClient = createServiceClient();
    let sitesQuery = serviceClient.from("sites").select("id, name").order("name");
    if (profile.org_id) {
      sitesQuery = sitesQuery.or(
        `client_id.eq.${profile.id},client_org_id.eq.${profile.org_id},org_id.eq.${profile.org_id}`
      ).limit(25);
    } else {
      sitesQuery = sitesQuery.eq("client_id", profile.id).limit(25);
    }
    const { data: clientSites } = await sitesQuery;
    const siteNames = (clientSites || []).map((s: any) => s.name);
    const siteDisplayName =
      siteNames.length > 0
        ? siteNames.join(", ")
        : (profile as any)?.organizations?.name || "No site assigned";

    const username = profile.email || profile.full_name || user?.email || "—";

    return (
      <div className="max-w-2xl mx-auto space-y-6" data-testid="client-settings-page">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-semibold">Account Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your account details and password.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Account Information</CardTitle>
            <CardDescription>Your account credentials and assigned solar site.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-2 border-b">
              <span className="text-muted-foreground font-medium">Username</span>
              <span className="font-semibold text-foreground">{username}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-2 border-b">
              <span className="text-muted-foreground font-medium">Site Name</span>
              <span className="font-semibold text-foreground text-right">{siteDisplayName}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Change Password</CardTitle>
            <CardDescription>Set a new password for your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <ClientChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Admin & Staff Role System Settings
  const { data: oems } = await sb.from("oem_integrations").select("*");

  const isOemActive = (provider: string) =>
    oems?.some((o: any) => o.provider === provider && o.is_active) ?? false;

  const integrations = [
    { provider: "solis",      connected: isOemActive("solis") || !!process.env.SOLIS_KEY_ID, label: "Solis Cloud" },
    { provider: "feston",     connected: isOemActive("feston") || !!process.env.FESTON_APP_ID, label: "Feston / SolarOS" },
    { provider: "suryalogix", connected: isOemActive("suryalogix"), label: "Suryalogix" },
    { provider: "sungrow",    connected: isOemActive("sungrow") || !!process.env.SUNGROW_APP_KEY, label: "Sungrow iSolarCloud" },
    { provider: "growatt",    connected: isOemActive("growatt") || !!process.env.GROWATT_TOKEN, label: "Growatt" },
    { provider: "solcast",    connected: !!process.env.SOLCAST_API_KEY, label: "SolCast (benchmark)" },
    { provider: "resend",     connected: !!process.env.RESEND_API_KEY, label: "Resend (email)" },
  ];

  return (
    <div className="space-y-6" data-testid="settings-page">
      <SubNav hub="configuration" />
      <div>
        <h1 className="text-3xl font-display font-semibold">System Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Organisation, integrations and alerting.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Account</CardTitle><CardDescription>Your profile and organisation.</CardDescription></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Name: </span>{profile?.full_name || "—"}</div>
            <div><span className="text-muted-foreground">Email: </span>{profile?.email}</div>
            <div><span className="text-muted-foreground">Role: </span><Badge variant="secondary">{profile?.role}</Badge></div>
            <div><span className="text-muted-foreground">Organisation: </span>{(profile as any)?.organizations?.name ?? "—"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Integrations</CardTitle><CardDescription>Status of OEM and third-party adapters.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {integrations.map((i) => (
              <div key={i.provider} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                <span>{i.label}</span>
                {i.connected
                  ? <Badge variant="success">Connected</Badge>
                  : <Badge variant="outline" className="text-muted-foreground">Not configured</Badge>}
              </div>
            ))}
            <div className="text-xs text-muted-foreground pt-2">
              {oems?.length ?? 0} provider configs stored for this org.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
