import requests
import json
import os

def apply_migration():
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", ".env.local")
    env_vars = {}
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                if "=" in line and not line.startswith("#"):
                    k, v = line.strip().split("=", 1)
                    env_vars[k] = v.strip('"').strip("'")

    url = env_vars.get("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321")
    key = env_vars.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

    sql = """
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
        WITH b AS (
          SELECT
            to_char(
              date_trunc('hour', t.timestamp) + 
              (floor(extract(minute FROM t.timestamp) / 15) * 15 || ' minutes')::interval,
              'YYYY-MM-DD"T"HH24:MI:SS"Z"'
            ) AS b_time,
            COALESCE(SUM(t.ac_power_kw), 0) AS b_power,
            COALESCE(SUM(t.daily_generation_kwh), 0) AS b_gen
          FROM public.telemetry t
          WHERE t.inverter_id = ANY(p_inverter_ids)
            AND t.timestamp >= p_start_date
            AND t.timestamp <= p_end_date
          GROUP BY 1
        )
        SELECT
          b.b_time AS "timestamp",
          ROUND(b.b_power::numeric, 2) AS power,
          ROUND(b.b_gen::numeric, 2) AS generation,
          ROUND((b.b_gen / v_capacity)::numeric, 2) AS specific_yield
        FROM b
        ORDER BY b.b_time ASC;

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

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }

    res = requests.post(f"{url}/rest/v1/rpc/exec_sql", headers=headers, json={"sql": sql})
    print(f"Migration execution status: {res.status_code}")
    print(f"Response: {res.text}")

if __name__ == "__main__":
    apply_migration()
