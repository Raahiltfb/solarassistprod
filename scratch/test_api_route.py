import requests

wo_res = requests.get("http://localhost:3001/api/work-orders/00000000-0000-0000-0000-000000000000")
print(wo_res.status_code, wo_res.text)
