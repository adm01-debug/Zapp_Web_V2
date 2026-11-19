CREATE OR REPLACE FUNCTION public.messages_sla_first_response_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Instante da resposta = quando a mensagem EFETIVAMENTE saiu (status sent),
  -- nao quando foi criada. O created_at segue como fronteira de ordenacao.
  PERFORM public.register_first_response_internal(
    NEW.contact_id,
    coalesce(NEW.status_updated_at, NEW.created_at),
    NEW.created_at
  );
  RETURN NULL;
END;
$function$
