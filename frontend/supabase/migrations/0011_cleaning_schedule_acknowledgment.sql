-- Migration: Add cleaning_schedule_acknowledged_at to sites
alter table public.sites
  add column if not exists cleaning_schedule_acknowledged_at timestamptz;
