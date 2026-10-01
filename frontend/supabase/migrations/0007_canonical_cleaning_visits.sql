-- SolarAssist Phase 2 Cleaning System Architectural Reset: Batch 1
-- Migration: Canonical Cleaning Visits Model

-- 1. Create cleaning_visit_status Enum
do $$ begin
  create type cleaning_visit_status as enum (
    'required',       -- Visit needed for period, not yet placed in a monthly plan
    'unscheduled',    -- Cannot be scheduled due to constraint bottleneck
    'planned',        -- Scheduled in draft/review monthly plan
    'approved',       -- Plan approved by admin
    'published',      -- Dispatched to workforce routes
    'en_route',       -- Team en route to site
    'in_progress',    -- Cleaning actively being performed
    'completed',      -- Execution verified with photos & submitted
    'acknowledged',   -- Admin/Client reviewed and acknowledged
    'cancelled',      -- Manually cancelled/skipped with rationale
    'missed'          -- Scheduled date passed without execution
  );
exception when duplicate_object then null; end $$;

-- 2. Create Canonical public.cleaning_visits Table
create table if not exists public.cleaning_visits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  plan_id uuid references public.cleaning_plans(id) on delete set null,

  -- Planning & Sequence
  cycle_period text not null, -- Format: 'YYYY-MM'
  visit_sequence_in_month int not null default 1,
  target_due_date date not null,
  scheduled_date date,

  -- Assignment
  assigned_team_id uuid references public.technician_teams(id) on delete set null,
  assigned_technician_id uuid references public.profiles(id) on delete set null,

  -- Lifecycle Status
  status cleaning_visit_status not null default 'required',

  -- Constraint Diagnostics (reusing constraint_severity enum from 0005_cleaning_planner.sql)
  constraint_state constraint_severity not null default 'valid',
  constraint_notes text,
  unscheduled_reason text,
  planner_rationale text,

  -- Routing Info
  route_id uuid references public.daily_routes(id) on delete set null,
  route_sequence_order int,
  estimated_cleaning_mins int not null default 90,
  estimated_travel_mins int not null default 0,
  estimated_distance_km numeric(10,2) default 0,

  -- Execution & Evidence
  execution_log_id uuid references public.cleaning_logs(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles(id) on delete set null,

  -- Audit Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Canonical Uniqueness Constraint
  constraint unique_cleaning_visit_cycle unique(site_id, cycle_period, visit_sequence_in_month)
);

-- 3. Add cleaning_visit_id Foreign Key to public.cleaning_logs
alter table public.cleaning_logs
  add column if not exists cleaning_visit_id uuid references public.cleaning_visits(id) on delete set null;

create index if not exists idx_cleaning_logs_visit on public.cleaning_logs(cleaning_visit_id);

-- 4. Create Indexes
create index if not exists idx_cleaning_visits_org on public.cleaning_visits(org_id);
create index if not exists idx_cleaning_visits_site on public.cleaning_visits(site_id);
create index if not exists idx_cleaning_visits_cycle on public.cleaning_visits(cycle_period);
create index if not exists idx_cleaning_visits_status on public.cleaning_visits(status);
create index if not exists idx_cleaning_visits_scheduled on public.cleaning_visits(scheduled_date);
create index if not exists idx_cleaning_visits_target on public.cleaning_visits(target_due_date);
create index if not exists idx_cleaning_visits_team on public.cleaning_visits(assigned_team_id);
create index if not exists idx_cleaning_visits_tech on public.cleaning_visits(assigned_technician_id);
create index if not exists idx_cleaning_visits_plan on public.cleaning_visits(plan_id);
create index if not exists idx_cleaning_visits_route on public.cleaning_visits(route_id);

-- 5. Row Level Security (RLS)
alter table public.cleaning_visits enable row level security;

drop policy if exists visits_select on public.cleaning_visits;
create policy visits_select on public.cleaning_visits for select using (
  public.is_super_admin()
  or org_id = public.current_org()
  or exists (
    select 1 from public.sites s
    where s.id = site_id
      and (s.client_org_id = public.current_org() or s.client_id = auth.uid())
  )
);

drop policy if exists visits_manage on public.cleaning_visits;
create policy visits_manage on public.cleaning_visits for all using (
  public.is_super_admin()
  or (org_id = public.current_org() and public.current_role() in ('epc_admin', 'technician', 'super_admin'))
) with check (true);
