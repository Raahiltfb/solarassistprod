import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail, cleaningOverdueHtml } from "@/lib/integrations/resend";

/** Daily cron: detect sites past cleaning cycle and raise alerts + emails. */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = createServiceClient();
  const { data: sites } = await sb.from("sites").select("id, name, org_id, cleaning_cycle_days, last_cleaned_on");
  const now = Date.now();
  let alertsCreated = 0;

  for (const s of sites ?? []) {
    const last = s.last_cleaned_on ? new Date(s.last_cleaned_on).getTime() : 0;
    const days = last ? Math.floor((now - last) / 86400_000) : 999;
    if (days > s.cleaning_cycle_days) {
      // Ensure no duplicate open alert already exists
      const { data: existing } = await sb.from("alerts").select("id").eq("site_id", s.id).eq("code", "CLEANING_OVERDUE").eq("status", "open").limit(1);
      if (existing && existing.length > 0) continue;

      await sb.from("alerts").insert({
        org_id: s.org_id, site_id: s.id, code: "CLEANING_OVERDUE",
        title: `Cleaning overdue at ${s.name}`,
        description: `Site is ${days} days past the ${s.cleaning_cycle_days}-day cleaning cycle.`,
        severity: days > s.cleaning_cycle_days * 1.5 ? "high" : "medium",
      });
      alertsCreated++;

      const { data: admins } = await sb.from("profiles").select("email").eq("org_id", s.org_id).in("role", ["epc_admin","super_admin"]);
      await sendEmail({
        to: (admins ?? []).map((x) => x.email),
        subject: `Cleaning overdue — ${s.name}`,
        html: cleaningOverdueHtml({ siteName: s.name, daysOverdue: days - s.cleaning_cycle_days }),
      });
    }
  }

  return NextResponse.json({ ok: true, alertsCreated });
}
