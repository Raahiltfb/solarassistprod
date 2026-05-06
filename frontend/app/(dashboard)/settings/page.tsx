import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function SettingsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = await sb.from("profiles").select("*, organizations(*)").eq("id", user!.id).single();
  const { data: oems } = await sb.from("oem_integrations").select("*");

  const integrations = [
    { provider: "solis",   connected: !!process.env.SOLIS_KEY_ID, label: "Solis Cloud" },
    { provider: "growatt", connected: !!process.env.GROWATT_TOKEN, label: "Growatt" },
    { provider: "sungrow", connected: !!process.env.SUNGROW_APP_KEY, label: "Sungrow iSolarCloud" },
    { provider: "solcast", connected: !!process.env.SOLCAST_API_KEY, label: "SolCast (benchmark)" },
    { provider: "resend",  connected: !!process.env.RESEND_API_KEY, label: "Resend (email)" },
  ];

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div>
        <h1 className="text-3xl font-display font-semibold">Settings</h1>
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
