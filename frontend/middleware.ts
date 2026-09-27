import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

const technicianBlockedRoutes = [
  "/alerts",
  "/reports",
  "/users",
  "/sites",
  "/settings",
  "/cleaning",
];

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);

  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/work-orders") || pathname.startsWith("/workorders")) {
    const newPath = pathname.replace(/^\/(work-orders|workorders)/, "/service-requests");
    return NextResponse.redirect(new URL(newPath + request.nextUrl.search, request.url));
  }

  const role =
    request.cookies.get("user-role")?.value;

  if (role === "client") {
    if (pathname === "/dashboard" || pathname === "/") {
      return NextResponse.redirect(
        new URL("/client", request.url)
      );
    }
  }

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