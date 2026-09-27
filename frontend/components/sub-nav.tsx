"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Wrench, SprayCan, Navigation, Users, Ticket, Building2, Bell, Settings, ShieldCheck } from "lucide-react";

interface SubNavProps {
  hub: "operations" | "assets" | "configuration";
}

const HUB_TABS = {
  operations: [
    { href: "/service-requests", label: "Service Requests", icon: Wrench },
    { href: "/cleaning", label: "Cleaning Schedule", icon: SprayCan },
    { href: "/operations/routes", label: "Routes & Dispatch", icon: Navigation },
    { href: "/workforce", label: "Workforce", icon: Users },
    { href: "/tickets", label: "Incidents Queue", icon: Ticket },
  ],
  assets: [
    { href: "/sites", label: "Fleet Sites", icon: Building2 },
    { href: "/alerts", label: "Telemetry & Alarms", icon: Bell },
  ],
  configuration: [
    { href: "/settings", label: "System Settings", icon: Settings },
    { href: "/users", label: "Users & Roles", icon: ShieldCheck },
  ],
};

export function SubNav({ hub }: SubNavProps) {
  const pathname = usePathname();
  const tabs = HUB_TABS[hub] || [];

  return (
    <div className="border-b mb-6 bg-card/30 -mx-4 px-4 md:-mx-6 md:px-6 -mt-2 pt-2">
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || (tab.href !== "/service-requests" && tab.href !== "/sites" && tab.href !== "/settings" && pathname.startsWith(tab.href + "/"));
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap",
                isActive
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
