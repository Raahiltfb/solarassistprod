import os
import sys
import json
sys.path.append(os.path.join(os.getcwd(), "backend"))

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv("backend/.env")

from adapters.solis import SolisAdapter

key_id = os.getenv("SOLIS_KEY_ID") or "1300386381678106385"
key_secret = os.getenv("SOLIS_KEY_SECRET") or "a21fcc244b2f4fe48097ceca92a1c160"
api_url = os.getenv("SOLIS_API_URL") or "https://www.soliscloud.com:13333"

adapter = SolisAdapter(key_id=key_id, key_secret=key_secret, api_url=api_url)

# Let's inspect Inverter ID: 1308675217950723534 (Solis-60K-4G)
res = adapter._call_solis("/v1/api/inverterDetail", {"id": "1308675217950723534"})
data = res.get("data", {})

print("--- ALL KEYS IN DATA ---")
print(sorted(list(data.keys())))
print("\n--- SPECIFIC FIELDS IN DATA ---")

# Let's search for MPPT keys
mppt_keys = [k for k in data.keys() if "mppt" in k.lower()]
print("MPPT Keys found:", mppt_keys)
for k in sorted(mppt_keys):
    if data[k] != 0 and data[k] != 0.0 and data[k] != "":
        print(f"  {k}: {data[k]} (type: {type(data[k])})")

# Let's search for AC keys
ac_keys = [k for k in data.keys() if "ac" in k.lower() or k.startswith("uA") or k.startswith("uB") or k.startswith("uC") or k.startswith("iA") or k.startswith("iB") or k.startswith("iC") or "fac" in k.lower()]
print("\nAC Keys found:", ac_keys)
for k in sorted(ac_keys):
    if data[k] != 0 and data[k] != 0.0 and data[k] != "":
        print(f"  {k}: {data[k]} (type: {type(data[k])})")

# Let's search for String/PV keys
pv_keys = [k for k in data.keys() if "pv" in k.lower()]
print("\nPV Keys found:", pv_keys)
for k in sorted(pv_keys):
    # Only print first few if many
    if "uPv" in k or "iPv" in k:
        if data[k] != 0 and data[k] != 0.0:
            print(f"  {k}: {data[k]} (type: {type(data[k])})")

# Save complete data to json for reference
with open("raw_inverter_detail.json", "w") as f:
    json.dump(data, f, indent=2)
print("\nSaved full raw response to raw_inverter_detail.json")
