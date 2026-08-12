from typing import Dict, Any

from .solis import SOLIS_ALARM_MAPPING

def translate_alert(oem: str, raw_code: str, default_title: str) -> dict:
    """Translates raw OEM alarm codes into normalized, human-readable alerts."""
    oem_lower = oem.lower() if oem else ""
    mapping = {}
    
    if oem_lower == "solis":
        mapping = SOLIS_ALARM_MAPPING
        
    rule = mapping.get(raw_code)
    if rule:
        return {
            "title": rule.get("title", default_title),
            "description": rule.get("description") or f"OEM code: {raw_code}",
            "severity": rule.get("severity", "medium"),
            "category": rule.get("category", "inverter"),
            "recommended_action": rule.get("recommended_action", "Check inverter status and consult manual."),
            "is_auto_resolvable": rule.get("is_auto_resolvable", False),
            "requires_technician": rule.get("requires_technician", True)
        }
        
    return {
        "title": default_title,
        "description": f"OEM code: {raw_code}",
        "severity": "medium",
        "category": "inverter",
        "recommended_action": "Check inverter operational status and refer to manual.",
        "is_auto_resolvable": False,
        "requires_technician": True
    }
