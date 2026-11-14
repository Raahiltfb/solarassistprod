-- SolarAssist Migration 0019: Cleaning Location Groups and Cleaning-Only Service Tiers

-- 1. Add service_tier to sites
alter table public.sites
  add column if not exists service_tier text not null default 'full_om';

do $$ begin
  alter table public.sites add constraint check_site_service_tier check (service_tier in ('full_om', 'cleaning_only'));
exception when duplicate_object then null; end $$;

create index if not exists idx_sites_service_tier on public.sites(service_tier);

-- 2. Create cleaning_locations table
create table if not exists public.cleaning_locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  address text not null,
  latitude double precision,
  longitude double precision,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cleaning_locations_org on public.cleaning_locations(org_id);

-- 3. Add cleaning_location_id to sites
alter table public.sites
  add column if not exists cleaning_location_id uuid references public.cleaning_locations(id) on delete set null;

create index if not exists idx_sites_cleaning_location on public.sites(cleaning_location_id);

-- 4. Enable RLS on cleaning_locations
alter table public.cleaning_locations enable row level security;

drop policy if exists cl_loc_select on public.cleaning_locations;
create policy cl_loc_select on public.cleaning_locations for select using (
  public.is_super_admin()
  or org_id = public.current_org()
  or exists (
    select 1 from public.sites s
    where s.cleaning_location_id = public.cleaning_locations.id
      and (s.client_org_id = public.current_org() or s.client_id = auth.uid())
  )
);

drop policy if exists cl_loc_all on public.cleaning_locations;
create policy cl_loc_all on public.cleaning_locations for all using (
  public.is_super_admin() or org_id = public.current_org()
);

-- 5. Modify cleaning_visits to support location-level visits
alter table public.cleaning_visits
  alter column site_id drop not null;

alter table public.cleaning_visits
  add column if not exists cleaning_location_id uuid references public.cleaning_locations(id) on delete set null;

create index if not exists idx_cleaning_visits_location on public.cleaning_visits(cleaning_location_id);

-- 6. Create cleaning_visit_items for tracking installation-level execution under coordinated visits
create table if not exists public.cleaning_visit_items (
  id uuid primary key default gen_random_uuid(),
  cleaning_visit_id uuid not null references public.cleaning_visits(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'completed', 'incomplete', 'skipped', 'issue')),
  notes text,
  completed_at timestamptz,
  before_photo_url text,
  after_photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(cleaning_visit_id, site_id)
);

create index if not exists idx_cleaning_visit_items_visit on public.cleaning_visit_items(cleaning_visit_id);
create index if not exists idx_cleaning_visit_items_site on public.cleaning_visit_items(site_id);

alter table public.cleaning_visit_items enable row level security;

drop policy if exists cvi_select on public.cleaning_visit_items;
create policy cvi_select on public.cleaning_visit_items for select using (
  public.is_super_admin()
  or exists (
    select 1 from public.cleaning_visits v
    where v.id = cleaning_visit_id and (v.org_id = public.current_org() or public.is_super_admin())
  )
);

drop policy if exists cvi_all on public.cleaning_visit_items;
create policy cvi_all on public.cleaning_visit_items for all using (
  public.is_super_admin()
  or exists (
    select 1 from public.cleaning_visits v
    where v.id = cleaning_visit_id and v.org_id = public.current_org()
  )
);

notify pgrst, 'reload schema';

