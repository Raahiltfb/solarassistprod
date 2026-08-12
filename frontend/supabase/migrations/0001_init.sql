-- Solar Assist — Multi-tenant Solar O&M Platform
-- PostgreSQL + Supabase Auth — UUIDs everywhere, Row Level Security enabled.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────
-- ORGANIZATIONS (EPCs)
-- ─────────────────────────────────────────────────────────
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  primary_color text default '#f59e0b',
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────
-- PROFILES (extends auth.users) — single source of truth for role + org
-- ─────────────────────────────────────────────────────────
do $$ begin
  create type user_role as enum ('super_admin','epc_admin','technician','client');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete set null,
  email text not null,
  full_name text not null default '',
  role user_role not null default 'client',
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_org on public.profiles(org_id);
create index if not exists idx_profiles_role on public.profiles(role);

-- helper functions used inside RLS
create or replace function public.current_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin');
$$;

-- ─────────────────────────────────────────────────────────
-- SITES
-- ─────────────────────────────────────────────────────────
do $$ begin
  create type site_status as enum ('active','inactive','commissioning');
exception when duplicate_object then null; end $$;

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  location text not null,
  latitude double precision not null,
  longitude double precision not null,
  capacity_kwp numeric(12,2) not null default 0,
  commissioned_on date not null default current_date,
  cleaning_cycle_days int not null default 30,
  last_cleaned_on date,
  client_id uuid references public.profiles(id) on delete set null,
  status site_status not null default 'active',
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now()
);
create index if not exists idx_sites_org on public.sites(org_id);

-- ─────────────────────────────────────────────────────────
-- INVERTERS + STRINGS
-- ─────────────────────────────────────────────────────────
do $$ begin
  create type oem_provider as enum ('solis','growatt','sungrow');
exception when duplicate_object then null; end $$;
do $$ begin
  create type inverter_status as enum ('online','offline','fault','standby');
exception when duplicate_object then null; end $$;

create table if not exists public.inverters (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  oem oem_provider not null,
  oem_device_id text not null,
  model text not null default '',
  serial_number text not null default '',
  capacity_kw numeric(10,2) not null default 0,
  string_count int not null default 0,
  status inverter_status not null default 'online',
  last_seen_at timestamptz,
  installed_on date not null default current_date,
  unique(oem, oem_device_id)
);
create index if not exists idx_inverters_site on public.inverters(site_id);

create table if not exists public.strings (
  id uuid primary key default gen_random_uuid(),
  inverter_id uuid not null references public.inverters(id) on delete cascade,
  string_index int not null,
  modules_count int not null default 20,
  capacity_kw numeric(10,2) not null default 0,
  status text not null default 'ok'
);
create index if not exists idx_strings_inverter on public.strings(inverter_id);

-- ─────────────────────────────────────────────────────────
-- TELEMETRY
-- ─────────────────────────────────────────────────────────
create table if not exists public.telemetry (
  id uuid primary key default gen_random_uuid(),
  inverter_id uuid not null references public.inverters(id) on delete cascade,
  timestamp timestamptz not null,
  ac_power_kw numeric(10,3) not null default 0,
  dc_power_kw numeric(10,3) not null default 0,
  energy_kwh numeric(12,3) not null default 0,
  efficiency_pct numeric(6,2) not null default 0,
  temperature_c numeric(6,2) not null default 0,
  daily_generation_kwh numeric,
  total_generation_kwh numeric,
  specific_yield numeric,
  online_status boolean,
  last_update timestamptz
);
create index if not exists idx_telemetry_inv_time on public.telemetry(inverter_id, timestamp desc);

-- ─────────────────────────────────────────────────────────
-- ALERTS
-- ─────────────────────────────────────────────────────────
do $$ begin create type alert_severity as enum ('low','medium','high','critical'); exception when duplicate_object then null; end $$;
do $$ begin create type alert_status   as enum ('open','acknowledged','resolved'); exception when duplicate_object then null; end $$;

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  inverter_id uuid references public.inverters(id) on delete set null,
  code text not null,
  title text not null,
  description text,
  severity alert_severity not null default 'medium',
  status alert_status not null default 'open',
  triggered_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles(id),
  resolved_at timestamptz
);
create index if not exists idx_alerts_site on public.alerts(site_id, status);
create index if not exists idx_alerts_org  on public.alerts(org_id, triggered_at desc);

-- ─────────────────────────────────────────────────────────
-- TICKETS
-- ─────────────────────────────────────────────────────────
do $$ begin create type ticket_status   as enum ('open','in_progress','on_hold','resolved','closed'); exception when duplicate_object then null; end $$;
do $$ begin create type ticket_priority as enum ('p1','p2','p3','p4'); exception when duplicate_object then null; end $$;

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  alert_id uuid references public.alerts(id) on delete set null,
  title text not null,
  description text,
  status ticket_status not null default 'open',
  priority ticket_priority not null default 'p3',
  assignee_id uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  sla_due_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_tickets_site on public.tickets(site_id, status);
create index if not exists idx_tickets_assignee on public.tickets(assignee_id);

create table if not exists public.maintenance_remarks (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_remarks_ticket on public.maintenance_remarks(ticket_id);

-- ─────────────────────────────────────────────────────────
-- CLEANING LOGS + UPLOADS
-- ─────────────────────────────────────────────────────────
create table if not exists public.cleaning_logs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  performed_by uuid references public.profiles(id),
  performed_at timestamptz not null default now(),
  next_due_on date,
  remarks text,
  before_photo_url text,
  after_photo_url text
);
create index if not exists idx_cleaning_site on public.cleaning_logs(site_id, performed_at desc);

create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  uploaded_by uuid references public.profiles(id),
  bucket text not null default 'solar-uploads',
  path text not null,
  mime_type text,
  size_bytes bigint,
  purpose text,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────
-- OEM INTEGRATIONS
-- ─────────────────────────────────────────────────────────
create table if not exists public.oem_integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider oem_provider not null,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  last_sync_at timestamptz,
  unique(org_id, provider)
);

-- ─────────────────────────────────────────────────────────
-- RLS (Row Level Security)
-- ─────────────────────────────────────────────────────────
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.sites enable row level security;
alter table public.inverters enable row level security;
alter table public.strings enable row level security;
alter table public.telemetry enable row level security;
alter table public.alerts enable row level security;
alter table public.tickets enable row level security;
alter table public.maintenance_remarks enable row level security;
alter table public.cleaning_logs enable row level security;
alter table public.uploads enable row level security;
alter table public.oem_integrations enable row level security;

-- Orgs: super admin sees all, others see their own
drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations for select using (
  public.is_super_admin() or id = public.current_org()
);
drop policy if exists org_manage on public.organizations;
create policy org_manage on public.organizations for all using (public.is_super_admin())
  with check (public.is_super_admin());

-- Profiles
drop policy if exists profile_self_select on public.profiles;
create policy profile_self_select on public.profiles for select using (
  public.is_super_admin() or org_id = public.current_org() or id = auth.uid()
);
drop policy if exists profile_self_update on public.profiles;
create policy profile_self_update on public.profiles for update using (id = auth.uid() or public.is_super_admin())
  with check (id = auth.uid() or public.is_super_admin());
drop policy if exists profile_admin_insert on public.profiles;
create policy profile_admin_insert on public.profiles for insert with check (
  public.is_super_admin() or public.current_role() = 'epc_admin' or id = auth.uid()
);

-- Helper policy template for org-scoped tables
-- sites
drop policy if exists sites_select on public.sites;
create policy sites_select on public.sites for select using (
  public.is_super_admin() or org_id = public.current_org()
);
drop policy if exists sites_manage on public.sites;
create policy sites_manage on public.sites for all using (
  public.is_super_admin() or (org_id = public.current_org() and public.current_role() in ('epc_admin','super_admin'))
) with check (
  public.is_super_admin() or (org_id = public.current_org() and public.current_role() in ('epc_admin','super_admin'))
);

-- inverters / strings / telemetry via site
drop policy if exists inv_select on public.inverters;
create policy inv_select on public.inverters for select using (
  public.is_super_admin() or exists (select 1 from public.sites s where s.id = site_id and s.org_id = public.current_org())
);
drop policy if exists inv_manage on public.inverters;
create policy inv_manage on public.inverters for all using (
  public.is_super_admin() or exists (select 1 from public.sites s where s.id = site_id and s.org_id = public.current_org() and public.current_role() in ('epc_admin','super_admin'))
) with check (true);

drop policy if exists str_select on public.strings;
create policy str_select on public.strings for select using (
  public.is_super_admin() or exists (select 1 from public.inverters i join public.sites s on s.id = i.site_id where i.id = inverter_id and s.org_id = public.current_org())
);
drop policy if exists str_manage on public.strings;
create policy str_manage on public.strings for all using (public.is_super_admin() or public.current_role() in ('epc_admin','technician')) with check (true);

drop policy if exists tel_select on public.telemetry;
create policy tel_select on public.telemetry for select using (
  public.is_super_admin() or exists (select 1 from public.inverters i join public.sites s on s.id = i.site_id where i.id = inverter_id and s.org_id = public.current_org())
);

-- alerts / tickets
drop policy if exists alert_select on public.alerts;
create policy alert_select on public.alerts for select using (
  public.is_super_admin() or org_id = public.current_org()
);
drop policy if exists alert_manage on public.alerts;
create policy alert_manage on public.alerts for update using (
  public.is_super_admin() or (org_id = public.current_org() and public.current_role() in ('epc_admin','technician'))
) with check (true);

drop policy if exists ticket_select on public.tickets;
create policy ticket_select on public.tickets for select using (
  public.is_super_admin() or org_id = public.current_org()
);
drop policy if exists ticket_manage on public.tickets;
create policy ticket_manage on public.tickets for all using (
  public.is_super_admin() or (org_id = public.current_org() and public.current_role() in ('epc_admin','technician','super_admin'))
) with check (true);

drop policy if exists remark_all on public.maintenance_remarks;
create policy remark_all on public.maintenance_remarks for all using (
  public.is_super_admin() or exists (select 1 from public.tickets t where t.id = ticket_id and t.org_id = public.current_org())
) with check (true);

drop policy if exists cln_select on public.cleaning_logs;
create policy cln_select on public.cleaning_logs for select using (
  public.is_super_admin() or exists (select 1 from public.sites s where s.id = site_id and s.org_id = public.current_org())
);
drop policy if exists cln_insert on public.cleaning_logs;
create policy cln_insert on public.cleaning_logs for insert with check (
  public.is_super_admin() or (public.current_role() in ('epc_admin','technician') and exists (select 1 from public.sites s where s.id = site_id and s.org_id = public.current_org()))
);

drop policy if exists uploads_all on public.uploads;
create policy uploads_all on public.uploads for all using (
  public.is_super_admin() or org_id = public.current_org()
) with check (true);

drop policy if exists oem_all on public.oem_integrations;
create policy oem_all on public.oem_integrations for all using (
  public.is_super_admin() or (org_id = public.current_org() and public.current_role() = 'epc_admin')
) with check (true);

-- Automatically create a profile row on new user signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), 'client')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────
-- STRING TELEMETRY (Added for Solis Cloud multi-string diagnostics)
-- ─────────────────────────────────────────────────────────
create table if not exists public.string_telemetry (
  id uuid primary key default gen_random_uuid(),
  string_id uuid not null references public.strings(id) on delete cascade,
  timestamp timestamptz not null,
  voltage_v numeric,
  current_a numeric,
  power_kw numeric,
  status text
);

create index if not exists idx_string_telemetry_string on public.string_telemetry(string_id);
create index if not exists idx_string_telemetry_timestamp on public.string_telemetry(timestamp desc);

alter table public.string_telemetry enable row level security;

drop policy if exists str_tel_select on public.string_telemetry;
create policy str_tel_select on public.string_telemetry for select using (
  public.is_super_admin() or exists (
    select 1 from public.strings str
    join public.inverters i on i.id = str.inverter_id
    join public.sites s on s.id = i.site_id
    where str.id = string_id and s.org_id = public.current_org()
  )
);

