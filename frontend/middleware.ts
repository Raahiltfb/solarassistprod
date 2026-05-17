import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

const technicianBlockedRoutes = [
  "/alerts",
  "/tickets",
  "/reports",
  "/users",
  "/sites",
  "/settings",
  "/cleaning",
];

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);

  const role =
    request.cookies.get("user-role")?.value;

  const pathname = request.nextUrl.pathname;

  if (role === "technician") {
    const isTechnicianRoute =
      pathname.startsWith(
        "/technician"
      );
  
    const isBlocked =
      technicianBlockedRoutes.some((route) =>
        pathname.startsWith(route)
      );
  
    if (isBlocked && !isTechnicianRoute) {
      return NextResponse.redirect(
        new URL("/dashboard", request.url)
      );
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};