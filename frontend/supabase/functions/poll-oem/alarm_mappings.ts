export interface AlarmRule {
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'grid' | 'pv' | 'inverter' | 'site';
  is_auto_resolvable: boolean;
  requires_technician: boolean;
  recommended_action: string;
}

export const SOLIS_ALARM_MAPPING: Record<string, AlarmRule> = {
  // Grid Voltage
  "1011": {
    title: "Grid Over Voltage (OV-G-V)",
    description: "The utility grid voltage exceeds the inverter's maximum allowed limit.",
    severity: "high",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Inverter will auto-reconnect once grid voltage stabilizes. Contact grid provider if high voltage persists."
  },
  "F016": {
    title: "Grid Over Voltage (OV-G-V)",
    description: "The utility grid voltage exceeds the inverter's maximum allowed limit.",
    severity: "high",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Inverter will auto-reconnect once grid voltage stabilizes. Contact grid provider if high voltage persists."
  },
  "1012": {
    title: "Grid Under Voltage (UN-G-V)",
    description: "The utility grid voltage is lower than the inverter's minimum operational limit.",
    severity: "high",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Check if AC breaker is tripped. Verify utility grid connection is active."
  },
  "F015": {
    title: "Grid Under Voltage (UN-G-V)",
    description: "The utility grid voltage is lower than the inverter's minimum operational limit.",
    severity: "high",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Check if AC breaker is tripped. Verify utility grid connection is active."
  },
  
  // Grid Frequency
  "1015": {
    title: "Grid Over Frequency (OV-G-F)",
    description: "Grid frequency exceeds the inverter's maximum allowed limit.",
    severity: "medium",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Inverter will auto-reconnect once grid frequency returns to normal."
  },
  "1016": {
    title: "Grid Under Frequency (UN-G-F)",
    description: "Grid frequency is below the inverter's minimum limit.",
    severity: "medium",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Inverter will auto-reconnect once grid frequency returns to normal."
  },
  
  // Temperature
  "1021": {
    title: "Inverter Over Temperature (OV-TEMP)",
    description: "Internal inverter or heatsink temperature exceeds maximum safety limits.",
    severity: "high",
    category: "inverter",
    is_auto_resolvable: true,
    requires_technician: true,
    recommended_action: "Verify inverter is installed in a well-ventilated location. Clean heatsink fins and cooling fans."
  },
  "F045": {
    title: "Inverter Over Temperature (OV-TEMP)",
    description: "Internal inverter or heatsink temperature exceeds maximum safety limits.",
    severity: "high",
    category: "inverter",
    is_auto_resolvable: true,
    requires_technician: true,
    recommended_action: "Verify inverter is installed in a well-ventilated location. Clean heatsink fins and cooling fans."
  },
  
  // Isolation / Grounding faults
  "1045": {
    title: "Isolation Fault (ISO-F)",
    description: "Ground isolation resistance of the PV array is below the safe threshold, indicating potential ground leakage.",
    severity: "critical",
    category: "pv",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Perform isolation resistance test on all DC cables and solar panels. Check for moisture or water ingress."
  },
  "F012": {
    title: "Isolation Fault (ISO-F)",
    description: "Ground isolation resistance of the PV array is below the safe threshold, indicating potential ground leakage.",
    severity: "critical",
    category: "pv",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Perform isolation resistance test on all DC cables and solar panels. Check for moisture or water ingress."
  },
  
  // Generic Solis alarms
  "CLEANING_OVERDUE": {
    title: "Cleaning Overdue",
    description: "Soiling accumulation exceeds cycle threshold, causing generation drop.",
    severity: "medium",
    category: "site",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Schedule solar module cleaning."
  }
};

export function translateAlert(oem: string, rawCode: string, defaultTitle: string) {
  const oemLower = oem ? oem.toLowerCase() : "";
  let mapping: Record<string, AlarmRule> = {};
  
  if (oemLower === "solis") {
    mapping = SOLIS_ALARM_MAPPING;
  }
  
  const rule = mapping[rawCode];
  if (rule) {
    return {
      title: rule.title || defaultTitle,
      description: rule.description || `OEM code: ${rawCode}`,
      severity: rule.severity || "medium",
      category: rule.category || "inverter",
      recommended_action: rule.recommended_action || "Check inverter status and consult manual.",
      is_auto_resolvable: rule.is_auto_resolvable ?? false,
      requires_technician: rule.requires_technician ?? true
    };
  }
  
  return {
    title: defaultTitle,
    description: `OEM code: ${rawCode}`,
    severity: "medium",
    category: "inverter",
    recommended_action: "Check inverter operational status and refer to manual.",
    is_auto_resolvable: false,
    requires_technician: true
  };
}
