import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL || "alerts@solar-assist.dev";

export async function sendEmail(opts: { to: string | string[]; subject: string; html: string }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[resend] RESEND_API_KEY not set — skipping email", opts.subject);
    return { ok: false, skipped: true };
  }
  try {
    const { error } = await resend.emails.send({
      from: `Solar Assist <${FROM}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    if (error) {
      console.error("[resend] error", error);
      return { ok: false, error };
    }
    return { ok: true };
  } catch (e) {
    console.error("[resend] exception", e);
    return { ok: false, error: e };
  }
}

export function alertEmailHtml(opts: {
  siteName: string;
  alertTitle: string;
  severity: string;
  description?: string;
  appUrl?: string;
}) {
  const sevColor: Record<string, string> = {
    critical: "#dc2626", high: "#ea580c", medium: "#d97706", low: "#64748b",
  };
  const color = sevColor[opts.severity] ?? "#64748b";
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
    <div style="border-left: 4px solid ${color}; padding: 16px 20px; background: #f8fafc; border-radius: 8px;">
      <div style="text-transform: uppercase; font-size: 11px; letter-spacing: 1.5px; color: ${color}; font-weight: 700;">${opts.severity} alert</div>
      <h2 style="margin: 8px 0 4px; color: #0f172a; font-size: 20px;">${opts.alertTitle}</h2>
      <div style="color: #475569; font-size: 14px;">Site: <b>${opts.siteName}</b></div>
      ${opts.description ? `<p style="margin-top: 12px; color: #334155; font-size: 14px; line-height: 1.5;">${opts.description}</p>` : ""}
    </div>
    ${opts.appUrl ? `<a href="${opts.appUrl}" style="display:inline-block; margin-top: 20px; background: #0f172a; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-size: 14px;">Open Solar Assist →</a>` : ""}
    <p style="color:#94a3b8; font-size: 12px; margin-top: 32px;">You received this because you are subscribed to alerts in Solar Assist.</p>
  </div>`;
}

export function cleaningOverdueHtml(opts: { siteName: string; daysOverdue: number; appUrl?: string }) {
  return `
  <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
    <h2 style="color:#0f172a;">Cleaning overdue at ${opts.siteName}</h2>
    <p style="color:#334155;">The site is <b>${opts.daysOverdue} days</b> past its scheduled cleaning cycle.
    Soiling losses can reduce generation by 1-2% per week of dust accumulation. Please schedule cleaning.</p>
    ${opts.appUrl ? `<a href="${opts.appUrl}" style="display:inline-block; margin-top: 12px; background: #0f172a; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none;">View site</a>` : ""}
  </div>`;
}
