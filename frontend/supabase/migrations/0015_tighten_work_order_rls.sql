-- =====================================================================
-- Migration 0015: Tighten Work Order Row Level Security (RLS) & Immutability
-- Target: Staging Only (xpjzuquqehjamqsqshwq)
--
-- Summary of Changes:
-- 1. Eliminates the `wo_manage` WITH CHECK (true) security loophole.
-- 2. Implements least-privilege policies for INSERT, UPDATE, and DELETE.
-- 3. Strict organization isolation across all operations.
-- 4. Restricts Technician INSERT: requires technician_id = auth.uid() in own org.
-- 5. Restricts Technician UPDATE: scoped to assigned work orders or unassigned
--    team orders where the technician is an active member in that same org.
-- 6. Field Immutability Trigger (SECURITY INVOKER): strictly prevents technicians
--    from modifying administrative, scoping, planning, or engine-controlled fields
--    (id, org_id, site_id, ticket_id, created_by, created_at, title, type,
--     scheduled_date, estimated_duration_mins, team_id, plan_assignment_id,
--     verification_status, verification_window_ends_at, pre_repair_metric,
--     post_repair_metric, verified_at).
-- 7. Restricts DELETE: strictly prohibited for Technicians and Clients.
-- 8. Existing SELECT policy (wo_select) remains completely untouched.
-- =====================================================================

BEGIN;

-- 1. Drop existing monolithic management policy and previous drafts if any
DROP POLICY IF EXISTS wo_manage ON public.work_orders;
DROP POLICY IF EXISTS wo_insert ON public.work_orders;
DROP POLICY IF EXISTS wo_update ON public.work_orders;
DROP POLICY IF EXISTS wo_delete ON public.work_orders;

-- 2. Granular INSERT Policy:
-- Super Admins: global access across any organization.
-- EPC Admins: can insert within their own organization.
-- Technicians: can insert within their own organization ONLY if assigned to themselves.
-- Clients: strictly prohibited (RLS 42501).
CREATE POLICY wo_insert ON public.work_orders
FOR INSERT WITH CHECK (
  public.is_super_admin()
  OR (
    org_id = public.current_org()
    AND (
      public.current_role() = 'epc_admin'
      OR (
        public.current_role() = 'technician'
        AND technician_id = auth.uid()
      )
    )
  )
);

-- 3. Granular UPDATE Policy:
-- Super Admins: global update access.
-- EPC Admins: can update work orders within their own organization.
-- Technicians:
--   USING: Can only target work orders in their own org that are assigned to them,
--          OR assigned to a team where they are an active member in that same org.
--   WITH CHECK: Must maintain org_id = public.current_org(), and must either maintain
--               technician_id = auth.uid(), or for unassigned team jobs, keep technician_id
--               null while belonging to that team. Technicians CANNOT reassign to other technicians.
-- Clients: strictly prohibited.
CREATE POLICY wo_update ON public.work_orders
FOR UPDATE USING (
  public.is_super_admin()
  OR (
    org_id = public.current_org()
    AND (
      public.current_role() = 'epc_admin'
      OR (
        public.current_role() = 'technician'
        AND (
          technician_id = auth.uid()
          OR (
            team_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.technician_team_members ttm
              JOIN public.technician_teams tt ON tt.id = ttm.team_id
              WHERE ttm.team_id = work_orders.team_id
                AND ttm.technician_id = auth.uid()
                AND tt.org_id = public.current_org()
            )
          )
        )
      )
    )
  )
) WITH CHECK (
  public.is_super_admin()
  OR (
    org_id = public.current_org()
    AND (
      public.current_role() = 'epc_admin'
      OR (
        public.current_role() = 'technician'
        AND (
          technician_id = auth.uid()
          OR (
            technician_id IS NULL
            AND team_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.technician_team_members ttm
              JOIN public.technician_teams tt ON tt.id = ttm.team_id
              WHERE ttm.team_id = work_orders.team_id
                AND ttm.technician_id = auth.uid()
                AND tt.org_id = public.current_org()
            )
          )
        )
      )
    )
  )
);

-- 4. Granular DELETE Policy:
-- Super Admins and EPC Admins within their own organization only.
-- Technicians and Clients are strictly PROHIBITED from deleting work orders.
CREATE POLICY wo_delete ON public.work_orders
FOR DELETE USING (
  public.is_super_admin()
  OR (
    org_id = public.current_org()
    AND public.current_role() = 'epc_admin'
  )
);

-- 5. Field Immutability Trigger for Technicians (SECURITY INVOKER)
-- Restricts technicians to operational fields:
--   status, description, check_in_at, check_in_lat, check_in_lng, completed_at, updated_at
-- Raises an exception if a technician modifies any administrative or planning field.
CREATE OR REPLACE FUNCTION public.trg_enforce_technician_wo_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF public.current_role() = 'technician' AND NOT public.is_super_admin() THEN
    -- Identity & Scoping
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Technicians cannot modify work order id';
    END IF;
    IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
      RAISE EXCEPTION 'Technicians cannot modify work order org_id';
    END IF;
    IF NEW.site_id IS DISTINCT FROM OLD.site_id THEN
      RAISE EXCEPTION 'Technicians cannot modify work order site_id';
    END IF;
    IF NEW.ticket_id IS DISTINCT FROM OLD.ticket_id THEN
      RAISE EXCEPTION 'Technicians cannot modify work order ticket_id';
    END IF;
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Technicians cannot modify work order created_by';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Technicians cannot modify work order created_at';
    END IF;

    -- Planning, Scheduling & Classification
    IF NEW.title IS DISTINCT FROM OLD.title THEN
      RAISE EXCEPTION 'Technicians cannot modify work order title';
    END IF;
    IF NEW.type IS DISTINCT FROM OLD.type THEN
      RAISE EXCEPTION 'Technicians cannot modify work order type';
    END IF;
    IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date THEN
      RAISE EXCEPTION 'Technicians cannot modify work order scheduled_date';
    END IF;
    IF NEW.estimated_duration_mins IS DISTINCT FROM OLD.estimated_duration_mins THEN
      RAISE EXCEPTION 'Technicians cannot modify work order estimated_duration_mins';
    END IF;
    IF NEW.team_id IS DISTINCT FROM OLD.team_id THEN
      RAISE EXCEPTION 'Technicians cannot modify work order team_id';
    END IF;
    IF NEW.plan_assignment_id IS DISTINCT FROM OLD.plan_assignment_id THEN
      RAISE EXCEPTION 'Technicians cannot modify work order plan_assignment_id';
    END IF;

    -- Verification & Telemetry Engine Authority
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
      RAISE EXCEPTION 'Technicians cannot modify work order verification_status';
    END IF;
    IF NEW.verification_window_ends_at IS DISTINCT FROM OLD.verification_window_ends_at THEN
      RAISE EXCEPTION 'Technicians cannot modify work order verification_window_ends_at';
    END IF;
    IF NEW.pre_repair_metric IS DISTINCT FROM OLD.pre_repair_metric THEN
      RAISE EXCEPTION 'Technicians cannot modify work order pre_repair_metric';
    END IF;
    IF NEW.post_repair_metric IS DISTINCT FROM OLD.post_repair_metric THEN
      RAISE EXCEPTION 'Technicians cannot modify work order post_repair_metric';
    END IF;
    IF NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
      RAISE EXCEPTION 'Technicians cannot modify work order verified_at';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trg_enforce_technician_wo_immutability() TO authenticated;

DROP TRIGGER IF EXISTS check_technician_wo_immutability ON public.work_orders;
CREATE TRIGGER check_technician_wo_immutability
BEFORE UPDATE ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_enforce_technician_wo_immutability();

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
