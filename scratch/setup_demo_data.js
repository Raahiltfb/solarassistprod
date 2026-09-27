const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('frontend/.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, ...value] = line.split('=');
  if (key && !key.startsWith('#')) acc[key.trim()] = value.join('=').trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function setupDemo() {
  console.log("Starting demo setup...");

  // 1. Fetch or create Demo Organization (SolarAssist (Demo))
  let { data: org } = await sb.from('organizations').select('*').eq('slug', 'solarassist-demo').maybeSingle();
  if (!org) {
    const { data: newOrg } = await sb.from('organizations').insert({
      name: 'SolarAssist (Demo)',
      slug: 'solarassist-demo',
    }).select().single();
    org = newOrg;
  }
  console.log("Demo Org:", org.id);

  // 2. Find Ivy by courtyard
  const { data: site } = await sb.from('sites').select('*').ilike('name', '%Courtyard%').single();
  console.log("Found site:", site.id, site.name);

  // 3. Update site to Demo Org & set config
  await sb.from('sites').update({
    org_id: org.id,
    cleaning_cycle_days: 15,
    last_cleaned_on: '2026-09-14',
    next_cleaning_date: '2026-09-29'
  }).eq('id', site.id);
  console.log("Updated site org_id to Demo Org and set config.");

  // 3b. Install Postgres Trigger to permanently lock Demo Org sites from background OEM sync mutation
  const protectSql = `
  CREATE OR REPLACE FUNCTION protect_site_org_id()
  RETURNS TRIGGER AS $$
  BEGIN
    IF OLD.org_id = '${org.id}'::uuid AND NEW.org_id IS DISTINCT FROM OLD.org_id THEN
      NEW.org_id := OLD.org_id;
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS trg_protect_site_org_id ON sites;
  CREATE TRIGGER trg_protect_site_org_id
  BEFORE UPDATE ON sites
  FOR EACH ROW
  EXECUTE FUNCTION protect_site_org_id();
  `;
  await sb.rpc('exec_sql', { sql: protectSql });
  console.log("Installed Postgres trigger trg_protect_site_org_id.");

  // Also update or insert site_cleaning_rules
  const { error: ruleErr } = await sb.from('site_cleaning_rules').upsert({
    site_id: site.id,
    is_configured: true,
    normal_interval_days: 15,
    monsoon_interval_days: 30,
    monsoon_start_md: '06-01',
    monsoon_end_md: '08-31', // June to August
    allowed_weekdays: [1, 2, 3, 4, 5, 6], // Monday to Saturday
    estimated_cleaning_mins: 120, // 2 hours
    updated_at: new Date().toISOString()
  }, { onConflict: 'site_id' });
  console.log("Upserted cleaning rule:", ruleErr ? ruleErr : "Success");

  // 4. Create Users (Auth + Profiles)
  const usersToCreate = [
    { email: 'admin@demo.com', name: 'Demo Admin', role: 'epc_admin', org_id: org.id },
    { email: 'tech1@demo.com', name: 'Demo Tech 1', role: 'technician', org_id: org.id },
    { email: 'tech2@demo.com', name: 'Demo Tech 2', role: 'technician', org_id: org.id },
    { email: 'client@demo.com', name: 'Ivy Client', role: 'client', org_id: site.client_org_id } // Client should be in the client_org_id!
  ];

  const createdUsers = {};

  for (const u of usersToCreate) {
    // Check if profile exists
    let { data: profile } = await sb.from('profiles').select('*').eq('email', u.email).maybeSingle();
    
    if (!profile) {
      console.log(`Creating auth user ${u.email}...`);
      const { data: authUser, error: authErr } = await sb.auth.admin.createUser({
        email: u.email,
        password: 'password123',
        email_confirm: true,
      });
      if (authErr) {
        console.error("Auth error for", u.email, authErr);
        continue;
      }
      
      // Wait a moment for trigger to create profile, or we manually create/update it
      await new Promise(r => setTimeout(r, 1000));
      const { data: updatedProfile, error: profErr } = await sb.from('profiles').update({
        full_name: u.name,
        role: u.role,
        org_id: u.org_id
      }).eq('id', authUser.user.id).select().single();
      
      if (profErr) console.error("Profile update error:", profErr);
      profile = updatedProfile;
    } else {
      console.log(`Updating existing profile ${u.email}...`);
      await sb.from('profiles').update({
        full_name: u.name,
        role: u.role,
        org_id: u.org_id
      }).eq('id', profile.id);
    }
    createdUsers[u.email] = profile;
  }

  // 5. Create Team and Assign Techs
  if (createdUsers['tech1@demo.com'] && createdUsers['tech2@demo.com']) {
    let { data: team } = await sb.from('technician_teams').select('*').eq('name', 'Courtyard Ivy Team').maybeSingle();
    if (!team) {
      const { data: newTeam } = await sb.from('technician_teams').insert({
        org_id: org.id,
        name: 'Courtyard Ivy Team',
        is_active: true,
        base_address: 'Thane',
        color_code: '#10b981'
      }).select().single();
      team = newTeam;
    } else {
      await sb.from('technician_teams').update({ org_id: org.id }).eq('id', team.id);
    }
    
    console.log("Team:", team.id);

    // Delete existing members for this team
    await sb.from('technician_team_members').delete().eq('team_id', team.id);
    
    // Add Tech 1 and Tech 2
    await sb.from('technician_team_members').insert([
      { team_id: team.id, technician_id: createdUsers['tech1@demo.com'].id },
      { team_id: team.id, technician_id: createdUsers['tech2@demo.com'].id }
    ]);
    console.log("Team members assigned.");
  }

  // 6. Delete old demo data for Courtyard Ivy (Clean Slate for this site)
  await sb.from('work_orders').delete().eq('site_id', site.id);
  await sb.from('cleaning_logs').delete().eq('site_id', site.id);
  await sb.from('alerts').delete().eq('site_id', site.id);
  await sb.from('daily_routes').delete().eq('org_id', org.id); // Clear routes for the new org
  await sb.from('cleaning_plans').delete().eq('org_id', org.id); 
  
  console.log("Cleaned up old work orders/logs/alerts for Courtyard Ivy.");
  console.log("Demo setup complete! Users: admin@demo.com, tech1@demo.com, tech2@demo.com, client@demo.com (password: password123)");
}

setupDemo();
