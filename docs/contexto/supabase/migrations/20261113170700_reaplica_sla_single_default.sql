SET LOCAL lock_timeout = '3s'

SET search_path = public, pg_temp

ALTER TABLE public.sla_configurations
  DISABLE TRIGGER "update_sla_configurations_updated_at"

WITH keeper AS (
  SELECT d.id
    FROM public.sla_configurations AS d
   WHERE d.is_default IS TRUE
     AND d.is_active IS TRUE
   ORDER BY d.updated_at DESC, d.created_at ASC, d.id ASC
   LIMIT 1
)
UPDATE public.sla_configurations AS s
   SET is_default = false
  FROM keeper AS k
 WHERE s.is_default IS TRUE
   AND s.is_active IS TRUE
   AND s.id <> k.id

ALTER TABLE public.sla_configurations
  ENABLE TRIGGER "update_sla_configurations_updated_at"

CREATE UNIQUE INDEX IF NOT EXISTS sla_configurations_single_active_default_idx
  ON public.sla_configurations (is_default)
  WHERE is_default IS TRUE
    AND is_active IS TRUE
