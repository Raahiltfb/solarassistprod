import { NextResponse } from "next/server";
import { processAlertAutomation } from "@/lib/automation/engine";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { alert_id } = body;

    if (!alert_id) {
      return NextResponse.json(
        { error: "alert_id is required" },
        { status: 400 }
      );
    }

    const result = await processAlertAutomation(alert_id);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Automation server error" },
      { status: 500 }
    );
  }
}
