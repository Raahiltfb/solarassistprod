-- SolarAssist Phase 8: Database-Level Ticket and Work Order Concurrency Guards
-- Migration 0014: Active Ticket Deduplication and Work Order Over-Allocation Prevention

-- 1. Ticket Deduplication Partial Unique Index
-- Guarantees that at most one active ticket ('open', 'in_progress', 'on_hold') can exist per alert_id.
-- Allows resolved/closed tickets to exist historically without conflict.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_active_alert_unique
  ON public.tickets (alert_id)
  WHERE status IN ('open', 'in_progress', 'on_hold') AND alert_id IS NOT NULL;

-- 2. Work Order Over-Allocation Partial Unique Index
-- Guarantees that at most one active work order ('draft', 'scheduled', 'en_route', 'in_progress') can exist per ticket_id.
-- Preserves completed and cancelled work orders historically and permits legitimate subsequent work orders
-- once preceding work orders are completed or cancelled.
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_orders_active_ticket_unique
  ON public.work_orders (ticket_id)
  WHERE status IN ('draft', 'scheduled', 'en_route', 'in_progress') AND ticket_id IS NOT NULL;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
