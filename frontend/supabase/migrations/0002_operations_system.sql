-- Solar Assist — Operations System Phase 1 Migration
-- Work Orders, Daily Routes, Route Stops, Notifications, Profile Base Location, and Cleaning Log Enhancements

-- ─────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────
do $$ begin
  create type work_order_type as enum ('cleaning', 'maintenance', 'inspection', 'alarm_investigation');
exception when duplicate_object then null; end $$;

do $$ begin
  create type work_order_status as enum ('draft', 'scheduled', 'en_route', 'in_progress', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type route_status as enum ('draft', 'optimized', 'published', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_channel as enum ('email', 'sms');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_status as enum ('pending', 'sent', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────
-- TABLE ENHANCEMENTS: PROFILES
-- ─────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists base_latitude double precision,
  add column if not exists base_longitude double precision,
  add column if not exists base_address text;

-- ─────────────────────────────────────────────────────────
-- TABLES: WORK ORDERS
-- ─────────────────────────────────────────────────────────
create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete set null,
  technician_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,
  type work_order_type not null default 'cleaning',
  status work_order_status not null default 'draft',
  scheduled_date date,
  estimated_duration_mins int not null default 60,
  check_in_at timestamptz,
  check_in_lat double precision,
  check_in_lng double precision,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_work_orders_org_date on public.work_orders(org_id, scheduled_date);
create index if not exists idx_work_orders_tech on public.work_orders(technician_id, scheduled_date);
create index if not exists idx_work_orders_site on public.work_orders(site_id);
create index if not exists idx_work_orders_ticket on public.work_orders(ticket_id);

-- ─────────────────────────────────────────────────────────
-- TABLES: DAILY ROUTES
-- ─────────────────────────────────────────────────────────
create table if not exists public.daily_routes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  technician_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  status route_status not null default 'draft',
  start_location_lat double precision,
  start_location_lng double precision,
  total_distance_km numeric(10,2) default 0,
  total_travel_mins int default 0,
  created_at timestamptz not null default now(),
  unique(technician_id, date)
);

create index if not exists idx_daily_routes_tech_date on public.daily_routes(technician_id, date);

-- ─────────────────────────────────────────────────────────
-- TABLES: ROUTE STOPS
-- ─────────────────────────────────────────────────────────
create table if not exists public.route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.daily_routes(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  sequence_order int not null,
  estimated_arrival time,
  travel_time_mins int default 0,
  distance_km numeric(10,2) default 0,
  created_at timestamptz not null default now(),
  unique(route_id, sequence_order)
);

create index if not exists idx_route_stops_route on public.route_stops(route_id, sequence_order);
create index if not exists idx_route_stops_wo on public.route_stops(work_order_id);

-- ─────────────────────────────────────────────────────────
-- TABLES: WORK ORDER NOTIFICATIONS
-- ─────────────────────────────────────────────────────────
create table if not exists public.work_order_notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete set null,
  recipient_email text not null,
  channel notification_channel not null default 'email',
  event_type text not null,
  status notification_status not null default 'pending',
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_wo_notifications_status on public.work_order_notifications(status, scheduled_for);

-- ─────────────────────────────────────────────────────────
-- TABLE ENHANCEMENTS: CLEANING LOGS
-- ─────────────────────────────────────────────────────────
alter table public.cleaning_logs
  add column if not exists work_order_id uuid references public.work_orders(id) on delete set null,
  add column if not exists safety_photo_url text,
  add column if not exists damage_observed boolean default false,
  add column if not exists damage_type text,
  add column if not exists damage_photo_url text;

create index if not exists idx_cleaning_logs_wo on public.cleaning_logs(work_order_id);

-- ─────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────────────────
alter table public.work_orders enable row level security;
alter table public.daily_routes enable row level security;
alter table public.route_stops enable row level security;
alter table public.work_order_notifications enable row level security;

-- Work Orders RLS
drop policy if exists wo_select on public.work_orders;
create policy wo_select on public.work_orders for select using (
  public.is_super_admin()
  or org_id = public.current_org()
  or exists (
    select 1 from public.sites s
    where s.id = site_id and s.client_id = auth.uid()
  )
);

drop policy if exists wo_manage on public.work_orders;
create policy wo_manage on public.work_orders for all using (
  public.is_super_admin()
  or (org_id = public.current_org() and public.current_role() in ('epc_admin', 'technician', 'super_admin'))
) with check (true);

-- Daily Routes RLS
drop policy if exists routes_select on public.daily_routes;
create policy routes_select on public.daily_routes for select using (
  public.is_super_admin() or org_id = public.current_org()
);

drop policy if exists routes_manage on public.daily_routes;
create policy routes_manage on public.daily_routes for all using (
  public.is_super_admin()
  or (org_id = public.current_org() and public.current_role() in ('epc_admin', 'technician', 'super_admin'))
) with check (true);

-- Route Stops RLS
drop policy if exists stops_select on public.route_stops;
create policy stops_select on public.route_stops for select using (
  public.is_super_admin()
  or exists (
    select 1 from public.daily_routes r
    where r.id = route_id and r.org_id = public.current_org()
  )
);

drop policy if exists stops_manage on public.route_stops;
create policy stops_manage on public.route_stops for all using (
  public.is_super_admin()
  or exists (
    select 1 from public.daily_routes r
    where r.id = route_id and r.org_id = public.current_org() and public.current_role() in ('epc_admin', 'technician', 'super_admin')
  )
) with check (true);

-- Notifications RLS
drop policy if exists notif_select on public.work_order_notifications;
create policy notif_select on public.work_order_notifications for select using (
  public.is_super_admin() or org_id = public.current_org()
);

drop policy if exists notif_manage on public.work_order_notifications;
create policy notif_manage on public.work_order_notifications for all using (
  public.is_super_admin()
  or (org_id = public.current_org() and public.current_role() = 'epc_admin')
) with check (true);
