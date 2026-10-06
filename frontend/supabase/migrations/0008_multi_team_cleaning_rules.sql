-- Add required_teams to site_cleaning_rules to support multi-team / extra workforce sites
ALTER TABLE public.site_cleaning_rules ADD COLUMN IF NOT EXISTS required_teams integer not null default 1;

NOTIFY pgrst, 'reload schema';
