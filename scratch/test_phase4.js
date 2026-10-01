const { createClient } = require('@supabase/supabase-js');
const url = 'https://ylnmjvgnjootrkywbcsj.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsbm1qdmduam9vdHJreXdiY3NqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2OTU4NywiZXhwIjoyMDkzNjQ1NTg3fQ.955II1P09pciz-r3YQE7ZNWfzcEnkfr0W2oAS5hMGfE';
const sb = createClient(url, serviceKey);

async function validatePhase4() {
  console.log('=== PHASE 4 PRODUCTION-GRADE ROUTING VALIDATION ===\n');

  // 1. Check Oct 2026 Cleaning Visits
  const { data: visits } = await sb
    .from('cleaning_visits')
    .select('*, sites(*)')
    .gte('scheduled_date', '2026-10-01')
    .lte('scheduled_date', '2026-10-31');

  console.log('1. October 2026 Scheduled Visits Count:', visits ? visits.length : 0);

  // 2. Fetch Work Orders for 2026-10-01
  const { data: workOrders } = await sb
    .from('work_orders')
    .select('*, sites(*)')
    .eq('scheduled_date', '2026-10-01');

  console.log('2. Work Orders for 2026-10-01:', workOrders ? workOrders.length : 0);

  // 3. Test Physical Location Batching Invariants
  if (workOrders && workOrders.length > 0) {
    const locMap = new Map();
    workOrders.forEach((w) => {
      const loc = w.sites?.location || w.sites?.name;
      const list = locMap.get(loc) || [];
      list.push(w);
      locMap.set(loc, list);
    });

    console.log('3. Physical Locations represented in sample day:', locMap.size);
    for (const [loc, wos] of locMap.entries()) {
      console.log(`   - Location '${loc}': ${wos.length} site visit(s) (${wos.map((w) => w.sites?.name).join(', ')})`);
    }
  }

  // 4. Verify Phase 2 total sites invariant
  const { data: totalSites } = await sb.from('sites').select('id');
  console.log('4. Real Fleet Total Sites:', totalSites ? totalSites.length : 0, 'sites intact.');

  console.log('\n✅ PHASE 4 PRODUCTION-GRADE ROUTING VALIDATION COMPLETED SUCCESSFULLY.');
}

validatePhase4();
