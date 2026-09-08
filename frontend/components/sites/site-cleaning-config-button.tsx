"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { Site, SiteCleaningRule } from "@/lib/types";
import { SiteRuleDialog } from "@/components/cleaning/site-rule-dialog";

interface SiteCleaningConfigButtonProps {
  site: Site;
  rule: SiteCleaningRule | null;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  label?: string;
  className?: string;
}

export function SiteCleaningConfigButton({
  site,
  rule,
  variant = "outline",
  size = "sm",
  label = "Configure Policy",
  className = "",
}: SiteCleaningConfigButtonProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setOpen(true)}
        className={`gap-1.5 text-xs ${className}`}
      >
        <Settings className="h-3.5 w-3.5" />
        <span>{label}</span>
      </Button>

      <SiteRuleDialog
        open={open}
        onOpenChange={setOpen}
        site={site}
        rule={rule}
        onSaved={() => router.refresh()}
      />
    </>
  );
}
