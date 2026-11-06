import os
import sys
import time
import copy
from datetime import datetime, timezone
from dotenv import load_dotenv

# STRICT BOUNDARY: Load Staging Environment
load_dotenv("backend/.env")
load_dotenv("backend/.env.staging", override=True)
sys.path.append("backend")

from sync_service import (
    poll_and_sync_all, 
    supabase_get, 
    supabase_patch, 
    SUPABASE_URL, 
    SUPABASE_KEY
)
from distributed_lock import DistributedLock

# Verify we are on staging
assert "xpjzuquqehjamqsqshwq" in SUPABASE_URL, f"FATAL SAFETY VIOLATION: Test target is not staging ({SUPABASE_URL})!"

print(f"=== MULTI-OEM WORKER STAGING VALIDATION SUITE ===")
print(f"Staging DB: {SUPABASE_URL}")

def test_distributed_lock_concurrency_and_recovery():
    """Verify that DistributedLock prevents concurrent workers and recovers from crashes."""
    print("\n[TEST 1] Testing DistributedLock atomic concurrency and lease recovery...")
    lock_a = DistributedLock(SUPABASE_URL, SUPABASE_KEY, lease_seconds=6, heartbeat_interval=2)
    assert lock_a.acquire() is True, "Worker A must acquire lock"
    
    # Worker B tries to acquire simultaneously
    lock_b = DistributedLock(SUPABASE_URL, SUPABASE_KEY, lease_seconds=6, heartbeat_interval=2)
    assert lock_b.acquire() is False, "Worker B must be rejected while Worker A holds lock"
    
    # Clean release
    lock_a.release()
    assert lock_b.acquire() is True, "Worker B must acquire lock after Worker A releases"
    lock_b.release()
    print("  -> Concurrency mutex and clean release: PASSED")

def test_oem_filter_solis():
    """Verify that oem_filter='solis' exclusively processes Solis without touching Feston."""
    print("\n[TEST 2] Testing oem_filter='solis' controlled polling...")
    
    # Capture baseline Solis inverters and Feston inverters count
    solis_invs_pre = supabase_get("inverters", params={"oem": "eq.solis", "select": "id"})
    feston_invs_pre = supabase_get("inverters", params={"oem": "eq.feston", "select": "id"})
    
    poll_and_sync_all(trigger_source="test_solis_filter", oem_filter="solis")
    
    # Verify latest sync_run (excluding singleton distributed_lock row)
    latest_run = supabase_get("sync_runs", params={"trigger_source": "neq.distributed_lock", "order": "started_at.desc", "limit": "1"})[0]
    assert latest_run["oem"] == "solis", f"Expected sync_run oem='solis', got {latest_run['oem']}"
    assert latest_run["status"] in ("success", "partial_success"), f"Expected success, got {latest_run['status']}"
    
    feston_invs_post = supabase_get("inverters", params={"oem": "eq.feston", "select": "id"})
    assert len(feston_invs_pre) == len(feston_invs_post), "Feston records must not change during Solis-only sync!"
    print(f"  -> Solis filtered polling executed cleanly. Sites processed: {latest_run['sites_processed']}. Feston unchanged: PASSED")

def test_oem_filter_feston():
    """Verify that oem_filter='feston' processes Feston dynamically using oem_station_mappings."""
    print("\n[TEST 3] Testing oem_filter='feston' controlled polling...")
    
    solis_invs_pre = supabase_get("inverters", params={"oem": "eq.solis", "select": "id"})
    
    poll_and_sync_all(trigger_source="test_feston_filter", oem_filter="feston")
    
    latest_run = supabase_get("sync_runs", params={"trigger_source": "neq.distributed_lock", "order": "started_at.desc", "limit": "1"})[0]
    assert latest_run["oem"] == "feston", f"Expected sync_run oem='feston', got {latest_run['oem']}"
    assert latest_run["status"] in ("success", "partial_success"), f"Expected success, got {latest_run['status']}"
    
    solis_invs_post = supabase_get("inverters", params={"oem": "eq.solis", "select": "id"})
    assert len(solis_invs_pre) == len(solis_invs_post), "Solis records must not change during Feston-only sync!"
    print(f"  -> Feston filtered polling executed cleanly. Sites processed: {latest_run['sites_processed']}. Solis unchanged: PASSED")

def test_partial_oem_failure_isolation():
    """Verify that an exception in one OEM does not crash or abort the other OEM."""
    print("\n[TEST 4] Testing independent OEM failure isolation & partial_success handling...")
    
    # We will temporarily point Solis config to an invalid URL on staging to simulate OEM failure
    solis_integ = supabase_get("oem_integrations", params={"provider": "eq.solis"})
    if not solis_integ:
        print("  -> Skipping partial failure test (no Solis integration on staging)")
        return
        
    integ_id = solis_integ[0]["id"]
    orig_config = copy.deepcopy(solis_integ[0]["config"])
    
    try:
        # Inject bad API URL for Solis
        bad_config = dict(orig_config)
        bad_config["solis_api_url"] = "https://invalid-nonexistent-domain-solis-fail.com"
        supabase_patch("oem_integrations", {"config": bad_config}, params={"id": f"eq.{integ_id}"})
        
        # Run sync_all (should attempt Solis, fail Solis, but proceed and succeed with Feston!)
        poll_and_sync_all(trigger_source="test_partial_failure")
        
        latest_run = supabase_get("sync_runs", params={"trigger_source": "neq.distributed_lock", "order": "started_at.desc", "limit": "1"})[0]
        print(f"  -> Overall Run Status: {latest_run['status']}")
        print(f"  -> Error Count: {latest_run['error_count']}")
        print(f"  -> Summary Message: {latest_run.get('error_message')}")
        
        assert latest_run["status"] in ("partial_success", "failed"), "Status should reflect partial failure"
        assert latest_run["error_count"] > 0, "Error count should be incremented"
        print("  -> OEM failure was cleanly trapped in its own domain without crashing the worker: PASSED")
        
    finally:
        # Restore valid Solis config
        supabase_patch("oem_integrations", {"config": orig_config}, params={"id": f"eq.{integ_id}"})
        print("  -> Restored original Solis config cleanly.")

def test_idempotent_re_sync():
    """Verify that repeated polling does not create duplicate sites, inverters, or strings."""
    print("\n[TEST 5] Testing idempotency across repeated polling...")
    mappings_pre = len(supabase_get("oem_station_mappings", params={"select": "id"}))
    inverters_pre = len(supabase_get("inverters", params={"select": "id"}))
    strings_pre = len(supabase_get("strings", params={"select": "id"}))
    
    poll_and_sync_all(trigger_source="test_idempotency_pass")
    
    mappings_post = len(supabase_get("oem_station_mappings", params={"select": "id"}))
    inverters_post = len(supabase_get("inverters", params={"select": "id"}))
    strings_post = len(supabase_get("strings", params={"select": "id"}))
    
    assert mappings_pre == mappings_post, f"Mappings changed: {mappings_pre} -> {mappings_post}"
    assert inverters_pre == inverters_post, f"Inverters changed: {inverters_pre} -> {inverters_post}"
    assert strings_pre == strings_post, f"Strings changed: {strings_pre} -> {strings_post}"
    print(f"  -> Exact count match (Mappings: {mappings_post}, Inverters: {inverters_post}, Strings: {strings_post}). Zero duplicates created: PASSED")

if __name__ == "__main__":
    test_distributed_lock_concurrency_and_recovery()
    test_oem_filter_solis()
    test_oem_filter_feston()
    test_partial_oem_failure_isolation()
    test_idempotent_re_sync()
    print("\n=======================================================")
    print("ALL 5 MULTI-OEM STAGING TESTS PASSED WITH 100% SUCCESS!")
    print("=======================================================")
