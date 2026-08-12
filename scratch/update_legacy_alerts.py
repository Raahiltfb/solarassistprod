import os
import sys

sys.path.append(os.path.join(os.getcwd(), "backend"))

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv("backend/.env")

from sync_service import supabase_get, supabase_patch
from alarm_mappings.base import translate_alert

def main():
    alerts = supabase_get("alerts")
    print(f"Total alerts in DB: {len(alerts)}")
    
    updated_count = 0
    for a in alerts:
        oem = a.get("oem") or "solis"
        code = a.get("alarm_code") or a.get("code")
        title = a.get("title")
        
        translated = translate_alert(oem, code, title)
        
        patch_payload = {
            "oem": oem,
            "alarm_code": code,
            "category": translated["category"],
            "recommended_action": translated["recommended_action"],
            "is_auto_resolvable": translated["is_auto_resolvable"],
            "requires_technician": translated["requires_technician"]
        }
        
        supabase_patch("alerts", patch_payload, params={"id": f"eq.{a['id']}"})
        updated_count += 1
        
    print(f"Successfully updated {updated_count} alert(s) with complete translated metadata!")

if __name__ == "__main__":
    main()
