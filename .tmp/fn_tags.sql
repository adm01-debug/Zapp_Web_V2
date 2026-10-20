CREATE OR REPLACE FUNCTION public.enqueue_automation_events_on_tags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  -- Switch anti-laço (ação add_tag do próprio motor).
  IF current_setting('zapp.suppress_automation_events', true) IN ('on', 'true', '1') THEN
    RETURN NEW;
  END IF;
  IF NEW.tags IS NULL OR cardinality(NEW.tags) = 0 THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.automations a
     WHERE a.is_active AND a.trigger_type = 'tag_added'
  ) THEN
    RETURN NEW;
  END IF;

  -- Só os valores ACRESCENTADOS (diferença OLD→NEW), sem diferenciar caixa. Um INSERT ... SELECT
  -- (sem loop): o conjunto é o diff de UMA linha de public.contacts, não uma varredura de tabela.
  INSERT INTO public.automation_events (contact_id, trigger_type, trigger_ref, payload)
  SELECT DISTINCT NEW.id, 'tag_added', lower(t), jsonb_build_object('tag', t)
    FROM unnest(NEW.tags) AS t
   WHERE t IS NOT NULL
     AND btrim(t) <> ''
     AND NOT EXISTS (
       SELECT 1 FROM unnest(COALESCE(OLD.tags, '{}'::text[])) AS o
        WHERE lower(o) = lower(t)
     )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;
