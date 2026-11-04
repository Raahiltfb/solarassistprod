/* eslint-disable @typescript-eslint/no-explicit-any */
import solisRegistry from "../../../shared/alarm_registry/solis.json";
import growattRegistry from "../../../shared/alarm_registry/growatt.json";
import sungrowRegistry from "../../../shared/alarm_registry/sungrow.json";

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
  documentation_verified: boolean;
  is_synthetic_fallback?: boolean;
}

const registries: Record<string, { mappings: Record<string, any>; documentation_verified: boolean }> = {
  solis: {
    mappings: solisRegistry.mappings as Record<string, any>,
    documentation_verified: true,
  },
  growatt: {
    mappings: growattRegistry.mappings as Record<string, any>,
    documentation_verified: true,
  },
  sungrow: {
    mappings: sungrowRegistry.mappings as Record<string, any>,
    documentation_verified: true,
  },
};

/**
 * Returns canonical Alarm Intelligence for any given OEM alarm code.
 * Seamlessly normalizes Solis, Growatt, and Sungrow manufacturer fault codes into
 * the unified SolarAssist operational fault taxonomy.
 * 
 * Provides graceful fallback for unknown / unmapped telemetry codes.
 */
export function getAlarmIntelligence(code: string, oem = "solis"): AlarmIntelligence {
  const normalizedOem = (oem || "solis").toLowerCase().trim();
  const normalizedCode = code ? String(code).trim().toUpperCase() : "";

  const reg = registries[normalizedOem] || registries.solis;
  const raw = reg.mappings[normalizedCode] || reg.mappings[code];

  if (raw) {
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
      documentation_verified: reg.documentation_verified,
      is_synthetic_fallback: false,
    };
  }

  // Graceful Fallback for Unknown / Unregistered OEM Codes
  return {
    code: normalizedCode || code,
    oem_code: `GENERIC-${normalizedCode || code}`,
    title: `Unrecognized Alarm (${code})`,
    description: `Alarm code ${code} reported by ${normalizedOem.toUpperCase()} inverter is not present in local manufacturer registry.`,
    oem_definition: `Unregistered OEM telemetry event for ${normalizedOem.toUpperCase()}. Raw code: ${code}.`,
    severity: "medium",
    category: "inverter",
    requires_technician: true,
    is_auto_resolvable: false,
    potential_causes: [
      "Unregistered manufacturer telemetry code",
      "Inverter firmware revision discrepancy",
      "Transient communication packet anomaly",
    ],
    recommended_action: "Inspect physical inverter LCD status display or contact manufacturer support.",
    general_field_guidance: [
      { step: 1, phase: "Safety & Isolation", instruction: "Adhere to standard site electrical lockout/tagout protocols." },
      { step: 2, phase: "Visual Inspection", instruction: "Check front panel LED status and active on-screen error logs." },
      { step: 3, phase: "Measurements", instruction: "Verify AC grid voltage and DC string open-circuit voltages with multimeter." },
      { step: 4, phase: "Verification", instruction: "Attempt inverter soft reboot. If alarm persists, log details for OEM escalation." },
    ],
    documentation_verified: false,
    is_synthetic_fallback: true,
  };
}
