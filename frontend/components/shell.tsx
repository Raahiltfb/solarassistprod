"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { LayoutDashboard, Activity, Building2, Bell, Ticket, SprayCan, Wrench, Navigation, BarChart3, Users, Settings, LogOut, User as UserIcon } from "lucide-react";
import { ROLE_LABELS } from "@/lib/permissions";
import type { Profile } from "@/lib/types";

const NAV = [
  // Client Role
  {
    href: "/client",
    label: "Portfolio",
    icon: LayoutDashboard,
    roles: ["client"],
    subPaths: [],
  },
  {
    href: "/client/sites",
    label: "My Sites",
    icon: Building2,
    roles: ["client"],
    subPaths: [],
  },

  // Admin & EPC Admin Roles (Primary Hub Architecture)
  {
    href: "/dashboard",
    label: "Command Center",
    icon: LayoutDashboard,
    roles: ["super_admin", "epc_admin"],
    subPaths: [],
  },
  {
    href: "/overview",
    label: "Fleet Overview",
    icon: Activity,
    roles: ["super_admin", "epc_admin"],
    subPaths: [],
  },
  {
    href: "/service-requests",
    label: "Operations",
    icon: Wrench,
    roles: ["super_admin", "epc_admin"],
    subPaths: ["/cleaning", "/operations/routes", "/workforce", "/tickets"],
  },
  {
    href: "/sites",
    label: "Assets & Diagnostics",
    icon: Building2,
    roles: ["super_admin", "epc_admin"],
    subPaths: ["/alerts", "/inverters"],
  },
  {
    href: "/reports",
    label: "Clients & Reports",
    icon: BarChart3,
    roles: ["super_admin", "epc_admin"],
    subPaths: [],
  },
  {
    href: "/settings",
    label: "Configuration",
    icon: Settings,
    roles: ["super_admin", "epc_admin"],
    subPaths: ["/users"],
  },

  // Technician Role
  {
    href: "/dashboard",
    label: "My Work",
    icon: LayoutDashboard,
    roles: ["technician"],
    subPaths: [],
  },
  {
    href: "/service-requests",
    label: "Assigned Tasks",
    icon: Wrench,
    roles: ["technician"],
    subPaths: [],
  },
  {
    href: "/technician/cleaning",
    label: "Log Cleaning",
    icon: SprayCan,
    roles: ["technician"],
    subPaths: [],
  },
];

export function Shell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const items = NAV.filter((n) => n.roles.includes(profile.role));
  const initials = (profile.full_name || profile.email).split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden md:flex w-60 shrink-0 border-r bg-card flex-col" data-testid="sidebar">
        <div className="flex items-center justify-center px-4 h-20 border-b">
          <img src="/logo-full.png" alt="Solar Assist Logo" className="h-[74px] w-[74px] object-contain" />
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {items.map((it) => {
            const Active =
              pathname === it.href ||
              (it.href !== "/dashboard" && pathname.startsWith(it.href + "/")) ||
              it.subPaths?.some((sp) => pathname === sp || pathname.startsWith(sp + "/"));
            return (
              <Link
                key={it.href}
                href={it.href}
                data-testid={`nav-${it.href.slice(1)}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  Active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
              >
                <it.icon className="h-4 w-4" /> {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t text-xs text-muted-foreground">
          v0.1 · PWA ready
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="h-16 md:h-20 border-b bg-card/80 backdrop-blur flex items-center px-4 md:px-6 sticky top-0 z-30">
          <div className="md:hidden flex items-center gap-2">
            <img src="/logo-full.png" alt="Solar Assist Logo" className="h-10 w-10 object-contain" />
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <span className="text-[11px] sm:text-xs px-2.5 py-0.5 sm:py-1 rounded-full bg-primary/10 text-primary font-semibold">
              {ROLE_LABELS[profile.role]}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-10 w-10 p-0 sm:w-auto sm:px-2 gap-2" data-testid="user-menu">
                  <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                    {initials}
                  </div>
                  <span className="hidden sm:inline text-sm font-medium">{profile.full_name || profile.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="font-medium truncate">{profile.full_name || profile.email}</div>
                  <div className="text-xs text-muted-foreground truncate">{profile.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <UserIcon className="h-4 w-4 mr-2" /> Account Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} data-testid="sign-out">
                  <LogOut className="h-4 w-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1400px] w-full mx-auto animate-fade-in pb-20 md:pb-8">
          {children}
        </main>

        {/* Fixed Mobile Bottom Navigation Bar (Native Mobile PWA feel) */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur border-t flex justify-around items-center h-16 px-1 safe-area-pb"
          data-testid="mobile-nav"
        >
          {items.map((it) => {
            const Active =
              pathname === it.href ||
              (it.href !== "/dashboard" && pathname.startsWith(it.href + "/")) ||
              it.subPaths?.some((sp) => pathname === sp || pathname.startsWith(sp + "/"));
            return (
              <Link
                key={it.href}
                href={it.href}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 h-full py-1 text-[11px] font-medium transition-colors gap-1 min-w-0 px-1",
                  Active ? "text-primary font-bold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <it.icon className={cn("h-5 w-5 shrink-0", Active ? "text-primary stroke-[2.5]" : "text-muted-foreground")} />
                <span className="truncate w-full text-center leading-none">{it.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
