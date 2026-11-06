import os
import sys
import time
import uuid
import logging
import threading
from datetime import datetime, timezone, timedelta
import requests

logger = logging.getLogger("distributed_lock")

class DistributedLock:
    """
    Concurrency-safe distributed mutex lock backed by atomic PostgreSQL row-level updates
    via Supabase REST API on public.sync_runs. Zero schema migrations required.
    
    Guarantees:
    1. Atomic Compare-And-Swap (CAS): PostgreSQL row write-locks serialize concurrent attempts.
    2. Active Heartbeat: Active workers continuously extend their lease; long runs are NEVER stolen.
    3. Fencing / Lease Safety: Workers check active lease ownership before every critical write.
       If lease expires or is stolen, worker immediately halts to prevent split-brain writes.
    4. Heartbeat Interruption Handling: Network degradation flags lock as lost and triggers abort.
    5. Fail-Closed on Missing Lock Row: If the singleton record is not provisioned, lock acquisition fails closed.
    6. Strict Ownership: A worker can only renew or release a lock it currently owns.
    """
    
    def __init__(
        self, 
        supabase_url: str, 
        supabase_key: str, 
        lock_id: str = "00000000-0000-0000-0000-000000000001",
        lease_seconds: int = 90,
        heartbeat_interval: int = 15,
        max_heartbeat_failures: int = 2
    ):
        self.supabase_url = supabase_url
        self.supabase_key = supabase_key
        self.lock_id = lock_id
        self.lease_seconds = lease_seconds
        self.heartbeat_interval = heartbeat_interval
        self.max_heartbeat_failures = max_heartbeat_failures
        self.owner_token = f"worker_{os.getpid()}_{uuid.uuid4().hex[:8]}"
        self.acquired = False
        
        self._stop_heartbeat = threading.Event()
        self._lost_lock = threading.Event()
        self._heartbeat_thread = None
        self._consecutive_heartbeat_failures = 0
        self._last_successful_heartbeat = 0.0

    def _get_headers(self, return_rep: bool = True):
        h = {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
            "Content-Type": "application/json"
        }
        if return_rep:
            h["Prefer"] = "return=representation"
        return h

    def verify_lock_row_exists(self) -> bool:
        """
        Verifies that the designated singleton lock row exists in public.sync_runs.
        FAILS CLOSED if the record is missing to ensure zero uncoordinated runs.
        """
        try:
            url = f"{self.supabase_url}/rest/v1/sync_runs"
            check_res = requests.get(
                f"{url}?id=eq.{self.lock_id}", 
                headers=self._get_headers(return_rep=False),
                timeout=10
            )
            if check_res.status_code == 200:
                data = check_res.json()
                if len(data) > 0:
                    return True
            logger.error(
                f"CRITICAL: Singleton distributed lock row ({self.lock_id}) not found in sync_runs table! "
                "Lock acquisition failed closed to prevent unsynchronized concurrent execution."
            )
            return False
        except Exception as e:
            logger.error(f"Failed to query singleton lock row ({self.lock_id}): {e}")
            return False

    def is_active_owner(self) -> bool:
        """
        Verifies if this worker is the current, active, valid owner of the lease.
        Fails if lock was lost, lease expired, or heartbeat suffered persistent failures.
        """
        if not self.acquired:
            return False
        if self._lost_lock.is_set():
            return False
        # Lease expiry check: if more than lease_seconds elapsed since last renewal
        if (time.time() - self._last_successful_heartbeat) > self.lease_seconds:
            logger.critical(
                f"Fencing violation: Lease duration ({self.lease_seconds}s) exceeded without successful renewal. "
                f"Elapsed: {time.time() - self._last_successful_heartbeat:.1f}s."
            )
            self._lost_lock.set()
            return False
        return True

    def assert_active_owner(self):
        """
        Raises RuntimeError if this worker no longer holds a valid lease.
        Must be called prior to critical database operations (upserts, telemetry writes).
        """
        if not self.is_active_owner():
            raise RuntimeError(
                f"Fencing violation: Distributed lock lease expired or ownership lost for {self.owner_token}. "
                "Aborting ingestion immediately to prevent split-brain writes."
            )

    def acquire(self) -> bool:
        """
        Atomically acquires the distributed lock using Compare-And-Swap.
        Fails closed if the singleton record is missing or held by another active worker.
        """
        if not self.verify_lock_row_exists():
            return False
        
        now = datetime.now(timezone.utc)
        now_iso = now.strftime('%Y-%m-%dT%H:%M:%SZ')
        stale_cutoff = (now - timedelta(seconds=self.lease_seconds)).strftime('%Y-%m-%dT%H:%M:%SZ')
        
        # Atomic CAS: row matches id AND (status == 'idle' OR completed_at < stale_cutoff)
        patch_url = f"{self.supabase_url}/rest/v1/sync_runs?id=eq.{self.lock_id}&or=(status.eq.idle,completed_at.lt.{stale_cutoff})"
        body = {
            "status": "running",
            "error_message": self.owner_token,
            "completed_at": now_iso
        }
        
        try:
            res = requests.patch(patch_url, headers=self._get_headers(return_rep=True), json=body, timeout=15)
            if res.status_code in (200, 204):
                data = res.json() if res.content else []
                if len(data) == 1:
                    self.acquired = True
                    self._lost_lock.clear()
                    self._consecutive_heartbeat_failures = 0
                    self._last_successful_heartbeat = time.time()
                    self._start_heartbeat()
                    logger.info(f"Acquired distributed lock (Token: {self.owner_token})")
                    return True
            
            # Lock was not acquired; inspect current owner for logging
            check = requests.get(
                f"{self.supabase_url}/rest/v1/sync_runs?id=eq.{self.lock_id}", 
                headers=self._get_headers(return_rep=False),
                timeout=10
            )
            if check.status_code == 200 and check.json():
                row = check.json()[0]
                logger.warning(
                    f"Distributed lock held by active worker [{row.get('error_message')}]. "
                    f"Last heartbeat: {row.get('completed_at')}. Skipping run."
                )
            return False
            
        except Exception as e:
            logger.error(f"Distributed lock acquisition error: {e}")
            return False

    def _start_heartbeat(self):
        """Starts background heartbeat thread to advance completed_at while active."""
        self._stop_heartbeat.clear()
        
        def heartbeat_loop():
            while not self._stop_heartbeat.wait(self.heartbeat_interval):
                if self._lost_lock.is_set():
                    break
                    
                try:
                    now_iso = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
                    patch_url = f"{self.supabase_url}/rest/v1/sync_runs?id=eq.{self.lock_id}&error_message=eq.{self.owner_token}"
                    res = requests.patch(
                        patch_url,
                        headers=self._get_headers(return_rep=True),
                        json={"completed_at": now_iso},
                        timeout=10
                    )
                    if res.status_code in (200, 204):
                        data = res.json() if res.content else []
                        if len(data) == 1:
                            # Successful lease renewal
                            self._consecutive_heartbeat_failures = 0
                            self._last_successful_heartbeat = time.time()
                            logger.debug(f"Heartbeat renewed lease (Token: {self.owner_token})")
                            continue
                        else:
                            # Row updated count is 0: ownership was stolen / overwritten by another worker!
                            logger.critical(
                                f"Distributed lock ownership stolen! Lock row was updated by another worker. "
                                f"Aborting lock lease for token {self.owner_token}."
                            )
                            self._lost_lock.set()
                            self.acquired = False
                            break
                    else:
                        raise RuntimeError(f"HTTP {res.status_code}: {res.text}")
                        
                except Exception as hb_err:
                    self._consecutive_heartbeat_failures += 1
                    logger.warning(
                        f"Heartbeat failure ({self._consecutive_heartbeat_failures}/{self.max_heartbeat_failures}): {hb_err}"
                    )
                    if self._consecutive_heartbeat_failures >= self.max_heartbeat_failures:
                        logger.critical(
                            f"Distributed lock heartbeat failed {self._consecutive_heartbeat_failures} consecutive times. "
                            "Flagging lock as lost to protect database integrity."
                        )
                        self._lost_lock.set()
                        self.acquired = False
                        break
                    
        self._heartbeat_thread = threading.Thread(target=heartbeat_loop, daemon=True)
        self._heartbeat_thread.start()

    def release(self):
        """Releases the distributed lock atomically, verifying ownership."""
        if not self.acquired and not self._lost_lock.is_set():
            return
            
        self._stop_heartbeat.set()
        if self._heartbeat_thread and self._heartbeat_thread.is_alive():
            self._heartbeat_thread.join(timeout=2.0)
            
        if self._lost_lock.is_set():
            logger.warning("Lock was lost or stolen during execution. Skipping release update.")
            self.acquired = False
            return
            
        try:
            now_iso = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
            patch_url = f"{self.supabase_url}/rest/v1/sync_runs?id=eq.{self.lock_id}&error_message=eq.{self.owner_token}"
            res = requests.patch(
                patch_url,
                headers=self._get_headers(return_rep=True),
                json={
                    "status": "idle",
                    "error_message": "released",
                    "completed_at": now_iso
                },
                timeout=10
            )
            if res.status_code in (200, 204) and len(res.json() if res.content else []) == 1:
                logger.info(f"Released distributed lock cleanly (Token: {self.owner_token})")
            else:
                logger.warning("Lock release update matched 0 rows (lease was stolen or already expired).")
        except Exception as e:
            logger.error(f"Error releasing distributed lock: {e}")
        finally:
            self.acquired = False

    def __enter__(self):
        self.acquire()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()
