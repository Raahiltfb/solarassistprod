import requests

# Test Work Order with service role key (should work now that RLS ambiguous join is fixed)
wo_res = requests.get("http://localhost:3000/api/work-orders/f0aef3b7-31a3-4c2f-ba90-93de1f7f6e57")
print("WO status:", wo_res.status_code)
if wo_res.status_code == 200:
    print("WO Success!")
else:
    print("WO Failed:", wo_res.text[:500])

