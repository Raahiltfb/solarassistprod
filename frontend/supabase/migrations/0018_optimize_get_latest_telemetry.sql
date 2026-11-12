-- Migration 0018: Optimize get_latest_telemetry to prevent statement timeouts
-- Replaces DISTINCT ON (which performs full table scan on telemetry table with 600k+ rows)
-- with a LATERAL query that does instantaneous index seeks for each inverter.

CREATE OR REPLACE FUNCTION public.get_latest_telemetry(inverter_ids uuid[])
RETURNS SETOF public.telemetry
LANGUAGE sql
STABLE
AS $func$
  SELECT t.*
  FROM unnest(inverter_ids) AS inv(id)
  CROSS JOIN LATERAL (
    SELECT *
    FROM public.telemetry
    WHERE inverter_id = inv.id
    ORDER BY timestamp DESC
    LIMIT 1
  ) t;
$func$;

