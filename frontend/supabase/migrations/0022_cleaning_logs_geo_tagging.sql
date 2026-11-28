-- Migration 0022: Add Auto Geo-Tagging Columns to Cleaning Logs
ALTER TABLE public.cleaning_logs
ADD COLUMN IF NOT EXISTS latitude double precision,
ADD COLUMN IF NOT EXISTS longitude double precision,
ADD COLUMN IF NOT EXISTS gps_accuracy double precision,
ADD COLUMN IF NOT EXISTS geo_tagged_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_cleaning_logs_geo
ON public.cleaning_logs(latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
