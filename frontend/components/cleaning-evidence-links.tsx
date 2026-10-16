"use client";

import React from "react";
import { ClientEvidenceViewer } from "@/components/client-evidence-viewer";

interface CleaningEvidenceLinksProps {
  safetyPhotoUrl?: string | null;
  beforePhotoUrl?: string | null;
  afterPhotoUrl?: string | null;
  damagePhotoUrl?: string | null;
  damageObserved?: boolean | null;
  damageType?: string | null;
  remarks?: string | null;
  className?: string;
}

export function CleaningEvidenceLinks({
  safetyPhotoUrl,
  beforePhotoUrl,
  afterPhotoUrl,
  damagePhotoUrl,
  damageObserved,
  damageType,
  remarks,
  className = "",
}: CleaningEvidenceLinksProps) {
  return (
    <ClientEvidenceViewer
      safetyPhotoUrl={safetyPhotoUrl}
      beforePhotoUrl={beforePhotoUrl}
      afterPhotoUrl={afterPhotoUrl}
      damagePhotoUrl={damagePhotoUrl}
      damageObserved={damageObserved}
      damageType={damageType}
      remarks={remarks}
      className={className}
    />
  );
}
