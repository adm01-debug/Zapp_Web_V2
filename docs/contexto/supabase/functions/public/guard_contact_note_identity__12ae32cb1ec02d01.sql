CREATE OR REPLACE FUNCTION public.guard_contact_note_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Sinal transacional escrito SOMENTE por public.merge_contacts_atomic: ali a reatribuicao
  -- de contact_id e a operacao autorizada de mesclagem. Sem o sinal (qualquer UPDATE direto),
  -- cai na checagem abaixo e NEGA.
  IF current_setting('app.contact_merge_identity', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF (NEW.contact_id, NEW.author_id)
    IS DISTINCT FROM (OLD.contact_id, OLD.author_id) THEN
    RAISE EXCEPTION 'contact note identity is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$
