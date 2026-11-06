-- Migration 0016: Add Feston OEM Provider & Universal Station Mapping Architecture
-- Safe, additive, non-blocking operation

-- 1. Add canonical 'feston' to oem_provider enum
ALTER TYPE public.oem_provider ADD VALUE IF NOT EXISTS 'feston';

-- 2. Create oem_station_mappings for deterministic, rename-safe station -> site mapping
CREATE TABLE IF NOT EXISTS public.oem_station_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
    oem public.oem_provider NOT NULL,
    external_station_id TEXT NOT NULL,
    station_name TEXT NOT NULL DEFAULT '',
    collector_sn TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (oem, external_station_id)
);

-- 3. Indexes for rapid lookups and tenant queries
CREATE INDEX IF NOT EXISTS idx_oem_station_mappings_lookup 
    ON public.oem_station_mappings(oem, external_station_id);

CREATE INDEX IF NOT EXISTS idx_oem_station_mappings_site 
    ON public.oem_station_mappings(site_id);

-- 4. Row Level Security & Canonical Tenant Isolation
ALTER TABLE public.oem_station_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oem_station_mappings_select ON public.oem_station_mappings;
CREATE POLICY oem_station_mappings_select ON public.oem_station_mappings FOR SELECT USING (
    public.is_super_admin() OR EXISTS (
        SELECT 1 FROM public.sites s 
        WHERE s.id = site_id AND s.org_id = public.current_org()
    )
);

DROP POLICY IF EXISTS oem_station_mappings_manage ON public.oem_station_mappings;
CREATE POLICY oem_station_mappings_manage ON public.oem_station_mappings FOR ALL USING (
    public.is_super_admin() OR EXISTS (
        SELECT 1 FROM public.sites s 
        WHERE s.id = site_id AND s.org_id = public.current_org() AND public.current_role() IN ('epc_admin','super_admin')
    )
) WITH CHECK (
    public.is_super_admin() OR EXISTS (
        SELECT 1 FROM public.sites s 
        WHERE s.id = site_id AND s.org_id = public.current_org() AND public.current_role() IN ('epc_admin','super_admin')
    )
);

-- 5. Role Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oem_station_mappings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oem_station_mappings TO service_role;

-- 6. Dynamic Topology: Make modules_count nullable without invented default 20
ALTER TABLE public.strings ALTER COLUMN modules_count DROP DEFAULT;
ALTER TABLE public.strings ALTER COLUMN modules_count DROP NOT NULL;
