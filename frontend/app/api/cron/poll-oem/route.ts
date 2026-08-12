import { NextResponse, type NextRequest } from "next/server";

/**
 * Cron: poll every OEM integration, normalize into telemetry + alerts tables.
 * Delegates trigger to the Python FastAPI backend `/api/sync` endpoint.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = req.nextUrl.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized = 
    !cronSecret ||
    secret === cronSecret ||
    authHeader === `Bearer ${cronSecret}`;

  if (!isAuthorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const backendUrl = process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8000";
  console.log(`Forwarding poll-oem cron trigger to Python backend at: ${backendUrl}/api/sync`);

  try {
    const res = await fetch(`${backendUrl}/api/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cronSecret || ""}`
      },
      body: JSON.stringify({
        trigger_source: "vercel_cron"
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ 
        error: `Python backend returned status ${res.status}: ${errText}` 
      }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json({ ok: true, backendResponse: data });
  } catch (err: any) {
    return NextResponse.json({ 
      error: `Failed to communicate with Python backend: ${err.message}` 
    }, { status: 500 });
  }
}
