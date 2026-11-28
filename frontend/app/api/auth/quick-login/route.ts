import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Passwordless login is disabled. Please sign in using your email and password at /login.",
      success: false,
    },
    { status: 403 }
  );
}

export async function GET() {
  return NextResponse.json(
    {
      error: "Passwordless login is disabled.",
      success: false,
    },
    { status: 403 }
  );
}
