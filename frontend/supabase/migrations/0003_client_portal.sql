-- Solar Assist — Phase 4 Client Portal Migration
-- Adds client_org_id and grid_tariff_inr_per_kwh to sites and updates RLS for Client Organization Multi-Site Access

-- ─────────────────────────────────────────────────────────
-- ALTER SITES TABLE
-- ─────────────────────────────────────────────────────────
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS client_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grid_tariff_inr_per_kwh numeric(10,2) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_sites_client_org ON public.sites(client_org_id);

-- ─────────────────────────────────────────────────────────
-- UPDATED ROW LEVEL SECURITY (RLS) POLICIES
-- ─────────────────────────────────────────────────────────

-- SITES RLS
DROP POLICY IF EXISTS sites_select ON public.sites;
CREATE POLICY sites_select ON public.sites FOR SELECT USING (
  public.is_super_admin()
  OR org_id = public.current_org()
  OR client_org_id = public.current_org()
  OR client_id = auth.uid()
);

-- INVERTERS RLS
DROP POLICY IF EXISTS inv_select ON public.inverters;
CREATE POLICY inv_select ON public.inverters FOR SELECT USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.sites s
    WHERE s.id = site_id
      AND (s.org_id = public.current_org() OR s.client_org_id = public.current_org() OR s.client_id = auth.uid())
  )
);

-- TELEMETRY RLS
DROP POLICY IF EXISTS tel_select ON public.telemetry;
CREATE POLICY tel_select ON public.telemetry FOR SELECT USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.inverters i
    JOIN public.sites s ON s.id = i.site_id
    WHERE i.id = inverter_id
      AND (s.org_id = public.current_org() OR s.client_org_id = public.current_org() OR s.client_id = auth.uid())
  )
);

-- STRINGS RLS
DROP POLICY IF EXISTS str_select ON public.strings;
CREATE POLICY str_select ON public.strings FOR SELECT USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.inverters i
    JOIN public.sites s ON s.id = i.site_id
    WHERE i.id = inverter_id
      AND (s.org_id = public.current_org() OR s.client_org_id = public.current_org() OR s.client_id = auth.uid())
  )
);

-- STRING TELEMETRY RLS
DROP POLICY IF EXISTS str_tel_select ON public.string_telemetry;
CREATE POLICY str_tel_select ON public.string_telemetry FOR SELECT USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.strings str
    JOIN public.inverters i ON i.id = str.inverter_id
    JOIN public.sites s ON s.id = i.site_id
    WHERE str.id = string_id
      AND (s.org_id = public.current_org() OR s.client_org_id = public.current_org() OR s.client_id = auth.uid())
  )
);

-- CLEANING LOGS RLS
DROP POLICY IF EXISTS cln_select ON public.cleaning_logs;
CREATE POLICY cln_select ON public.cleaning_logs FOR SELECT USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.sites s
    WHERE s.id = site_id
      AND (s.org_id = public.current_org() OR s.client_org_id = public.current_org() OR s.client_id = auth.uid())
  )
);

-- WORK ORDERS RLS
DROP POLICY IF EXISTS wo_select ON public.work_orders;
CREATE POLICY wo_select ON public.work_orders FOR SELECT USING (
  public.is_super_admin()
  OR org_id = public.current_org()
  OR EXISTS (
    SELECT 1 FROM public.sites s
    WHERE s.id = site_id
      AND (s.client_org_id = public.current_org() OR s.client_id = auth.uid())
  )
);

-- ALERTS RLS
DROP POLICY IF EXISTS alert_select ON public.alerts;
CREATE POLICY alert_select ON public.alerts FOR SELECT USING (
  public.is_super_admin()
  OR org_id = public.current_org()
  OR EXISTS (
    SELECT 1 FROM public.sites s
    WHERE s.id = site_id
      AND (s.client_org_id = public.current_org() OR s.client_id = auth.uid())
  )
);

-- TICKETS RLS
DROP POLICY IF EXISTS ticket_select ON public.tickets;
CREATE POLICY ticket_select ON public.tickets FOR SELECT USING (
  public.is_super_admin()
  OR org_id = public.current_org()
  OR EXISTS (
    SELECT 1 FROM public.sites s
    WHERE s.id = site_id
      AND (s.client_org_id = public.current_org() OR s.client_id = auth.uid())
  )
);
