import os
import sys
import time
import requests
from dotenv import load_dotenv

sys.path.append(os.path.join(os.getcwd(), "backend"))

load_dotenv(".env")
load_dotenv("backend/.env")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "https://ylnmjvgnjootrkywbcsj.supabase.co"
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

def benchmark_query(name: str, method: str, path: str, payload: dict = None):
    t0 = time.perf_counter()
    url = f"{SUPABASE_URL}{path}"
    if method == "GET":
        res = requests.get(url, headers=headers)
    else:
        res = requests.post(url, headers=headers, json=payload)
    latency_ms = (time.perf_counter() - t0) * 1000
    print(f"[{name}] -> Status: {res.status_code} | Latency: {latency_ms:.2f} ms")
    return latency_ms

def run_benchmarks():
    print("=== CORE SOLARASSIST PAGES DATABASE QUERY BENCHMARKS ===")
    
    # 1. Dashboard Page Queries
    print("\n--- [Dashboard Page Queries] ---")
    benchmark_query("Sites select", "GET", "/rest/v1/sites?select=id,name,location,capacity_kwp,status,last_cleaned_on,cleaning_cycle_days")
    benchmark_query("Inverters select", "GET", "/rest/v1/inverters?select=id,status,site_id,capacity_kw")
    benchmark_query("Open alerts count", "GET", "/rest/v1/alerts?select=id&status=eq.open")
    benchmark_query("Open tickets count", "GET", "/rest/v1/tickets?select=id&status=in.(open,in_progress,on_hold)")
    benchmark_query("Recent alerts select", "GET", "/rest/v1/alerts?select=id,title,severity,status,triggered_at,site_id&order=triggered_at.desc&limit=6")
    
    # RPC get_latest_telemetry
    sample_inverter_ids = ["f948d190-0053-4cfe-a7b5-a842acc78004", "e5ba6438-2495-41c8-a048-9e2266038c75"]
    benchmark_query("RPC get_latest_telemetry", "POST", "/rest/v1/rpc/get_latest_telemetry", {"inverter_ids": sample_inverter_ids})
    
    # 2. Sites Page Queries
    print("\n--- [Sites Page Queries] ---")
    benchmark_query("Sites list select", "GET", "/rest/v1/sites?select=*&order=name.asc")
    benchmark_query("Inverters list select", "GET", "/rest/v1/inverters?select=id,status,site_id,capacity_kw")
    benchmark_query("Active alerts count per site", "GET", "/rest/v1/alerts?select=id,site_id&status=eq.open")
    
    # 3. Alerts Page Queries
    print("\n--- [Alerts Page Queries] ---")
    benchmark_query("Alerts list with joins", "GET", "/rest/v1/alerts?select=*,sites(name),inverters(serial_number,model)&order=triggered_at.desc&limit=200")
    
    # 4. Tickets Page Queries
    print("\n--- [Tickets Page Queries] ---")
    benchmark_query("Tickets list with joins", "GET", "/rest/v1/tickets?select=*,sites(name)&order=created_at.desc")
    
    # 5. Inverter Page Queries
    print("\n--- [Inverter Details Page Queries] ---")
    sample_inv_id = "f948d190-0053-4cfe-a7b5-a842acc78004"
    benchmark_query("Inverter select with site details", "GET", f"/rest/v1/inverters?select=*,sites(*)&id=eq.{sample_inv_id}")
    benchmark_query("Telemetry history select", "GET", f"/rest/v1/telemetry?select=*&inverter_id=eq.{sample_inv_id}&order=timestamp.desc&limit=300")
    benchmark_query("Strings details select", "GET", f"/rest/v1/strings?select=*&inverter_id=eq.{sample_inv_id}&order=string_index.asc")
    
    print("\n=== BENCHMARKS COMPLETED successfully! ===")

if __name__ == "__main__":
    run_benchmarks()
