import os
import sys
import json
sys.path.append(os.path.join(os.getcwd(), "backend"))

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv("backend/.env")

from adapters.solis import SolisAdapter

key_id = os.getenv("SOLIS_KEY_ID")
key_secret = os.getenv("SOLIS_KEY_SECRET")
api_url = os.getenv("SOLIS_API_URL")
adapter = SolisAdapter(key_id=key_id, key_secret=key_secret, api_url=api_url)

user_stations_res = adapter._call_solis("/v1/api/userStationList", {"pageNo": "1", "pageSize": "100"})
stations = user_stations_res.get("data", {}).get("page", {}).get("records", [])

for st in stations:
    st_id = str(st.get("id"))
    st_name = st.get("stationName")
    if st_name in ["Dosti Jade Wing A", "Casa Florea", "Vijay Vatika Solar", "Regalia chs solar"]:
        res = adapter._call_solis("/v1/api/alarmList", {"pageNo": "1", "pageSize": "100", "stationId": st_id})
        recs = res.get("data", {}).get("records", []) if res.get("data") else []
        print(f"\n=================== Station: {st_name} (ID: {st_id}) ===================")
        for r in recs[:3]:
            print(json.dumps(r, indent=2))

