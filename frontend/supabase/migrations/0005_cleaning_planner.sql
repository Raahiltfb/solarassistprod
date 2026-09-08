-- SolarAssist Phase 5B Migration: Monthly Cleaning Workforce Planner
-- 1. Enums
do $$ begin
  create type plan_status as enum ('draft', 'review', 'approved', 'published', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type constraint_severity as enum ('valid', 'warning', 'blocking');
exception when duplicate_object then null; end $$;

-- 2. Technician Teams Table
create table if not exists public.technician_teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  base_latitude double precision,
  base_longitude double precision,
  base_address text,
  color_code text default '#3b82f6',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3. Team Members Table
create table if not exists public.technician_team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.technician_teams(id) on delete cascade,
  technician_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(team_id, technician_id)
);

-- 4. Site Cleaning Rules Table (is_configured = false by default, allowed_weekdays NULL by default)
create table if not exists public.site_cleaning_rules (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null unique references public.sites(id) on delete cascade,
  is_configured boolean not null default false,
  normal_interval_days int,
  monsoon_interval_days int,
  monsoon_start_md text default '06-01',
  monsoon_end_md text default '09-30',
  allowed_weekdays int[],
  blackout_dates date[] default '{}',
  estimated_cleaning_mins int not null default 90,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Monthly Cleaning Plans Table (Single monthly plan lifecycle per org/year/month)
create table if not exists public.cleaning_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  year int not null,
  month int not null check (month >= 1 and month <= 12),
  status plan_status not null default 'draft',
  planning_capacity_mins int not null default 480,
  scheduling_tolerance_days int not null default 2,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id, year, month)
);

-- 6. Monthly Plan Assignments Table
create table if not exists public.cleaning_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.cleaning_plans(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  team_id uuid not null references public.technician_teams(id) on delete cascade,
  target_date date not null,
  scheduled_date date not null,
  sequence_order int not null default 1,
  estimated_cleaning_mins int not null default 90,
  estimated_travel_mins int not null default 0,
  estimated_distance_km numeric(10,2) default 0,
  constraint_state constraint_severity not null default 'valid',
  constraint_notes text,
  scheduler_rationale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 7. Add team_id and plan_assignment_id to Execution Tables
alter table public.daily_routes
  add column if not exists team_id uuid references public.technician_teams(id) on delete set null;

alter table public.work_orders
  add column if not exists team_id uuid references public.technician_teams(id) on delete set null,
  add column if not exists plan_assignment_id uuid references public.cleaning_plan_assignments(id) on delete set null;

-- 8. Row Level Security (RLS)
alter table public.technician_teams enable row level security;
alter table public.technician_team_members enable row level security;
alter table public.site_cleaning_rules enable row level security;
alter table public.cleaning_plans enable row level security;
alter table public.cleaning_plan_assignments enable row level security;

drop policy if exists teams_select on public.technician_teams;
create policy teams_select on public.technician_teams for select using (
  public.is_super_admin() or org_id = public.current_org()
);
drop policy if exists teams_manage on public.technician_teams;
create policy teams_manage on public.technician_teams for all using (
  public.is_super_admin() or (org_id = public.current_org() and public.current_role() in ('epc_admin', 'super_admin'))
) with check (true);

drop policy if exists team_members_select on public.technician_team_members;
create policy team_members_select on public.technician_team_members for select using (
  public.is_super_admin() or exists (
    select 1 from public.technician_teams t where t.id = team_id and t.org_id = public.current_org()
  )
);
drop policy if exists team_members_manage on public.technician_team_members;
create policy team_members_manage on public.technician_team_members for all using (
  public.is_super_admin() or exists (
    select 1 from public.technician_teams t where t.id = team_id and t.org_id = public.current_org() and public.current_role() in ('epc_admin', 'super_admin')
  )
) with check (true);

drop policy if exists rules_select on public.site_cleaning_rules;
create policy rules_select on public.site_cleaning_rules for select using (
  public.is_super_admin() or exists (
    select 1 from public.sites s where s.id = site_id and s.org_id = public.current_org()
  )
);
drop policy if exists rules_manage on public.site_cleaning_rules;
create policy rules_manage on public.site_cleaning_rules for all using (
  public.is_super_admin() or exists (
    select 1 from public.sites s where s.id = site_id and s.org_id = public.current_org() and public.current_role() in ('epc_admin', 'super_admin')
  )
) with check (true);

drop policy if exists plans_select on public.cleaning_plans;
create policy plans_select on public.cleaning_plans for select using (
  public.is_super_admin() or org_id = public.current_org()
);
drop policy if exists plans_manage on public.cleaning_plans;
create policy plans_manage on public.cleaning_plans for all using (
  public.is_super_admin() or (org_id = public.current_org() and public.current_role() in ('epc_admin', 'super_admin'))
) with check (true);

drop policy if exists plan_assignments_select on public.cleaning_plan_assignments;
create policy plan_assignments_select on public.cleaning_plan_assignments for select using (
  public.is_super_admin() or exists (
    select 1 from public.cleaning_plans p where p.id = plan_id and p.org_id = public.current_org()
  )
);
drop policy if exists plan_assignments_manage on public.cleaning_plan_assignments;
create policy plan_assignments_manage on public.cleaning_plan_assignments for all using (
  public.is_super_admin() or exists (
    select 1 from public.cleaning_plans p where p.id = plan_id and p.org_id = public.current_org() and public.current_role() in ('epc_admin', 'super_admin')
  )
) with check (true);

-- 9. Seed 4 Operational Workforce Teams & Team Members for SolarAssist O&M Org
do $$
declare
  solarassist_org_id uuid := 'c1e566ff-c676-4ceb-a2f1-c904783e2fa5';
  t1_id uuid := gen_random_uuid();
  t2_id uuid := gen_random_uuid();
  t3_id uuid := gen_random_uuid();
  t4_id uuid := gen_random_uuid();

  tech1_id uuid;
  tech2_id uuid;
  tech3_id uuid;
  tech4_id uuid;
  tech5_id uuid;
  tech6_id uuid;
  tech7_id uuid;
  tech8_id uuid;
begin
  -- Fetch profile UUIDs for tech1..tech8
  select id into tech1_id from public.profiles where email = 'tech1@solarassist.dev' limit 1;
  select id into tech2_id from public.profiles where email = 'tech2@solarassist.dev' limit 1;
  select id into tech3_id from public.profiles where email = 'tech3@solarassist.dev' limit 1;
  select id into tech4_id from public.profiles where email = 'tech4@solarassist.dev' limit 1;
  select id into tech5_id from public.profiles where email = 'tech5@solarassist.dev' limit 1;
  select id into tech6_id from public.profiles where email = 'tech6@solarassist.dev' limit 1;
  select id into tech7_id from public.profiles where email = 'tech7@solarassist.dev' limit 1;
  select id into tech8_id from public.profiles where email = 'tech8@solarassist.dev' limit 1;

  if tech1_id is not null then
    -- Team 1
    insert into public.technician_teams (id, org_id, name, base_latitude, base_longitude, base_address, color_code)
    values (t1_id, solarassist_org_id, 'Team 1 (Thane & East)', 19.2183, 72.9781, 'Thane West, MMR', '#3b82f6')
    on conflict do nothing;

    insert into public.technician_team_members (team_id, technician_id)
    values (t1_id, tech1_id), (t1_id, tech2_id)
    on conflict do nothing;

    -- Team 2
    insert into public.technician_teams (id, org_id, name, base_latitude, base_longitude, base_address, color_code)
    values (t2_id, solarassist_org_id, 'Team 2 (Panvel & West)', 18.9894, 73.1175, 'Panvel, Navi Mumbai', '#10b981')
    on conflict do nothing;

    insert into public.technician_team_members (team_id, technician_id)
    values (t2_id, tech3_id), (t2_id, tech4_id)
    on conflict do nothing;

    -- Team 3
    insert into public.technician_teams (id, org_id, name, base_latitude, base_longitude, base_address, color_code)
    values (t3_id, solarassist_org_id, 'Team 3 (Vashi & Central)', 19.0770, 72.9980, 'Vashi, Navi Mumbai', '#f59e0b')
    on conflict do nothing;

    insert into public.technician_team_members (team_id, technician_id)
    values (t3_id, tech5_id), (t3_id, tech6_id)
    on conflict do nothing;

    -- Team 4
    insert into public.technician_teams (id, org_id, name, base_latitude, base_longitude, base_address, color_code)
    values (t4_id, solarassist_org_id, 'Team 4 (Kalyan & North)', 19.2403, 73.1305, 'Kalyan, MMR', '#8b5cf6')
    on conflict do nothing;

    insert into public.technician_team_members (team_id, technician_id)
    values (t4_id, tech7_id), (t4_id, tech8_id)
    on conflict do nothing;
  end if;
end $$;

-- 10. Seed site_cleaning_rules for all existing sites with is_configured = false and allowed_weekdays = NULL
insert into public.site_cleaning_rules (site_id, is_configured, normal_interval_days, monsoon_interval_days, allowed_weekdays, estimated_cleaning_mins)
select id, false, null, null, null, 90 from public.sites
on conflict (site_id) do nothing;
