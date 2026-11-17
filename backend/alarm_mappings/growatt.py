import json
import os
import re

REGISTRY_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "shared", "alarm_registry", "growatt.json")

def load_growatt_registry():
    abs_path = os.path.abspath(REGISTRY_PATH)
    if not os.path.exists(abs_path):
        return {}
    with open(abs_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("mappings", {})

_RAW_MAPPINGS = load_growatt_registry()

GROWATT_ALARM_MAPPING = {}
for code, details in _RAW_MAPPINGS.items():
    ops = details.get("operational_interpretation", {})
    rule = {
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
    GROWATT_ALARM_MAPPING[code] = rule
    if code.startswith("ERROR_"):
        GROWATT_ALARM_MAPPING[code.replace("ERROR_", "")] = rule

ALIASES = {
    "107": "302",
    "203": "303",
    "202": "307",
    "112": "306",
    "113": "308",
    "408": "308",
    "124": "200",
    "104": "301",
    "126": "405",
    "109": "409",
    "114": "411",
    "116": "411",
    "404": "411",
    "414": "411",
    "204": "503",
    "99": "ERR_COMM_LOST",
    "OFFLINE": "ERR_COMM_LOST",
    "LOST": "ERR_COMM_LOST",
}
for alias, target in ALIASES.items():
    if target in GROWATT_ALARM_MAPPING and alias not in GROWATT_ALARM_MAPPING:
        GROWATT_ALARM_MAPPING[alias] = GROWATT_ALARM_MAPPING[target]

def match_growatt_alarm(raw_code: str, default_title: str = ""):
    if not raw_code:
        return None
    clean = str(raw_code).strip().upper()
    stripped = re.sub(r"^(ERROR_|FAULT_|WARN_|ALARM_|ERR_)", "", clean)
    return (
        GROWATT_ALARM_MAPPING.get(clean)
        or GROWATT_ALARM_MAPPING.get(stripped)
        or GROWATT_ALARM_MAPPING.get(f"ERROR_{stripped}")
    )

