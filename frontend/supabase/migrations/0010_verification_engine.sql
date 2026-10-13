-- Phase 6: Resolution / Verification Engine Migration
-- Adds telemetry-based verification, recovery tracking, and auto-reopening fields to tickets and work_orders

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verification_window_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verification_notes text,
  ADD COLUMN IF NOT EXISTS pre_repair_metric text,
  ADD COLUMN IF NOT EXISTS post_repair_metric text,
  ADD COLUMN IF NOT EXISTS reopened_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verification_window_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS pre_repair_metric text,
  ADD COLUMN IF NOT EXISTS post_repair_metric text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tickets_verification ON public.tickets(verification_status) WHERE verification_status IN ('under_verification', 'verification_failed');
CREATE INDEX IF NOT EXISTS idx_work_orders_verification ON public.work_orders(verification_status) WHERE verification_status IN ('under_verification', 'verification_failed');

NOTIFY pgrst, 'reload schema';
