import sys
import os
import json

sys.path.append("backend")

from alarm_mappings.solis import SOLIS_ALARM_MAPPING, load_solis_registry

print("=== RUNNING PHASE 3B ALARM INTELLIGENCE & PARITY TESTS ===")

# 1. Test Single Source of Truth
print("\n[TEST 1] Testing Canonical Shared JSON Registry Loading...")
registry_data = load_solis_registry()

assert len(registry_data) > 0, "JSON Registry is empty!"
print(f"Loaded {len(registry_data)} canonical alarm definitions from shared/alarm_registry/solis.json")

# 2. Test Solis Mapping Completeness & Parity
print("\n[TEST 2] Verifying Mapping Enrichment & Structural Integrity...")
expected_codes = ["1045", "F012", "1021", "F045", "1011", "F016", "1012", "F015", "1015", "1016", "CLEANING_OVERDUE"]

for code in expected_codes:
    assert code in SOLIS_ALARM_MAPPING, f"Missing code {code} in SOLIS_ALARM_MAPPING!"
    item = SOLIS_ALARM_MAPPING[code]
    print(f"Code {code:16} | Title: {item['title']:35} | Sev: {item['severity']:8} | Guidance Steps: {len(item['general_field_guidance'])}")
    assert "oem_definition" in item, f"Missing oem_definition for {code}"
    assert "potential_causes" in item, f"Missing potential_causes for {code}"
    assert "general_field_guidance" in item, f"Missing general_field_guidance for {code}"
    assert len(item["general_field_guidance"]) > 0, f"Empty guidance for {code}"

print("\n=== PHASE 3B ALARM INTELLIGENCE TESTS PASSED 100% CLEANLY ===")
