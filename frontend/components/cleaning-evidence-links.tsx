"use client";

import React from "react";
import { ExternalLink, ShieldCheck, Image as ImageIcon, AlertTriangle } from "lucide-react";

interface CleaningEvidenceLinksProps {
  safetyPhotoUrl?: string | null;
  beforePhotoUrl?: string | null;
  afterPhotoUrl?: string | null;
  damagePhotoUrl?: string | null;
  damageObserved?: boolean | null;
  className?: string;
}

export function CleaningEvidenceLinks({
  safetyPhotoUrl,
  beforePhotoUrl,
  afterPhotoUrl,
  damagePhotoUrl,
  damageObserved,
  className = "",
}: CleaningEvidenceLinksProps) {
  const links = [];

  if (safetyPhotoUrl) {
    links.push({
      label: "Safety Gear",
      url: safetyPhotoUrl,
      variant: "default" as const,
      icon: ShieldCheck,
    });
  }

  if (beforePhotoUrl) {
    links.push({
      label: "Before Cleaning",
      url: beforePhotoUrl,
      variant: "default" as const,
      icon: ImageIcon,
    });
  }

  if (afterPhotoUrl) {
    links.push({
      label: "After Cleaning",
      url: afterPhotoUrl,
      variant: "default" as const,
      icon: ImageIcon,
    });
  }

  const showDamage = Boolean(damagePhotoUrl || damageObserved);
  if (showDamage && damagePhotoUrl) {
    links.push({
      label: "Damage",
      url: damagePhotoUrl,
      variant: "destructive" as const,
      icon: AlertTriangle,
    });
  }

  if (links.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {links.map((link, idx) => {
        const Icon = link.icon;
        const isDestructive = link.variant === "destructive";
        return (
          <a
            key={idx}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 text-xs font-medium underline transition-colors px-2 py-0.5 rounded border ${
              isDestructive
                ? "text-destructive border-destructive/30 hover:bg-destructive/10"
                : "text-primary border-primary/20 hover:bg-primary/10"
            }`}
          >
            <Icon className="h-3 w-3" />
            <span>{link.label}</span>
            <ExternalLink className="h-2.5 w-2.5 opacity-70" />
          </a>
        );
      })}
    </div>
  );
}
