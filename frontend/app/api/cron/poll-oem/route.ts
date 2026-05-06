import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { adapters } from "@/lib/integrations";
import { sendEmail, alertEmailHtml } from "@/lib/integrations/resend";

/**
 * Cron: poll every OEM integration, normalize into telemetry + alerts tables.
 * Also detects offline inverters (>15 min of no telemetry).
 * Schedule in Vercel at */15 * * * *.
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = createServiceClient();
  const { data: integrations } = await sb.from("oem_integrations").select("*").eq("is_active", true);

  let telemetryRows = 0;
  let alertRows = 0;

  for (const integ of integrations ?? []) {
    const adapter = adapters[integ.provider as keyof typeof adapters];
    if (!adapter) continue;
    // Expect integ.config.plants to be an array of { plant_id, site_id }
    const plants = (integ.config?.plants ?? []) as Array<{ plant_id: string; site_id: string }>;
    for (const p of plants) {
      const devices = await adapter.listDevices(p.plant_id);
      for (const d of devices) {
        const { data: inverter } = await sb.from("inverters").upsert({
          site_id: p.site_id, oem: integ.provider, oem_device_id: d.oem_device_id,
          model: d.model, serial_number: d.serial_number,
          capacity_kw: d.capacity_kw, string_count: d.string_count, installed_on: d.installed_on,
        }, { onConflict: "oem,oem_device_id" }).select().single();

        const telemetry = await adapter.fetchTelemetry(d.oem_device_id);
        for (const t of telemetry) {
          await sb.from("telemetry").insert({
            inverter_id: inverter!.id, timestamp: t.timestamp,
            ac_power_kw: t.ac_power_kw, dc_power_kw: t.dc_power_kw,
            energy_kwh: t.energy_kwh, efficiency_pct: t.efficiency_pct, temperature_c: t.temperature_c,
          });
          telemetryRows++;
        }
        await sb.from("inverters").update({ last_seen_at: new Date().toISOString(), status: telemetry[0]?.status ?? "online" }).eq("id", inverter!.id);

        const oemAlerts = await adapter.fetchAlerts(d.oem_device_id);
        for (const a of oemAlerts) {
          const { data: alert } = await sb.from("alerts").insert({
            org_id: integ.org_id, site_id: p.site_id, inverter_id: inverter!.id,
            code: a.code, title: a.title, description: a.description,
            severity: a.severity, status: "open", triggered_at: a.triggered_at,
          }).select().single();
          alertRows++;

          // Email notify
          const { data: admins } = await sb.from("profiles").select("email").eq("org_id", integ.org_id).in("role", ["epc_admin","super_admin"]);
          const { data: site } = await sb.from("sites").select("name").eq("id", p.site_id).single();
          await sendEmail({
            to: (admins ?? []).map((x) => x.email),
            subject: `[${a.severity.toUpperCase()}] ${a.title}`,
            html: alertEmailHtml({ siteName: site?.name ?? "Site", alertTitle: a.title, severity: a.severity, description: a.description }),
          });
          void alert;
        }
      }
    }
    await sb.from("oem_integrations").update({ last_sync_at: new Date().toISOString() }).eq("id", integ.id);
  }

  return NextResponse.json({ ok: true, telemetryRows, alertRows });
}
