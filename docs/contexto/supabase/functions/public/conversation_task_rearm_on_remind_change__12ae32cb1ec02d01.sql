CREATE OR REPLACE FUNCTION public.conversation_task_rearm_on_remind_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- O WHEN do gatilho ja garante que NEW.remind_at mudou. Aqui so decidimos se quem escreveu
  -- disse algo proprio sobre notified_at: se disse (e diferente do atual), e ele quem manda
  -- (restoreSnapshot do undo); se nao disse, o carimbo antigo nao vale mais para o alarme novo.
  IF NEW.notified_at IS NOT DISTINCT FROM OLD.notified_at THEN
    NEW.notified_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$
