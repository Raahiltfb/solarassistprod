import urllib.request
import json
import ssl

SUPABASE_URL = "https://ylnmjvgnjootrkywbcsj.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def exec_sql(sql_str):
    url = f"{SUPABASE_URL}/rest/v1/rpc/exec_sql"
    req = urllib.request.Request(url, data=json.dumps({"sql": sql_str}).encode('utf-8'), headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json"
    }, method="POST")
    try:
        with urllib.request.urlopen(req, context=ctx) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code, e.read().decode('utf-8'))
        raise e

migration_sql = """
-- 1. Rename Heliogrid Energy organization to SolarAssist O&M
UPDATE public.organizations
SET name = 'SolarAssist O&M', slug = 'solarassist'
WHERE slug = 'heliogrid' OR name ILIKE '%heliogrid%';

-- 2. Grab SolarAssist O&M Organization ID
DO $$
DECLARE
  v_solarassist_org_id uuid;
BEGIN
  SELECT id INTO v_solarassist_org_id FROM public.organizations WHERE slug = 'solarassist' LIMIT 1;

  IF v_solarassist_org_id IS NOT NULL THEN
    -- Consolidate all sites under SolarAssist O&M
    UPDATE public.sites SET org_id = v_solarassist_org_id WHERE id IS NOT NULL;

    -- Consolidate all OEM integrations under SolarAssist O&M
    UPDATE public.oem_integrations SET org_id = v_solarassist_org_id WHERE id IS NOT NULL;

    -- Consolidate all work orders under SolarAssist O&M
    UPDATE public.work_orders SET org_id = v_solarassist_org_id WHERE id IS NOT NULL;

    -- Consolidate all daily routes under SolarAssist O&M
    UPDATE public.daily_routes SET org_id = v_solarassist_org_id WHERE id IS NOT NULL;

    -- Consolidate all tickets under SolarAssist O&M
    UPDATE public.tickets SET org_id = v_solarassist_org_id WHERE id IS NOT NULL;

    -- Consolidate all alerts under SolarAssist O&M
    UPDATE public.alerts SET org_id = v_solarassist_org_id WHERE id IS NOT NULL;

    -- Update profiles org_id
    UPDATE public.profiles SET org_id = v_solarassist_org_id WHERE role IN ('epc_admin', 'technician', 'client');
  END IF;
END $$;

-- 3. Update Profile & Auth Email references from @heliogrid.dev to @solarassist.dev
UPDATE public.profiles SET email = 'admin@solarassist.dev', full_name = 'SolarAssist Admin' WHERE email = 'admin@heliogrid.dev';
UPDATE public.profiles SET email = 'tech@solarassist.dev', full_name = 'SolarAssist Technician' WHERE email = 'tech@heliogrid.dev';
UPDATE public.profiles SET email = 'client@solarassist.dev', full_name = 'SolarAssist Client' WHERE email = 'client@heliogrid.dev';

UPDATE auth.users SET email = 'admin@solarassist.dev' WHERE email = 'admin@heliogrid.dev';
UPDATE auth.users SET email = 'tech@solarassist.dev' WHERE email = 'tech@heliogrid.dev';
UPDATE auth.users SET email = 'client@solarassist.dev' WHERE email = 'client@heliogrid.dev';

NOTIFY pgrst, 'reload schema';
"""

status = exec_sql(migration_sql)
print(f"Migration Executed with Status Code: {status}")
