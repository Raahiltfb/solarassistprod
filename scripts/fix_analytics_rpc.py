#!/usr/bin/env python3
"""
Solar Assist: Fix get_telemetry_analytics RPC
Resolves the 15x power, daily generation, and specific yield inflation
caused by summing multi-point intraday buckets instead of averaging power
and selecting peak cumulative running generation per inverter.
"""
import os
import sys
import time
import requests

def load_env(env_path: str):
    env = {}
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip("\"'")
    return env

def main():
    env = load_env("backend/.env.production.backup")
    url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key or "ylnmjvgnjootrkywbcsj" not in url:
        print("FATAL: Must target production project ylnmjvgnjootrkywbcsj")
        sys.exit(1)

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }

    updated_rpc_sql = """
    CREATE OR REPLACE FUNCTION public.get_telemetry_analytics(
      p_inverter_ids UUID[],
      p_range TEXT,
      p_start_date TIMESTAMPTZ,
      p_end_date TIMESTAMPTZ,
      p_total_capacity NUMERIC DEFAULT 1.0
    )
    RETURNS TABLE (
      "timestamp" TEXT,
      power NUMERIC,
      generation NUMERIC,
      specific_yield NUMERIC
    )
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      v_capacity NUMERIC;
    BEGIN
      v_capacity := COALESCE(NULLIF(p_total_capacity, 0), 1.0);

      IF p_range = 'today' THEN
        RETURN QUERY
        WITH inv_bucket AS (
          SELECT
            date_trunc('hour', t.timestamp) + 
            (floor(extract(minute FROM t.timestamp) / 15) * 15 || ' minutes')::interval AS b_time,
            t.inverter_id,
            AVG(t.ac_power_kw) AS inv_power,
            MAX(t.daily_generation_kwh) AS inv_gen
          FROM public.telemetry t
          WHERE t.inverter_id = ANY(p_inverter_ids)
            AND t.timestamp >= p_start_date
            AND t.timestamp <= p_end_date
          GROUP BY 1, 2
        ),
        site_bucket AS (
          SELECT
            to_char(b_time, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS b_time_str,
            COALESCE(SUM(inv_power), 0) AS site_power,
            COALESCE(SUM(inv_gen), 0) AS site_gen
          FROM inv_bucket
          GROUP BY 1
        )
        SELECT
          b_time_str AS "timestamp",
          ROUND(site_power::numeric, 2) AS power,
          ROUND(site_gen::numeric, 2) AS generation,
          ROUND((site_gen / v_capacity)::numeric, 2) AS specific_yield
        FROM site_bucket
        ORDER BY b_time_str ASC;

      ELSIF p_range = 'week' OR p_range = 'month' THEN
        RETURN QUERY
        WITH inv_daily AS (
          SELECT
            to_char(t.timestamp, 'YYYY-MM-DD') AS day_str,
            t.inverter_id,
            MAX(t.daily_generation_kwh) AS max_gen
          FROM public.telemetry t
          WHERE t.inverter_id = ANY(p_inverter_ids)
            AND t.timestamp >= p_start_date
            AND t.timestamp <= p_end_date
          GROUP BY 1, 2
        ),
        day_summary AS (
          SELECT
            day_str,
            COALESCE(SUM(max_gen), 0) AS day_gen
          FROM inv_daily
          GROUP BY 1
        )
        SELECT
          (d.day_str || 'T12:00:00Z') AS "timestamp",
          0::numeric AS power,
          ROUND(d.day_gen::numeric, 1) AS generation,
          ROUND((d.day_gen / v_capacity)::numeric, 2) AS specific_yield
        FROM day_summary d
        ORDER BY d.day_str ASC;

      ELSE -- 'year' or 'lifetime'
        RETURN QUERY
        WITH inv_daily AS (
          SELECT
            to_char(t.timestamp, 'YYYY-MM') AS month_str,
            to_char(t.timestamp, 'YYYY-MM-DD') AS day_str,
            t.inverter_id,
            MAX(t.daily_generation_kwh) AS max_gen
          FROM public.telemetry t
          WHERE t.inverter_id = ANY(p_inverter_ids)
            AND t.timestamp >= p_start_date
            AND t.timestamp <= p_end_date
          GROUP BY 1, 2, 3
        ),
        month_summary AS (
          SELECT
            month_str,
            COALESCE(SUM(max_gen), 0) AS month_gen
          FROM inv_daily
          GROUP BY 1
        )
        SELECT
          (m.month_str || '-01T12:00:00Z') AS "timestamp",
          0::numeric AS power,
          ROUND(m.month_gen::numeric, 1) AS generation,
          ROUND((m.month_gen / v_capacity)::numeric, 2) AS specific_yield
        FROM month_summary m
        ORDER BY m.month_str ASC;

      END IF;
    END;
    $$;
    """

    print("Deploying updated get_telemetry_analytics to Production...")
    r = requests.post(f"{url}/rest/v1/rpc/exec_sql", headers=headers, json={"sql": updated_rpc_sql})
    if r.status_code not in (200, 204):
        print(f"FAILED to update function: {r.status_code} {r.text}")
        sys.exit(1)
    print("Function updated successfully.")

    print("Reloading PostgREST schema cache...")
    requests.post(f"{url}/rest/v1/rpc/exec_sql", headers=headers, json={"sql": "NOTIFY pgrst, 'reload schema';"})
    time.sleep(2)
    print("PostgREST schema cache reloaded.")

if __name__ == "__main__":
    main()

