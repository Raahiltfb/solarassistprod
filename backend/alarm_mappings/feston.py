import json
import os
import re

REGISTRY_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "shared", "alarm_registry", "feston.json")

def load_feston_registry():
    abs_path = os.path.abspath(REGISTRY_PATH)
    if not os.path.exists(abs_path):
        raise FileNotFoundError(f"Canonical Feston Alarm Registry file not found at: {abs_path}")
    with open(abs_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("mappings", {})

# Load canonical mappings
_RAW_MAPPINGS = load_feston_registry()

# Expose FESTON_ALARM_MAPPING dictionary consumed by base translator and sync_service.py
FESTON_ALARM_MAPPING = {}
for code, details in _RAW_MAPPINGS.items():
    ops = details.get("operational_interpretation", {})
    entry = {
        "title": details.get("title"),
        "description": details.get("description"),
        "severity": ops.get("severity", "medium"),
        "category": ops.get("category", "inverter"),
        "is_auto_resolvable": ops.get("is_auto_resolvable", False),
        "requires_technician": ops.get("requires_technician", True),
        "recommended_action": details.get("recommended_action"),
        "oem_definition": details.get("oem_definition"),
        "potential_causes": details.get("potential_causes", []),
        "general_field_guidance": details.get("general_field_guidance", [])
    }
    # Index by primary code (e.g. F35)
    FESTON_ALARM_MAPPING[code] = entry
    # Also index by ERR code (e.g. ERR35)
    if code.startswith("F") and code[1:].isdigit():
        num = int(code[1:])
        FESTON_ALARM_MAPPING[f"ERR{num}"] = entry
        FESTON_ALARM_MAPPING[str(num)] = entry

# SolarOS protocol aliases (as defined in SolarOS API / Deye protocol specification)
PROTOCOL_ALIASES = {
    "ERR5": "F35",
    "2": "F35"
}
for alias, target_code in PROTOCOL_ALIASES.items():
    if target_code in FESTON_ALARM_MAPPING:
        FESTON_ALARM_MAPPING[alias] = FESTON_ALARM_MAPPING[target_code]

def match_feston_alarm(raw_code: str, title: str = "") -> dict:
    """Intelligently matches Feston/Deye alarm codes from code, protocol, or alert name."""
    if not raw_code and not title:
        return {}
        
    # 1. Exact match on raw_code
    if raw_code and raw_code in FESTON_ALARM_MAPPING:
        return FESTON_ALARM_MAPPING[raw_code]
        
    # 2. Extract Fxx or ERRxx from raw_code or title
    search_text = f"{raw_code or ''} {title or ''}"
    f_match = re.search(r'\b(F\d{1,2})\b', search_text, re.IGNORECASE)
    if f_match:
        f_code = f_match.group(1).upper()
        if f_code in FESTON_ALARM_MAPPING:
            return FESTON_ALARM_MAPPING[f_code]
            
    err_match = re.search(r'\b(ERR\d{1,2})\b', search_text, re.IGNORECASE)
    if err_match:
        err_code = err_match.group(1).upper()
        if err_code in FESTON_ALARM_MAPPING:
            return FESTON_ALARM_MAPPING[err_code]

    # 3. Keyword matching on common strings
    kw_mappings = [
        ("NoUtillity", "F35"),
        ("Grid_Loss", "F35"),
        ("Insulation", "F24"),
        ("GFCI", "F23"),
        ("Leakage", "F23"),
        ("OverTemp", "F64"),
        ("OverCurrent", "F18"),
        ("Arc", "F63"),
        ("CAN", "F29"),
        ("BMS", "F58"),
        ("BusUnbalance", "F26"),
        ("BusVoltage", "F56")
    ]
    for kw, target_code in kw_mappings:
        if kw.lower() in search_text.lower():
            if target_code in FESTON_ALARM_MAPPING:
                return FESTON_ALARM_MAPPING[target_code]
                
    return {}
