import json
import os

REGISTRY_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "shared", "alarm_registry", "solis.json")

def load_solis_registry():
    abs_path = os.path.abspath(REGISTRY_PATH)
    if not os.path.exists(abs_path):
        raise FileNotFoundError(f"Canonical Solis Alarm Registry file not found at: {abs_path}")
    with open(abs_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("mappings", {})

# Load canonical mappings
_RAW_MAPPINGS = load_solis_registry()

# Expose backward-compatible SOLIS_ALARM_MAPPING dictionary consumed by sync_service.py
SOLIS_ALARM_MAPPING = {}
for code, details in _RAW_MAPPINGS.items():
    ops = details.get("operational_interpretation", {})
    SOLIS_ALARM_MAPPING[code] = {
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
