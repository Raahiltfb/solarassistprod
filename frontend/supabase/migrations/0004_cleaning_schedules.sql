-- SolarAssist - Phase 5 Cleaning Schedule Persistence Migration
-- Adds explicit cleaning schedule persistence fields to public.sites

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS next_cleaning_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cleaning_schedule_type varchar(20) DEFAULT 'suggested',
  ADD COLUMN IF NOT EXISTS cleaning_schedule_notes text DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_sites_next_cleaning ON public.sites(next_cleaning_date);
