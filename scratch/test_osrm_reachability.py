import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# Test points: 3 solar sites in Gujarat/Maharashtra, India
coords = "72.5714,23.0225;73.1812,22.3072;72.8777,19.0760"
url = f"https://router.project-osrm.org/table/v1/driving/{coords}?annotations=duration,distance"

print(f"Testing OSRM API reachability: {url}")
try:
    req = urllib.request.Request(url, headers={"User-Agent": "SolarAssistOSRMTest/1.0"})
    with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print("OSRM Response Code:", data.get("code"))
        print("OSRM Durations Matrix (mins):", [[round(d/60, 1) for d in row] for row in data.get("durations", [])])
        print("OSRM Distances Matrix (km):", [[round(d/1000, 1) for d in row] for row in data.get("distances", [])])
        print("OSRM API REACHABILITY: SUCCESSFUL & RESPONDING OK!")
except Exception as e:
    print("OSRM API REACHABILITY FAILED:", e)
