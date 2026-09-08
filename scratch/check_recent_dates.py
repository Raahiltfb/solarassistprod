import os
import sys
sys.path.append(os.path.join(os.getcwd(), "backend"))

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv("backend/.env")

from adapters.solis import SolisAdapter

adapter = SolisAdapter(
    key_id=os.getenv("SOLIS_KEY_ID"),
    key_secret=os.getenv("SOLIS_KEY_SECRET"),
    api_url=os.getenv("SOLIS_API_URL")
)

inv_id = "1308675217950723534"
inv_sn = "110690218030009"

dates = ["2026-08-20", "2026-08-18", "2026-08-15", "2026-08-01", "2026-07-15", "2026-06-15", "2026-05-15"]

for dt in dates:
    res = adapter._call_solis("/v1/api/inverterDay", {
        "id": inv_id,
        "sn": inv_sn,
        "money": "INR",
        "time": dt,
        "timeZone": 5.5
    })
    count = len(res.get("data", [])) if isinstance(res.get("data"), list) else -1
    print(f"Date: {dt} | Code: {res.get('code')} | Msg: {res.get('msg')} | Count: {count}")
