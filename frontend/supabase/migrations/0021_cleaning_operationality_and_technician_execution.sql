-- SolarAssist Migration 0021: Cleaning Operationality, Trigger-based Site Updates, and Blank Workforce Teams

-- 1. Security Definer Trigger: Auto-update site last_cleaned_on and next_cleaning_date on cleaning log insert
create or replace function public.trg_update_site_cleaning_state()
returns trigger
language plpgsql
security definer
as $$
declare
  v_cycle_days int;
  v_next_date date;
begin
  select coalesce(cleaning_cycle_days, 30) into v_cycle_days from public.sites where id = NEW.site_id;
  if v_cycle_days is null or v_cycle_days <= 0 then
    v_cycle_days := 30;
  end if;

  v_next_date := coalesce(NEW.next_due_on, (NEW.performed_at::date + (v_cycle_days || ' days')::interval)::date);

  update public.sites
  set 
    last_cleaned_on = NEW.performed_at::date,
    next_cleaning_date = v_next_date,
    cleaning_schedule_type = 'suggested',
    updated_at = now()
  where id = NEW.site_id;

  return NEW;
end;
$$;

drop trigger if exists trg_cleaning_logs_site_update on public.cleaning_logs;
create trigger trg_cleaning_logs_site_update
after insert on public.cleaning_logs
for each row execute function public.trg_update_site_cleaning_state();

-- 2. Explicitly allow technicians to update sites table (for last_cleaned_on and cleaning schedule fields)
drop policy if exists sites_tech_update on public.sites;
create policy sites_tech_update on public.sites for update using (
  public.is_super_admin()
  or (org_id = public.current_org() and public.current_role() in ('epc_admin', 'super_admin', 'technician'))
) with check (
  public.is_super_admin()
  or (org_id = public.current_org() and public.current_role() in ('epc_admin', 'super_admin', 'technician'))
);

-- 3. Clear all hardcoded team assignments so teams start blank for admin customization
delete from public.technician_team_members where 1 = 1;

-- 4. Ensure storage bucket solar-uploads exists and allows authenticated uploads
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('solar-uploads', 'solar-uploads', true)
  on conflict (id) do update set public = true;
exception when others then null;
end $$;

do $$
begin
  drop policy if exists "Authenticated users can upload photos" on storage.objects;
  create policy "Authenticated users can upload photos"
  on storage.objects for insert
  with check (bucket_id = 'solar-uploads' and auth.role() = 'authenticated');
exception when others then null;
end $$;

do $$
begin
  drop policy if exists "Public access to solar-uploads" on storage.objects;
  create policy "Public access to solar-uploads"
  on storage.objects for select
  using (bucket_id = 'solar-uploads');
exception when others then null;
end $$;

notify pgrst, 'reload schema';
