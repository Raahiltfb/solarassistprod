import solisRegistry from "../../../shared/alarm_registry/solis.json";

export interface FieldGuidanceStep {
  step: number;
  phase: "Safety & Isolation" | "Visual Inspection" | "Measurements" | "Verification";
  instruction: string;
}

export interface AlarmIntelligence {
  code: string;
  oem_code?: string;
  title: string;
  description: string;
  oem_definition: string;
  severity: "critical" | "high" | "medium" | "low";
  category: "pv" | "inverter" | "grid" | "site";
  requires_technician: boolean;
  is_auto_resolvable: boolean;
  potential_causes: string[];
  recommended_action: string;
  general_field_guidance: FieldGuidanceStep[];
}

const solisMappings = solisRegistry.mappings as Record<string, any>;

/**
 * Returns canonical Alarm Intelligence for any given OEM alarm code.
 */
export function getAlarmIntelligence(code: string, oem = "solis"): AlarmIntelligence | null {
  const normalizedCode = code ? String(code).trim().toUpperCase() : "";
  const raw = solisMappings[normalizedCode] || solisMappings[code];

  if (!raw) return null;

  const ops = raw.operational_interpretation || {};

  return {
    code: raw.code || code,
    oem_code: raw.oem_code,
    title: raw.title || `Alarm Code ${code}`,
    description: raw.description || "",
    oem_definition: raw.oem_definition || "OEM protection event.",
    severity: ops.severity || "medium",
    category: ops.category || "inverter",
    requires_technician: ops.requires_technician ?? true,
    is_auto_resolvable: ops.is_auto_resolvable ?? false,
    potential_causes: raw.potential_causes || [],
    recommended_action: raw.recommended_action || "Perform standard operational check.",
    general_field_guidance: raw.general_field_guidance || [],
  };
}
