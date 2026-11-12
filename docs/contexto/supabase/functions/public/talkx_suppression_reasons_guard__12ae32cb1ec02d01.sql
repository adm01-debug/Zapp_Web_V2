CREATE OR REPLACE FUNCTION public.talkx_suppression_reasons_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_system AND current_user IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'talkx_suppression_reasons: motivo do sistema só nasce por migration'
        USING ERRCODE = '42501';
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
$function$
