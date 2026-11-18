DO $precond$
DECLARE
  v_dups text;
BEGIN
  SELECT string_agg(l, ', ') INTO v_dups
    FROM (SELECT lower(btrim(label)) AS l
            FROM public.talkx_suppression_reasons
           GROUP BY 1
          HAVING count(*) > 1) AS d;
  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_suppression_reasons: rótulos duplicados (lower/btrim) — corrigir antes: %', v_dups
      USING ERRCODE = '23505';
  END IF;
END;
$precond$

CREATE OR REPLACE FUNCTION public.talkx_suppression_reasons_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_system AND current_user IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'talkx_suppression_reasons: motivo do sistema só nasce por migration'
        USING ERRCODE = '42501';
    END IF;
    -- Autor não é escolhido pelo cliente: sobrescreve o created_by enviado.
    IF current_user IN ('authenticated', 'anon') THEN
      NEW.created_by := auth.uid();
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.code IS DISTINCT FROM NEW.code THEN
    RAISE EXCEPTION 'talkx_suppression_reasons: code imutável após criação'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.is_system IS DISTINCT FROM NEW.is_system THEN
    RAISE EXCEPTION 'talkx_suppression_reasons: is_system imutável após criação'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.is_system AND OLD.label IS DISTINCT FROM NEW.label THEN
    RAISE EXCEPTION 'talkx_suppression_reasons: label de motivo do sistema é imutável'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.is_system AND NOT NEW.active THEN
    RAISE EXCEPTION 'talkx_suppression_reasons: motivo do sistema não pode ser desativado'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$

REVOKE ALL ON FUNCTION public.talkx_suppression_reasons_guard() FROM PUBLIC, anon, authenticated

CREATE UNIQUE INDEX IF NOT EXISTS talkx_suppression_reasons_label_lower_key
  ON public.talkx_suppression_reasons (lower(btrim(label)))

CREATE INDEX IF NOT EXISTS idx_talkx_blacklist_reason_code
  ON public.talkx_blacklist (reason_code)
