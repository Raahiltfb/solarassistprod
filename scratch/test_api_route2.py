import requests

wo_res = requests.get("http://localhost:3000/api/work-orders/f0aef3b7-31a3-4c2f-ba90-93de1f7f6e57")
print(wo_res.status_code)
if wo_res.status_code == 200:
    print(wo_res.json())
else:
    print("FAILED! Text:")
    print(wo_res.text[:500])
