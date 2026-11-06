export class EdgeDistributedLock {
  private supabaseUrl: string;
  private supabaseKey: string;
  private lockId: string;
  private leaseSeconds: number;
  private heartbeatIntervalMs: number;
  private maxHeartbeatFailures: number;
  public ownerToken: string;
  public acquired: boolean = false;

  private lostLock: boolean = false;
  private heartbeatTimer: number | null = null;
  private consecutiveFailures: number = 0;
  private lastHeartbeatTime: number = 0;

  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    lockId: string = "00000000-0000-0000-0000-000000000001",
    leaseSeconds: number = 120,
    heartbeatIntervalMs: number = 15000,
    maxHeartbeatFailures: number = 2
  ) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
    this.lockId = lockId;
    this.leaseSeconds = leaseSeconds;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.maxHeartbeatFailures = maxHeartbeatFailures;
    const randomHex = Math.random().toString(16).substring(2, 10);
    this.ownerToken = `edge_${Date.now()}_${randomHex}`;
  }

  private getHeaders(returnRep: boolean = true): Record<string, string> {
    const h: Record<string, string> = {
      "apikey": this.supabaseKey,
      "Authorization": `Bearer ${this.supabaseKey}`,
      "Content-Type": "application/json"
    };
    if (returnRep) {
      h["Prefer"] = "return=representation";
    }
    return h;
  }

  async verifyLockRowExists(): Promise<boolean> {
    try {
      const url = `${this.supabaseUrl}/rest/v1/sync_runs?id=eq.${this.lockId}`;
      const res = await fetch(url, {
        headers: this.getHeaders(false),
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return true;
        }
      }
      console.error(
        `CRITICAL: Singleton distributed lock row (${this.lockId}) not found in sync_runs table! ` +
        `Lock acquisition failed closed to prevent unsynchronized concurrent execution.`
      );
      return false;
    } catch (err: any) {
      console.error(`Failed to verify singleton lock row (${this.lockId}): ${err.message}`);
      return false;
    }
  }

  isOwner(): boolean {
    if (!this.acquired || this.lostLock) {
      return false;
    }
    if ((Date.now() - this.lastHeartbeatTime) > this.leaseSeconds * 1000) {
      console.error(
        `Fencing violation: Lease duration (${this.leaseSeconds}s) exceeded without renewal.`
      );
      this.lostLock = true;
      return false;
    }
    return true;
  }

  assertActiveOwner(): void {
    if (!this.isOwner()) {
      throw new Error(
        `Fencing violation: Distributed lock lease expired or ownership lost for ${this.ownerToken}. ` +
        `Aborting ingestion immediately to prevent split-brain writes.`
      );
    }
  }

  async acquire(): Promise<boolean> {
    const exists = await this.verifyLockRowExists();
    if (!exists) {
      return false;
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const staleCutoff = new Date(now.getTime() - this.leaseSeconds * 1000).toISOString();

    const patchUrl = `${this.supabaseUrl}/rest/v1/sync_runs?id=eq.${this.lockId}&or=(status.eq.idle,completed_at.lt.${staleCutoff})`;
    const body = JSON.stringify({
      status: "running",
      error_message: this.ownerToken,
      completed_at: nowIso
    });

    try {
      const res = await fetch(patchUrl, {
        method: "PATCH",
        headers: this.getHeaders(true),
        body,
        signal: AbortSignal.timeout(15000)
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length === 1) {
          this.acquired = true;
          this.lostLock = false;
          this.consecutiveFailures = 0;
          this.lastHeartbeatTime = Date.now();
          this.startHeartbeat();
          console.log(`Acquired distributed lock (Token: ${this.ownerToken})`);
          return true;
        }
      }

      // Lock was not acquired; log who holds it
      const checkRes = await fetch(`${this.supabaseUrl}/rest/v1/sync_runs?id=eq.${this.lockId}`, {
        headers: this.getHeaders(false),
        signal: AbortSignal.timeout(10000)
      });
      if (checkRes.ok) {
        const rows = await checkRes.json();
        if (Array.isArray(rows) && rows.length > 0) {
          console.warn(
            `Distributed lock held by active worker [${rows[0].error_message}]. ` +
            `Last heartbeat: ${rows[0].completed_at}. Skipping run.`
          );
        }
      }
      return false;
    } catch (err: any) {
      console.error(`Distributed lock acquisition error: ${err.message}`);
      return false;
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(async () => {
      if (this.lostLock || !this.acquired) {
        if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
        return;
      }

      try {
        const nowIso = new Date().toISOString();
        const patchUrl = `${this.supabaseUrl}/rest/v1/sync_runs?id=eq.${this.lockId}&error_message=eq.${this.ownerToken}`;
        const res = await fetch(patchUrl, {
          method: "PATCH",
          headers: this.getHeaders(true),
          body: JSON.stringify({ completed_at: nowIso }),
          signal: AbortSignal.timeout(10000)
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length === 1) {
            this.consecutiveFailures = 0;
            this.lastHeartbeatTime = Date.now();
            return;
          } else {
            console.error(
              `Distributed lock ownership stolen! Lock row was updated by another worker. ` +
              `Aborting lock lease for token ${this.ownerToken}.`
            );
            this.lostLock = true;
            this.acquired = false;
            if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
            return;
          }
        } else {
          this.consecutiveFailures++;
        }
      } catch (err: any) {
        this.consecutiveFailures++;
        console.warn(`Heartbeat renewal failure (${this.consecutiveFailures}/${this.maxHeartbeatFailures}): ${err.message}`);
      }

      if (this.consecutiveFailures >= this.maxHeartbeatFailures) {
        console.error(
          `Heartbeat failed ${this.consecutiveFailures} consecutive times. Flagging lock as lost.`
        );
        this.lostLock = true;
        this.acquired = false;
        if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
      }
    }, this.heartbeatIntervalMs) as unknown as number;
  }

  async release(): Promise<void> {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (!this.acquired) {
      return;
    }

    const nowIso = new Date().toISOString();
    const patchUrl = `${this.supabaseUrl}/rest/v1/sync_runs?id=eq.${this.lockId}&error_message=eq.${this.ownerToken}`;
    try {
      await fetch(patchUrl, {
        method: "PATCH",
        headers: this.getHeaders(false),
        body: JSON.stringify({ status: "idle", completed_at: nowIso }),
        signal: AbortSignal.timeout(10000)
      });
      console.log(`Released distributed lock (Token: ${this.ownerToken})`);
    } catch (err: any) {
      console.error(`Error releasing distributed lock: ${err.message}`);
    } finally {
      this.acquired = false;
    }
  }
}
