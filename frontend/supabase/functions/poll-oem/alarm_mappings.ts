export interface AlarmRule {
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'grid' | 'pv' | 'inverter' | 'site' | 'electrical' | 'communication' | 'battery';
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

const BASE_FESTON_RULES: Record<string, AlarmRule> = {
  "F18": {
    title: "AC Overcurrent Fault",
    description: "Inverter output AC current exceeded hardware safety limit.",
    severity: "critical",
    category: "inverter",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Check AC breaker and distribution load. Inspect inverter AC output terminals and restart after checking line impedance."
  },
  "F20": {
    title: "DC Overcurrent Fault",
    description: "DC input current on PV or battery port exceeded allowable hardware limit.",
    severity: "critical",
    category: "pv",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Measure DC string operating currents using a DC clamp meter. Verify PV array module matching against inverter rating."
  },
  "F22": {
    title: "Hardware Emergency Stop (TZ Fault)",
    description: "Inverter hardware protection circuit triggered an immediate emergency shutdown.",
    severity: "critical",
    category: "inverter",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Perform full power cycle of inverter. If fault persists on reboot, contact OEM support for main control board or power unit inspection."
  },
  "F23": {
    title: "AC Leakage Current Fault (GFCI)",
    description: "Residual ground leakage current exceeded safety threshold.",
    severity: "critical",
    category: "electrical",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Perform ground leakage and isolation tests across individual strings. Check moisture inside enclosures."
  },
  "F24": {
    title: "DC Insulation Resistance Fault (ISO)",
    description: "PV array insulation resistance to earth ground is below the permissible limit.",
    severity: "critical",
    category: "pv",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Use a 1000V DC insulation megohmmeter to test resistance of each string (positive to earth, negative to earth). Inspect wiring runs."
  },
  "F25": {
    title: "DC Injection / Feedback Fault",
    description: "Direct current component injected into AC grid output exceeded permissible safety limits.",
    severity: "high",
    category: "electrical",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Perform complete inverter power cycle. If fault persists upon grid reconnection, contact OEM support for transducer calibration."
  },
  "F26": {
    title: "DC Bus Unbalance Fault",
    description: "DC bus positive and negative half-voltages show abnormal imbalance.",
    severity: "high",
    category: "inverter",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Inspect grid neutral connection. If grid is balanced, internal inverter bus capacitors require OEM bench inspection."
  },
  "F29": {
    title: "Parallel CAN Communication Fault",
    description: "Communication link between parallel inverter units is interrupted.",
    severity: "medium",
    category: "communication",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Check RJ45 parallel communication cables between inverters. Ensure termination resistors are enabled only on terminal inverters."
  },
  "F34": {
    title: "AC Grid Voltage Out of Range",
    description: "Utility grid voltage is outside the permissible operating window.",
    severity: "high",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Measure AC line-to-neutral and line-to-line RMS voltages at the inverter terminal block. Inverter auto-reconnects when voltage normalizes."
  },
  "F35": {
    title: "AC Grid Loss / No Utility (F35)",
    description: "Utility grid power is lost or AC circuit breaker is open.",
    severity: "high",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Verify utility grid presence at the AC distribution board. If grid is present, check AC breaker and isolator switches."
  },
  "F41": {
    title: "Parallel System Phase Loss",
    description: "Phase sequence mismatch or missing phase in parallel inverter system.",
    severity: "high",
    category: "grid",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Check phase rotation with a phase indicator. Verify matching phase wiring across all parallel units."
  },
  "F42": {
    title: "AC Grid Low Frequency",
    description: "Utility grid frequency dropped below inverter operating limits.",
    severity: "medium",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Monitor utility grid frequency. Auto-reconnects when frequency normalizes within standard grid limits (47.5 Hz - 50.2 Hz)."
  },
  "F47": {
    title: "AC Grid High Frequency",
    description: "Utility grid frequency exceeded inverter operating limits.",
    severity: "medium",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Monitor grid frequency. Reconnection occurs automatically after frequency stabilizes."
  },
  "F48": {
    title: "AC Grid Under-Voltage",
    description: "Utility grid voltage is below permissible lower operating limit.",
    severity: "high",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Measure line voltage at inverter AC terminals. Check AC cable sizing and transformer tap setting if brownout persists."
  },
  "F49": {
    title: "AC Grid Over-Voltage",
    description: "Utility grid voltage exceeded upper permissible limit.",
    severity: "high",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Measure grid voltage under zero solar export and during full export. Consult utility for transformer tap adjustment if needed."
  },
  "F56": {
    title: "DC Bus Over-Voltage",
    description: "Inverter internal DC bus voltage exceeded upper hardware safety threshold.",
    severity: "critical",
    category: "inverter",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Check PV string open-circuit voltage with a 1000V DC meter. Verify module temperature coefficients and string sizing."
  },
  "F58": {
    title: "BMS Communication Lost",
    description: "Communication link between inverter and Lithium battery BMS has timed out.",
    severity: "medium",
    category: "battery",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Check RJ45 cable between inverter BMS port and battery. Verify battery protocol selection in system settings."
  },
  "F63": {
    title: "DC Arc Fault Detected (AFCI)",
    description: "Arc-Fault Circuit Interrupter detected series or parallel arcing on DC array.",
    severity: "critical",
    category: "pv",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Thoroughly inspect all DC connectors, junction boxes, and module junction boxes on affected array. Clear fault only after verification."
  },
  "F64": {
    title: "Heat Sink Over-Temperature",
    description: "Internal power heatsink or IGBT temperature exceeded safe thermal threshold.",
    severity: "high",
    category: "inverter",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Check cooling fans and clean heatsink air vents. Ensure adequate ventilation clearance around inverter enclosure."
  }
};

export const FESTON_ALARM_MAPPING: Record<string, AlarmRule> = {};

// Index primary codes (Fxx) and variations (ERRxx, xx)
for (const [code, rule] of Object.entries(BASE_FESTON_RULES)) {
  FESTON_ALARM_MAPPING[code] = rule;
  if (code.startsWith("F") && /^\d+$/.test(code.slice(1))) {
    const num = code.slice(1);
    FESTON_ALARM_MAPPING[`ERR${num}`] = rule;
    FESTON_ALARM_MAPPING[num] = rule;
  }
}

// SolarOS / Deye protocol aliases
const PROTOCOL_ALIASES: Record<string, string> = {
  "ERR5": "F35",
  "2": "F35"
};
for (const [alias, targetCode] of Object.entries(PROTOCOL_ALIASES)) {
  if (FESTON_ALARM_MAPPING[targetCode]) {
    FESTON_ALARM_MAPPING[alias] = FESTON_ALARM_MAPPING[targetCode];
  }
}

export function matchFestonAlarm(rawCode: string, title: string = ""): AlarmRule | null {
  if (!rawCode && !title) return null;

  // 1. Exact match on rawCode
  if (rawCode && FESTON_ALARM_MAPPING[rawCode]) {
    return FESTON_ALARM_MAPPING[rawCode];
  }

  // 2. Extract Fxx or ERRxx from rawCode or title
  const searchText = `${rawCode || ""} ${title || ""}`;
  const fMatch = searchText.match(/\b(F\d{1,2})\b/i);
  if (fMatch) {
    const fCode = fMatch[1].toUpperCase();
    if (FESTON_ALARM_MAPPING[fCode]) {
      return FESTON_ALARM_MAPPING[fCode];
    }
  }

  const errMatch = searchText.match(/\b(ERR\d{1,2})\b/i);
  if (errMatch) {
    const errCode = errMatch[1].toUpperCase();
    if (FESTON_ALARM_MAPPING[errCode]) {
      return FESTON_ALARM_MAPPING[errCode];
    }
  }

  // 3. Keyword matching
  const kwMappings: Array<[string, string]> = [
    ["NoUtillity", "F35"],
    ["Grid_Loss", "F35"],
    ["Insulation", "F24"],
    ["GFCI", "F23"],
    ["Leakage", "F23"],
    ["OverTemp", "F64"],
    ["OverCurrent", "F18"],
    ["Arc", "F63"],
    ["CAN", "F29"],
    ["BMS", "F58"],
    ["BusUnbalance", "F26"],
    ["BusVoltage", "F56"]
  ];

  for (const [kw, targetCode] of kwMappings) {
    if (searchText.toLowerCase().includes(kw.toLowerCase())) {
      if (FESTON_ALARM_MAPPING[targetCode]) {
        return FESTON_ALARM_MAPPING[targetCode];
      }
    }
  }

  return null;
}

export const SURYALOGIX_ALARM_MAPPING: Record<string, AlarmRule> = {
  "ERR_COMM_DOWN": {
    title: "Inverter Communication Lost",
    description: "Communication link between Suryalogix data logger and the inverter has been interrupted.",
    severity: "high",
    category: "communication",
    is_auto_resolvable: true,
    requires_technician: true,
    recommended_action: "Check RS485 wiring, logger terminal connections, and inverter control card power."
  },
  "INV_STATUS_FAULT": {
    title: "Inverter General Fault",
    description: "Inverter reported critical error state and tripped offline.",
    severity: "critical",
    category: "inverter",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Check inverter LCD display or diagnostic registers for exact fault code, isolate AC/DC and inspect installation."
  },
  "INV_STATUS_DERATING": {
    title: "Inverter Thermal or Power Derating",
    description: "Inverter active power output is throttled due to high temperature or curtailment limit.",
    severity: "medium",
    category: "inverter",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Inspect cooling fans for debris, verify cabinet ventilation clearance, and check active power setpoint."
  },
  "OVER_TEMP": {
    title: "Heatsink / Cabinet Over Temperature",
    description: "Power electronics heatsink or internal cabinet temperature exceeded safe operating threshold.",
    severity: "high",
    category: "inverter",
    is_auto_resolvable: true,
    requires_technician: true,
    recommended_action: "Clean heatsink fins, test cooling fan rotation, and verify air intake filters."
  },
  "GRID_OVER_VOLTAGE": {
    title: "Grid Overvoltage",
    description: "Three-phase grid voltage exceeded inverter high voltage threshold.",
    severity: "high",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Inverter will auto-reconnect once grid voltage normalizes. Contact distribution utility if persistent."
  },
  "GRID_UNDER_VOLTAGE": {
    title: "Grid Undervoltage / AC Blackout",
    description: "Utility grid voltage fell below minimum allowable operational limit.",
    severity: "high",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Check AC breaker position and inspect grid supply status."
  },
  "PV_ISO_FAULT": {
    title: "PV Array Ground Isolation Fault",
    description: "Insulation resistance between DC array conductors and earth is below the safety threshold.",
    severity: "critical",
    category: "pv",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Test string insulation resistance to earth using 1000V megohmmeter. Locate and repair faulted DC conductor."
  },
  "DC_OVER_VOLTAGE": {
    title: "DC Input Overvoltage",
    description: "DC input voltage on MPPT terminals exceeded the inverter maximum open-circuit voltage rating.",
    severity: "critical",
    category: "pv",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Measure open-circuit voltage (Voc) of each string immediately. Reconfigure string module count if over design limit."
  },
  "SMB_COMM_FAULT": {
    title: "String Combiner Box Communication Fault",
    description: "Communication with DC String Monitoring Box (SMB) timed out.",
    severity: "medium",
    category: "communication",
    is_auto_resolvable: true,
    requires_technician: true,
    recommended_action: "Check 24V DC auxiliary power in SMB and verify RS485 communication lines."
  },
  "SMB_STRING_FAULT": {
    title: "SMB DC String Disconnect / Blown Fuse",
    description: "SMB card detected blown DC fuse or zero-current deviation on active string.",
    severity: "high",
    category: "pv",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Open SMB enclosure, check continuity across DC fuses, and measure open-circuit string voltage."
  }
};

export const SUNGROW_ALARM_MAPPING: Record<string, AlarmRule> = {
  "FAULT_2": {
    title: "Grid Undervoltage",
    description: "Grid voltage is below the lower operating limit configured on the inverter.",
    severity: "high",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Check AC breaker and verify utility grid supply voltage. Inverter will auto-reconnect once grid recovers."
  },
  "FAULT_3": {
    title: "Grid Transient Overvoltage",
    description: "Transient grid AC voltage spike exceeded statutory protection limit.",
    severity: "high",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Inverter will wait out disconnection timer and automatically attempt reconnect."
  },
  "FAULT_4": {
    title: "Grid Transient Undervoltage",
    description: "Transient AC voltage drop below safe operational threshold.",
    severity: "high",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Monitor grid stability; inverter will self-recover when voltage normalizes."
  },
  "FAULT_8": {
    title: "Grid Underfrequency",
    description: "Grid AC frequency dropped below minimum operating limit.",
    severity: "medium",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Wait for utility frequency stabilization."
  },
  "FAULT_10": {
    title: "Grid Overfrequency",
    description: "Grid frequency exceeded maximum permissible frequency threshold.",
    severity: "medium",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Inverter will auto-reconnect once grid frequency returns to nominal range."
  },
  "FAULT_11": {
    title: "Grid Blackout / AC Power Loss",
    description: "Utility grid power completely lost at inverter AC terminals.",
    severity: "high",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Check AC main breaker and confirm site grid availability."
  },
  "FAULT_12": {
    title: "Anti-Islanding Protection Trip",
    description: "Inverter anti-islanding circuit detected island operation condition.",
    severity: "high",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Ensure utility grid is solidly connected and breaker is closed."
  },
  "FAULT_14": {
    title: "Grid Phase Sequence Fault",
    description: "Three-phase AC output sequence is incorrect (e.g. reversed phases).",
    severity: "high",
    category: "electrical",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "De-energize AC breaker, check phase sequence with rotation meter, and swap L1/L2 phases if reversed."
  },
  "FAULT_15": {
    title: "Grid Overvoltage",
    description: "Grid AC voltage exceeded the upper operating threshold configured on the inverter.",
    severity: "high",
    category: "grid",
    is_auto_resolvable: true,
    requires_technician: false,
    recommended_action: "Measure grid voltage. If grid voltage is normal, inspect AC wiring connections."
  },
  "FAULT_16": {
    title: "Inverter AC Output Overcurrent",
    description: "AC current delivered by inverter exceeded instantaneous hardware limit.",
    severity: "critical",
    category: "inverter",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Isolate AC and DC switches. Inspect AC cabling for short circuits before restarting."
  },
  "FAULT_19": {
    title: "Residual Current (RCD) Fault",
    description: "Leakage current to earth exceeded allowable residual current threshold.",
    severity: "critical",
    category: "pv",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Inspect DC cabling and module junctions for water ingress or insulation breakdown."
  },
  "FAULT_36": {
    title: "Inverter Heatsink Overtemperature",
    description: "Inverter power module heatsink temperature exceeded thermal safety cutoff limits.",
    severity: "high",
    category: "inverter",
    is_auto_resolvable: true,
    requires_technician: true,
    recommended_action: "Clean heatsink fins, test cooling fans, and ensure unrestricted air passage."
  },
  "FAULT_37": {
    title: "Inverter Cabinet Overtemperature",
    description: "Inverter internal heatsink or ambient temperature exceeded thermal safety cutoff limits.",
    severity: "high",
    category: "inverter",
    is_auto_resolvable: true,
    requires_technician: true,
    recommended_action: "Clear air vents, check fan operation, and verify thermal environment."
  },
  "FAULT_39": {
    title: "Isolation Fault (ISO-F)",
    description: "Ground isolation resistance of the PV array is below the safe operational threshold.",
    severity: "critical",
    category: "pv",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Check PV string insulation resistance to earth with megohmmeter. Locate and eliminate ground fault on DC side."
  },
  "FAULT_40": {
    title: "DC Bus Overvoltage",
    description: "Inverter internal DC bus capacitor voltage exceeded hardware protection limit.",
    severity: "critical",
    category: "pv",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Check string open circuit voltage against maximum permissible DC input voltage."
  },
  "FAULT_42": {
    title: "PV Input Overcurrent",
    description: "DC input current into MPPT tracker exceeded allowable inverter maximum rating.",
    severity: "critical",
    category: "pv",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Verify module string paralleling design and check MPPT maximum short-circuit current."
  },
  "FAULT_43": {
    title: "String Reverse Polarity",
    description: "One or more DC strings are connected with reversed positive and negative polarity.",
    severity: "high",
    category: "pv",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "De-energize inverter DC disconnect immediately. Use DC voltmeter to identify and correct reversed string."
  },
  "FAULT_75": {
    title: "Communication Fault with Meter / Logger",
    description: "Inverter lost RS485 communication with smart meter or monitoring logger.",
    severity: "medium",
    category: "communication",
    is_auto_resolvable: true,
    requires_technician: true,
    recommended_action: "Check meter RS485 communication wiring and verify communication parameters."
  },
  "FAULT_532": {
    title: "String Underperformance / Zero Current",
    description: "One of the DC strings has zero current while other parallel strings are generating normally.",
    severity: "high",
    category: "pv",
    is_auto_resolvable: false,
    requires_technician: true,
    recommended_action: "Inspect string current in iSolarCloud, check string fuses, and measure open-circuit voltage at disconnect."
  }
};

export function translateAlert(oem: string, rawCode: string, defaultTitle: string) {
  const oemLower = (oem || "").toLowerCase();

  if (oemLower === "feston" || oemLower === "solaros") {
    const match = matchFestonAlarm(rawCode, defaultTitle);
    if (match) {
      return {
        title: match.title || defaultTitle,
        description: match.description || `OEM code: ${rawCode}`,
        severity: match.severity || "medium",
        category: match.category || "inverter",
        recommended_action: match.recommended_action || "Check inverter status and refer to manual.",
        is_auto_resolvable: match.is_auto_resolvable ?? false,
        requires_technician: match.requires_technician ?? true
      };
    }
  }

  if (oemLower === "solis") {
    const rule = SOLIS_ALARM_MAPPING[rawCode];
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
  }

  if (oemLower === "suryalogix" || oemLower === "suryalog") {
    const rule = SURYALOGIX_ALARM_MAPPING[rawCode];
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
  }

  if (oemLower === "sungrow" || oemLower === "isolarcloud") {
    const cleanCode = rawCode.startsWith("FAULT_") ? rawCode : `FAULT_${rawCode}`;
    const rule = SUNGROW_ALARM_MAPPING[cleanCode] || SUNGROW_ALARM_MAPPING[rawCode];
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
  }

  return {
    title: defaultTitle,
    description: `OEM code: ${rawCode}`,
    severity: "medium" as const,
    category: "inverter" as const,
    recommended_action: "Check inverter operational status and refer to manual.",
    is_auto_resolvable: false,
    requires_technician: true
  };
}
