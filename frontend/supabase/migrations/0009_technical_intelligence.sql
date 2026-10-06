-- Phase 5: Technical Intelligence — Meters & Meter Readings
CREATE TABLE IF NOT EXISTS public.meters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  meter_number text NOT NULL,
  meter_name text NOT NULL DEFAULT 'Utility Export Meter',
  meter_type text NOT NULL DEFAULT 'export', -- export, import, net, check
  multiplier numeric(10,4) NOT NULL DEFAULT 1.0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meters_site ON public.meters(site_id);

CREATE TABLE IF NOT EXISTS public.meter_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id uuid NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  reading_timestamp timestamptz NOT NULL,
  export_kwh numeric(12,3) NOT NULL DEFAULT 0,
  import_kwh numeric(12,3) NOT NULL DEFAULT 0,
  peak_demand_kw numeric(10,2),
  recorded_by uuid REFERENCES public.profiles(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meter_readings_site_time ON public.meter_readings(site_id, reading_timestamp DESC);

-- Enable RLS
ALTER TABLE public.meters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meter_readings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS meters_select ON public.meters;
CREATE POLICY meters_select ON public.meters FOR SELECT USING (
  public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.org_id = public.current_org())
);

DROP POLICY IF EXISTS meters_manage ON public.meters;
CREATE POLICY meters_manage ON public.meters FOR ALL USING (
  public.is_super_admin() OR (EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.org_id = public.current_org()) AND public.current_role() IN ('epc_admin','super_admin'))
) WITH CHECK (true);

DROP POLICY IF EXISTS meter_readings_select ON public.meter_readings;
CREATE POLICY meter_readings_select ON public.meter_readings FOR SELECT USING (
  public.is_super_admin() OR EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.org_id = public.current_org())
);

DROP POLICY IF EXISTS meter_readings_manage ON public.meter_readings;
CREATE POLICY meter_readings_manage ON public.meter_readings FOR ALL USING (
  public.is_super_admin() OR (EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.org_id = public.current_org()) AND public.current_role() IN ('epc_admin','technician','super_admin'))
) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
