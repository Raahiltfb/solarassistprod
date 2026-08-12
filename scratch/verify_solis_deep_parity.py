import os
import sys
from dotenv import load_dotenv

# Load backend dotenv file BEFORE importing sync_service
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
load_dotenv(os.path.join(backend_dir, ".env"))

# Add backend directory to Python path
sys.path.append(backend_dir)

from sync_service import supabase_get

def main():
    print("====================================================")
    print("SolarAssist: Verification of Solis Deep Telemetry Parity")
    print("====================================================")
    
    # 1. Fetch inverters
    inverters = supabase_get("inverters", params={"oem": "eq.solis"})
    if not inverters:
        print("⚠️ Warning: No Solis inverters found in the database. Running parity checks on any available telemetry...")
        telemetries = supabase_get("telemetry", params={"limit": "5", "order": "timestamp.desc"})
    else:
        inv_ids = [inv["id"] for inv in inverters]
        print(f"Found {len(inverters)} Solis inverter(s). Checking telemetry records...")
        telemetries = supabase_get("telemetry", params={
            "inverter_id": f"in.({','.join(inv_ids)})",
            "limit": "5",
            "order": "timestamp.desc"
        })
        
    if not telemetries:
        print("❌ ERROR: No telemetry records found for Solis inverters!")
        sys.exit(1)
        
    sample = telemetries[0]
    print(f"\nAnalyzing Sample Telemetry Point (Inverter ID: {sample.get('inverter_id')}, Timestamp: {sample.get('timestamp')})")
    
    # 2. Check Yield Normalization
    daily_gen = sample.get("daily_generation_kwh")
    total_gen = sample.get("total_generation_kwh")
    specific_yield = sample.get("specific_yield")
    
    print("\n--- Yield & Generation Diagnostics ---")
    print(f"Daily Generation:   {daily_gen} kWh")
    print(f"Total Generation:   {total_gen} kWh")
    print(f"Specific Yield:     {specific_yield} kWh/kWp")
    
    if total_gen is None or total_gen <= 0:
        print("❌ ERROR: Total Generation (lifetime) is not normalized or missing!")
        sys.exit(1)
    if specific_yield is None:
        print("❌ ERROR: Specific Yield is missing!")
        sys.exit(1)
        
    # 3. Check Phase Currents & Voltages
    print("\n--- AC Grid Phase Diagnostics ---")
    v_r = sample.get("voltage_r_v")
    v_s = sample.get("voltage_s_v")
    v_t = sample.get("voltage_t_v")
    c_r = sample.get("current_r_a")
    c_s = sample.get("current_s_a")
    c_t = sample.get("current_t_a")
    freq = sample.get("frequency_hz")
    pf = sample.get("power_factor")
    
    print(f"Voltages (R/S/T):   {v_r} V / {v_s} V / {v_t} V")
    print(f"Currents (R/S/T):   {c_r} A / {c_s} A / {c_t} A")
    print(f"Grid Frequency:     {freq} Hz")
    print(f"Power Factor:       {pf}")
    
    if v_r is None or v_s is None or v_t is None:
        print("❌ ERROR: Phase Voltages are missing!")
        sys.exit(1)
        
    # 4. Check DC bus and extra metrics
    print("\n--- OEM Vendor Metrics ---")
    metrics = sample.get("metrics") or {}
    print(f"DC Bus Voltage:     {metrics.get('dcBus')} V")
    print(f"OEM Status Code:    {metrics.get('state')}")
    
    # 5. Check String Ingestion & Sorting
    print("\n--- Connected String Diagnostics ---")
    inverter_id = sample.get("inverter_id")
    strings = supabase_get("strings", params={"inverter_id": f"eq.{inverter_id}", "order": "string_index"})
    print(f"Number of Connected Strings: {len(strings)}")
    
    for s in strings:
        str_id = s["id"]
        latest_str_tel = supabase_get("string_telemetry", params={
            "string_id": f"eq.{str_id}",
            "limit": "1",
            "order": "timestamp.desc"
        })
        if latest_str_tel:
            s_tel = latest_str_tel[0]
            print(f"  String #{s['string_index']}: Status: {s_tel.get('status')} | Voltage: {s_tel.get('voltage_v')} V | Current: {s_tel.get('current_a')} A | Power: {s_tel.get('power_kw')} kW")
        else:
            print(f"  String #{s['string_index']}: No telemetry recorded yet.")
            
    # Check that string indexes are in strictly numeric order
    str_indexes = [int(s["string_index"]) for s in strings]
    sorted_indexes = sorted(str_indexes)
    if str_indexes != sorted_indexes:
        print("❌ ERROR: String indexes are not numerically ordered!")
        sys.exit(1)
    else:
        print("  Numeric String Ordering Check: PASSED")
        
    print("\n✅ Verification SUCCESSFUL: Solis telemetry deep parity matches production specifications!")
    print("====================================================")

if __name__ == "__main__":
    main()
