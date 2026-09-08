import { pollAndSyncAll } from "./sync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    const secretParam = new URL(req.url).searchParams.get("secret");
    
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const cronSecret = Deno.env.get("CRON_SECRET");

    let isAuthorized = false;

    if (authHeader) {
      const parts = authHeader.split(" ");
      const token = parts.length > 1 ? parts[1] : parts[0];
      if (token && (token === serviceKey || token === cronSecret)) {
        isAuthorized = true;
      }
    }

    if (secretParam && secretParam === cronSecret) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let triggerSource = "manual";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        triggerSource = body.trigger_source || "manual";
      } catch (_) {
        // Fallback if request body is empty
      }
    } else {
      const sourceParam = new URL(req.url).searchParams.get("trigger_source");
      if (sourceParam) {
        triggerSource = sourceParam;
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration environment variables.");
    }

    console.log(`Starting sync trigger from source: ${triggerSource}`);
    
    // Await execution synchronously to report output in response
    const syncRes = await pollAndSyncAll(supabaseUrl, supabaseServiceKey, triggerSource);

    return new Response(JSON.stringify({ ok: true, result: syncRes }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("Edge function trigger error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
