-- Clean up duplicates before adding unique index
DELETE FROM public.work_orders
WHERE id IN (
  SELECT id
  FROM (
    SELECT id, ROW_NUMBER() OVER (partition BY site_id, scheduled_date ORDER BY created_at ASC) as row_num
    FROM public.work_orders
    WHERE type = 'cleaning'
  ) t
  WHERE t.row_num > 1
);

-- 1. Prevent Duplicate Cleanings (Site + Date)
CREATE UNIQUE INDEX IF NOT EXISTS unique_cleaning_per_site_date 
ON public.work_orders (site_id, scheduled_date) 
WHERE type = 'cleaning';

-- 2. Add is_override to site_cleaning_rules
ALTER TABLE public.site_cleaning_rules ADD COLUMN IF NOT EXISTS is_override boolean not null default false;

-- Notify postgrest to reload cache
NOTIFY pgrst, 'reload schema';
