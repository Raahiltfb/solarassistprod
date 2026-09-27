import os
from supabase import create_client

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

# Need service key to bypass RLS for setup
# Let's read from .env.local
env_vars = {}
with open("frontend/.env.local") as f:
    for line in f:
        if "=" in line:
            k, v = line.strip().split("=", 1)
            env_vars[k] = v.strip('"')

sb = create_client(env_vars["NEXT_PUBLIC_SUPABASE_URL"], env_vars["SUPABASE_SERVICE_ROLE_KEY"])

def run():
    # Find Courtyard Ivy site
    res = sb.table("sites").select("*").ilike("name", "%Courtyard%").execute()
    print("Found Sites:", res.data)
    
run()
