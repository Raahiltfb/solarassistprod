"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { LayoutDashboard, Sun, Building2, Bell, Ticket, SprayCan, BarChart3, Users, Settings, LogOut, User as UserIcon } from "lucide-react";
import { ROLE_LABELS } from "@/lib/permissions";
import type { Profile } from "@/lib/types";

const NAV = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["super_admin", "epc_admin", "technician", "client"],
  },

  {
    href: "/sites",
    label: "Sites",
    icon: Building2,
    roles: ["super_admin", "epc_admin", "client"],
  },

  {
    href: "/alerts",
    label: "Alerts",
    icon: Bell,
    roles: ["super_admin", "epc_admin", "client"],
  },

  {
    href: "/tickets",
    label: "Tickets",
    icon: Ticket,
    roles: ["super_admin", "epc_admin", "client"],
  },

  {
    href: "/cleaning",
    label: "Cleaning",
    icon: SprayCan,
    roles: ["super_admin", "epc_admin", "client"],
  },

  {
    href: "/technician/cleaning",
    label: "Cleaning",
    icon: SprayCan,
    roles: ["technician"],
  },

  {
    href: "/reports",
    label: "Reports",
    icon: BarChart3,
    roles: ["super_admin", "epc_admin", "client"],
  },

  {
    href: "/users",
    label: "Users",
    icon: Users,
    roles: ["super_admin", "epc_admin"],
  },

  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    roles: ["super_admin", "epc_admin"],
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
        <div className="flex items-center gap-2 px-5 h-16 border-b">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
            <Sun className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display font-semibold tracking-tight">Solar Assist</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {items.map((it) => {
            const Active = pathname === it.href || pathname.startsWith(it.href + "/");
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
        <header className="h-16 border-b bg-card/50 backdrop-blur flex items-center px-4 md:px-6 sticky top-0 z-30">
          <div className="md:hidden mr-2 flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
              <Sun className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold">Solar Assist</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:inline text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
              {ROLE_LABELS[profile.role]}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 gap-2 px-2" data-testid="user-menu">
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium">{initials}</div>
                  <span className="hidden sm:inline text-sm">{profile.full_name || profile.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="font-medium truncate">{profile.full_name || profile.email}</div>
                  <div className="text-xs text-muted-foreground truncate">{profile.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/settings"><UserIcon className="h-4 w-4 mr-2" /> Account</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} data-testid="sign-out"><LogOut className="h-4 w-4 mr-2" /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Mobile nav */}
        <nav className="md:hidden border-b bg-card overflow-x-auto flex gap-1 p-2" data-testid="mobile-nav">
          {items.map((it) => {
            const Active = pathname === it.href;
            return (
              <Link key={it.href} href={it.href}
                className={cn("px-3 py-1.5 rounded-md text-xs font-medium shrink-0 flex items-center gap-1.5",
                  Active ? "bg-primary/10 text-primary" : "text-muted-foreground")}>
                <it.icon className="h-3.5 w-3.5" /> {it.label}
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1400px] w-full mx-auto animate-fade-in">{children}</main>
      </div>
    </div>
  );
}
