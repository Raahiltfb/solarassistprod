"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  Image as ImageIcon,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  Camera,
  Layers,
} from "lucide-react";

export interface EvidenceItem {
  id?: string;
  label: string;
  category: "before" | "after" | "safety" | "damage" | "general";
  url: string;
  caption?: string;
}

interface ClientEvidenceViewerProps {
  title?: string;
  subtitle?: string;
  safetyPhotoUrl?: string | null;
  beforePhotoUrl?: string | null;
  afterPhotoUrl?: string | null;
  damagePhotoUrl?: string | null;
  damageObserved?: boolean | null;
  damageType?: string | null;
  remarks?: string | null;
  className?: string;
  compactTrigger?: boolean;
}

// Helper to parse multiple URLs from string, comma-separated or JSON
function parseUrls(val?: string | null): string[] {
  if (!val || typeof val !== "string") return [];
  const trimmed = val.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.filter((u) => typeof u === "string" && u.trim().length > 0);
    } catch (e) {}
  }
  return trimmed.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

export function ClientEvidenceViewer({
  title = "Field Service Evidence & Verification",
  subtitle,
  safetyPhotoUrl,
  beforePhotoUrl,
  afterPhotoUrl,
  damagePhotoUrl,
  damageObserved,
  damageType,
  remarks,
  className = "",
  compactTrigger = false,
}: ClientEvidenceViewerProps) {
  const [open, setOpen] = useState(false);
  const [activePhoto, setActivePhoto] = useState<EvidenceItem | null>(null);

  const items: EvidenceItem[] = [];

  // Parse Safety Gear / PPE photos (Category 1)
  const safetyUrls = parseUrls(safetyPhotoUrl);
  safetyUrls.forEach((url, i) => {
    items.push({
      id: `safety-${i}`,
      label: safetyUrls.length > 1 ? `Safety Gear / PPE (${i + 1}/${safetyUrls.length})` : "Safety Gear / PPE Protocol",
      category: "safety",
      url,
      caption: "Technician verified wearing mandatory PPE, harness, and safety footwear before climbing.",
    });
  });

  // Parse Before Cleaning / Baseline photos (Category 2)
  const beforeUrls = parseUrls(beforePhotoUrl);
  beforeUrls.forEach((url, i) => {
    items.push({
      id: `before-${i}`,
      label: beforeUrls.length > 1 ? `Before Cleaning (${i + 1}/${beforeUrls.length})` : "Before Cleaning / Module Baseline",
      category: "before",
      url,
      caption: "Photo recorded by technician upon arriving on site, documenting module soiling.",
    });
  });

  // Parse After Cleaning / Restored photos (Category 3)
  const afterUrls = parseUrls(afterPhotoUrl);
  afterUrls.forEach((url, i) => {
    items.push({
      id: `after-${i}`,
      label: afterUrls.length > 1 ? `After Cleaning (${i + 1}/${afterUrls.length})` : "After Cleaning / Restored State",
      category: "after",
      url,
      caption: "Photo recorded upon successful completion of washing, verifying restored irradiance capture.",
    });
  });

  // Parse Damage / Condition notes
  const damageUrls = parseUrls(damagePhotoUrl);
  if (damageUrls.length > 0 || damageObserved) {
    const urls = damageUrls.length > 0 ? damageUrls : [beforeUrls[0] || afterUrls[0] || ""];
    urls.forEach((url, i) => {
      items.push({
        id: `damage-${i}`,
        label: urls.length > 1 ? `Roof Observation (${i + 1}/${urls.length})` : "Roof & Panel Observation",
        category: "damage",
        url,
        caption: damageType ? `Observation type: ${damageType}` : "Observation recorded during site walk-around.",
      });
    });
  }

  // If no photos exist, return fallback
  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const selectedPhoto = activePhoto || items[0];

  const handleOpenPhoto = (item: EvidenceItem) => {
    setActivePhoto(item);
    setOpen(true);
  };

  return (
    <>
      <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
        {items.map((it, idx) => {
          const isBefore = it.category === "before";
          const isAfter = it.category === "after";
          const isSafety = it.category === "safety";
          const isDamage = it.category === "damage";

          return (
            <button
              key={it.id || idx}
              type="button"
              onClick={() => handleOpenPhoto(it)}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md border transition-all ${isAfter
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                : isBefore
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                  : isSafety
                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/20"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/20"
                }`}
            >
              {isAfter && <ShieldCheck className="h-3 w-3" />}
              {isBefore && <ImageIcon className="h-3 w-3" />}
              {isSafety && <ShieldCheck className="h-3 w-3" />}
              {isDamage && <AlertTriangle className="h-3 w-3" />}
              <span>
                {it.category === "after" 
                  ? "After Service" 
                  : it.category === "before" 
                    ? "Before Service" 
                    : it.category === "safety" 
                      ? "Safety / PPE" 
                      : "Condition Note"}
              </span>
              <Eye className="h-2.5 w-2.5 opacity-60 ml-0.5" />
            </button>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl md:max-w-3xl p-6">
          <DialogHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <Camera className="h-5 w-5 text-primary" />
                  {title}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {subtitle || "Tamper-evident photographic evidence collected during on-site visit."}
                </DialogDescription>
              </div>
              <Badge variant="outline" className="text-xs font-mono">
                {items.length} Photos Recorded
              </Badge>
            </div>
          </DialogHeader>

          {/* Photo Category Selector Tabs */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {items.map((it, idx) => (
              <Button
                key={it.id || idx}
                type="button"
                variant={selectedPhoto.id === it.id ? "default" : "outline"}
                size="sm"
                onClick={() => setActivePhoto(it)}
                className="text-xs h-7 gap-1.5"
              >
                {it.category === "after" && <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />}
                {it.category === "before" && <ImageIcon className="h-3.5 w-3.5" />}
                {it.category === "safety" && <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />}
                {it.category === "damage" && <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />}
                {it.label}
              </Button>
            ))}
          </div>

          {/* Active Photo Display */}
          <div className="space-y-3">
            <div className="relative aspect-[16/10] sm:aspect-[16/9] bg-black/90 rounded-xl overflow-hidden border flex items-center justify-center">
              {selectedPhoto.url ? (
                <img
                  src={selectedPhoto.url}
                  alt={selectedPhoto.label}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              ) : null}

              {/* Overlay Label */}
              <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md text-white text-xs px-2.5 py-1 rounded-md flex items-center gap-1.5 border border-white/10">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="font-medium">{selectedPhoto.label}</span>
              </div>

              {selectedPhoto.url && (
                <a
                  href={selectedPhoto.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute bottom-3 right-3 bg-black/70 hover:bg-black/90 text-white text-xs px-2.5 py-1 rounded-md flex items-center gap-1 border border-white/10 transition-colors"
                >
                  <span>Open Full Resolution</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {/* Photo description / technician note */}
            <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                {selectedPhoto.caption}
              </div>
              {remarks && (
                <p className="text-muted-foreground pt-1 border-t mt-1">
                  <span className="font-medium text-foreground">Technician Log:</span> {remarks}
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
