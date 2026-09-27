const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'frontend/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const sql = `
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
  DO $$
  BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'unique_cleaning_per_site_date'
        AND n.nspname = 'public'
    ) THEN
        CREATE UNIQUE INDEX unique_cleaning_per_site_date ON public.work_orders (site_id, scheduled_date) WHERE type = 'cleaning';
    END IF;
  END
  $$;

  -- 2. Add is_override to site_cleaning_rules
  ALTER TABLE public.site_cleaning_rules ADD COLUMN IF NOT EXISTS is_override boolean not null default false;

  -- Notify postgrest to reload cache
  NOTIFY pgrst, 'reload schema';
  `;

  const { data, error } = await supabase.rpc('exec_sql', { sql });
  if (error) {
    console.error("Error executing SQL:", error);
  } else {
    console.log("SQL executed successfully!");
  }
}

run();
