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
    const url = new URL(req.url);
    const secretParam = url.searchParams.get("secret");
    
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const cronSecret = Deno.env.get("CRON_SECRET");

    let isAuthorized = false;

    if (authHeader) {
      const parts = authHeader.split(" ");
      const token = parts.length > 1 ? parts[1] : parts[0];
      if (token && (token === serviceKey || token === cronSecret || token === anonKey)) {
        isAuthorized = true;
      }
    }

    if (secretParam && (secretParam === cronSecret || secretParam === serviceKey)) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let triggerSource = "manual";
    let oemFilter: string | null = url.searchParams.get("oem") || url.searchParams.get("oem_filter") || null;

    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.trigger_source) triggerSource = body.trigger_source;
        if (body.oem) oemFilter = body.oem;
        if (body.oem_filter) oemFilter = body.oem_filter;
      } catch (_) {
        // Fallback if request body is empty
      }
    } else {
      const sourceParam = url.searchParams.get("trigger_source");
      if (sourceParam) {
        triggerSource = sourceParam;
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration environment variables.");
    }

    console.log(`Starting sync trigger (Source: ${triggerSource}, OEM Filter: ${oemFilter || "all"})`);
    
    // Await execution synchronously to report output in response
    const syncRes = await pollAndSyncAll(supabaseUrl, supabaseServiceKey, triggerSource, oemFilter);

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
