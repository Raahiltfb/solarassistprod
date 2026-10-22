-- SolarAssist Phase 8: Scale & Production Hardening Indexes
-- Non-destructive additions to accelerate queries and protect against full-table scans
-- at 100, 500, and 1,000+ sites.

-- 1. String Telemetry Composite Index (Crucial for Technical Intelligence string overlay & anomaly detection)
CREATE INDEX IF NOT EXISTS idx_string_telemetry_composite
  ON public.string_telemetry(string_id, timestamp DESC);

-- 2. Inverter Device Lookup Index (Crucial for OEM sync adapter device lookup & telemetry ingestion)
CREATE INDEX IF NOT EXISTS idx_inverters_oem_device
  ON public.inverters(oem, oem_device_id);

-- 3. Inverter Status Index (Crucial for Fleet Overview and offline site calculation)
CREATE INDEX IF NOT EXISTS idx_inverters_site_status
  ON public.inverters(site_id, status);

-- 4. Alerts Deduplication & Clearance Indexes (Crucial for fast alert matching in sync cycles)
CREATE INDEX IF NOT EXISTS idx_alerts_site_code_status
  ON public.alerts(site_id, code, status);

CREATE INDEX IF NOT EXISTS idx_alerts_inverter_status
  ON public.alerts(inverter_id, status);

-- 5. Tickets Composite Index (Crucial for Command Center Needs Attention Queue & triage)
CREATE INDEX IF NOT EXISTS idx_tickets_org_status_created
  ON public.tickets(org_id, status, created_at DESC);

-- 6. Work Orders Status Index (Crucial for Today's Operations Tracker & dispatching)
CREATE INDEX IF NOT EXISTS idx_work_orders_site_status
  ON public.work_orders(site_id, status);

-- 7. Sync Runs Index (Crucial for distributed sync lock and freshness checks)
CREATE INDEX IF NOT EXISTS idx_sync_runs_started
  ON public.sync_runs(started_at DESC);

-- 8. Cleaning Logs Performed At Index (Crucial for fleet activity feeds and overdue calculation)
CREATE INDEX IF NOT EXISTS idx_cleaning_logs_performed
  ON public.cleaning_logs(performed_at DESC);

-- 9. Cleaning Visits Lookup Index (Crucial for monthly planner matrix and client portal)
CREATE INDEX IF NOT EXISTS idx_cleaning_visits_lookup
  ON public.cleaning_visits(site_id, cycle_period, status);
