from typing import Dict, Any

from .solis import SOLIS_ALARM_MAPPING
from .feston import match_feston_alarm, FESTON_ALARM_MAPPING
from .suryalogix import SURYALOGIX_ALARM_MAPPING
from .sungrow import SUNGROW_ALARM_MAPPING

def translate_alert(oem: str, raw_code: str, default_title: str) -> dict:
    """Translates raw OEM alarm codes into normalized, human-readable alerts."""
    oem_lower = oem.lower() if oem else ""
    
    rule = None
    if oem_lower == "solis":
        rule = SOLIS_ALARM_MAPPING.get(raw_code)
    elif oem_lower in ("feston", "solaros"):
        rule = match_feston_alarm(raw_code, default_title)
    elif oem_lower in ("suryalogix", "suryalog"):
        rule = SURYALOGIX_ALARM_MAPPING.get(raw_code)
    elif oem_lower in ("sungrow", "isolarcloud"):
        clean_code = raw_code if raw_code.startswith("FAULT_") else f"FAULT_{raw_code}"
        rule = SUNGROW_ALARM_MAPPING.get(clean_code) or SUNGROW_ALARM_MAPPING.get(raw_code)
        
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
