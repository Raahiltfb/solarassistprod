-- =====================================================================
-- Migration 0015 Safe Rollback: Revert Work Order RLS to Safe Base
-- Target: Staging Only (xpjzuquqehjamqsqshwq)
--
-- Security Strategy:
-- This rollback reverts granular policies and the immutability trigger
-- while PREVENTING the reintroduction of the unrestricted client INSERT vulnerability.
--
-- - Dropping: check_technician_wo_immutability trigger & function
-- - Dropping: wo_insert, wo_update, wo_delete
-- - Restoring: wo_manage FOR ALL with a SECURE WITH CHECK clause that enforces
--   org_id = public.current_org() and role IN ('epc_admin', 'technician', 'super_admin').
-- - Clients remain strictly blocked from INSERT/UPDATE/DELETE.
-- =====================================================================

BEGIN;

-- 1. Drop trigger and immutability function
DROP TRIGGER IF EXISTS check_technician_wo_immutability ON public.work_orders;
DROP FUNCTION IF EXISTS public.trg_enforce_technician_wo_immutability();

-- 2. Drop granular mutation policies
DROP POLICY IF EXISTS wo_insert ON public.work_orders;
DROP POLICY IF EXISTS wo_update ON public.work_orders;
DROP POLICY IF EXISTS wo_delete ON public.work_orders;

-- 3. Restore consolidated wo_manage WITH SAFE CHECK (Clients strictly blocked)
DROP POLICY IF EXISTS wo_manage ON public.work_orders;
CREATE POLICY wo_manage ON public.work_orders
FOR ALL USING (
  public.is_super_admin()
  OR (
    org_id = public.current_org()
    AND public.current_role() IN ('epc_admin', 'technician', 'super_admin')
  )
) WITH CHECK (
  public.is_super_admin()
  OR (
    org_id = public.current_org()
    AND public.current_role() IN ('epc_admin', 'technician', 'super_admin')
  )
);

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================================
-- EMERGENCY ONLY: Historical Legacy Insecure Fallback
-- WARNING: Executing the statement below reintroduces the critical vulnerability
-- allowing ANY authenticated user (including Clients) to insert arbitrary work orders.
-- Do NOT execute unless specifically diagnosing pre-migration behavior.
--
-- ALTER POLICY wo_manage ON public.work_orders WITH CHECK (true);
-- =====================================================================
