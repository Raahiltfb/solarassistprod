-- Installs a minimal `exec_sql` function for running raw SQL via supabase-js rpc.
-- Run this ONCE manually in Supabase Studio → SQL Editor before `yarn seed`.
create or replace function public.exec_sql(sql text) returns void
language plpgsql security definer as $$
begin
  execute sql;
end $$;
