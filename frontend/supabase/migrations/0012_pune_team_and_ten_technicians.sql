-- 0012_pune_team_and_ten_technicians.sql
-- Configure 5 operational workforce teams (Team A - Team D for Mumbai/MMR, Team E for Pune)
-- Ensure 10 dedicated technicians (Tech 1 to Tech 10) paired 2-per-team

do $$
declare
  solarassist_org_id uuid := 'ac763745-aed5-469d-9956-459fb00a337e';
  
  t1_id uuid;
  t2_id uuid;
  t3_id uuid;
  t4_id uuid;
  t5_id uuid := gen_random_uuid();

  tech1_id uuid;
  tech2_id uuid;
  tech3_id uuid;
  tech4_id uuid;
  tech5_id uuid;
  tech6_id uuid;
  tech7_id uuid;
  tech8_id uuid;
  tech9_id uuid;
  tech10_id uuid;
  legacy_tech_id uuid;
begin
  -- 1. Remove legacy tech@solarassist.dev
  select id into legacy_tech_id from public.profiles where email = 'tech@solarassist.dev' limit 1;
  if legacy_tech_id is not null then
    delete from public.technician_team_members where technician_id = legacy_tech_id;
    delete from public.profiles where id = legacy_tech_id;
    delete from auth.users where id = legacy_tech_id;
  end if;

  -- 2. Fetch or identify teams
  select id into t1_id from public.technician_teams where org_id = solarassist_org_id order by created_at asc limit 1 offset 0;
  select id into t2_id from public.technician_teams where org_id = solarassist_org_id order by created_at asc limit 1 offset 1;
  select id into t3_id from public.technician_teams where org_id = solarassist_org_id order by created_at asc limit 1 offset 2;
  select id into t4_id from public.technician_teams where org_id = solarassist_org_id order by created_at asc limit 1 offset 3;

  -- Update existing 4 teams
  if t1_id is not null then
    update public.technician_teams set name = 'Team A', base_address = 'Navi Mumbai Hub', base_latitude = 19.2183, base_longitude = 72.9781, color_code = '#3b82f6', is_active = true where id = t1_id;
  end if;
  if t2_id is not null then
    update public.technician_teams set name = 'Team B', base_address = 'Malad West Hub', base_latitude = 19.1860, base_longitude = 72.8485, color_code = '#10b981', is_active = true where id = t2_id;
  end if;
  if t3_id is not null then
    update public.technician_teams set name = 'Team C', base_address = 'Dadar Central Hub', base_latitude = 19.0770, base_longitude = 72.9980, color_code = '#f59e0b', is_active = true where id = t3_id;
  end if;
  if t4_id is not null then
    update public.technician_teams set name = 'Team D', base_address = 'Panvel Hub', base_latitude = 19.2403, base_longitude = 73.1305, color_code = '#8b5cf6', is_active = true where id = t4_id;
  end if;

  -- Insert Team E (Pune) if not exists
  insert into public.technician_teams (id, org_id, name, base_address, base_latitude, base_longitude, color_code, is_active)
  values (t5_id, solarassist_org_id, 'Team E (Pune)', 'Pune Hub', 18.5204, 73.8567, '#ec4899', true)
  on conflict do nothing;

  -- 3. Pair 2 technicians per team in technician_team_members
  select id into tech1_id from public.profiles where email = 'tech1@solarassist.dev' limit 1;
  select id into tech2_id from public.profiles where email = 'tech2@solarassist.dev' limit 1;
  select id into tech3_id from public.profiles where email = 'tech3@solarassist.dev' limit 1;
  select id into tech4_id from public.profiles where email = 'tech4@solarassist.dev' limit 1;
  select id into tech5_id from public.profiles where email = 'tech5@solarassist.dev' limit 1;
  select id into tech6_id from public.profiles where email = 'tech6@solarassist.dev' limit 1;
  select id into tech7_id from public.profiles where email = 'tech7@solarassist.dev' limit 1;
  select id into tech8_id from public.profiles where email = 'tech8@solarassist.dev' limit 1;
  select id into tech9_id from public.profiles where email = 'tech9@solarassist.dev' limit 1;
  select id into tech10_id from public.profiles where email = 'tech10@solarassist.dev' limit 1;

  delete from public.technician_team_members where team_id in (select id from public.technician_teams where org_id = solarassist_org_id);

  if t1_id is not null and tech1_id is not null and tech2_id is not null then
    insert into public.technician_team_members (team_id, technician_id) values (t1_id, tech1_id), (t1_id, tech2_id);
  end if;

  if t2_id is not null and tech3_id is not null and tech4_id is not null then
    insert into public.technician_team_members (team_id, technician_id) values (t2_id, tech3_id), (t2_id, tech4_id);
  end if;

  if t3_id is not null and tech5_id is not null and tech6_id is not null then
    insert into public.technician_team_members (team_id, technician_id) values (t3_id, tech5_id), (t3_id, tech6_id);
  end if;

  if t4_id is not null and tech7_id is not null and tech8_id is not null then
    insert into public.technician_team_members (team_id, technician_id) values (t4_id, tech7_id), (t4_id, tech8_id);
  end if;

  select id into t5_id from public.technician_teams where org_id = solarassist_org_id and name = 'Team E (Pune)' limit 1;
  if t5_id is not null and tech9_id is not null and tech10_id is not null then
    insert into public.technician_team_members (team_id, technician_id) values (t5_id, tech9_id), (t5_id, tech10_id);
  end if;
end $$;
