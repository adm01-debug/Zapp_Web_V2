-- lembrete_mensagem_responder_depois
-- Rollback: dropa a RPC, o indice e a coluna message_id de conversation_tasks.
-- Rollback (SQL executável, na ordem):
--   DROP FUNCTION IF EXISTS public.remind_me_about_message(uuid, timestamptz, text);
--   DROP INDEX IF EXISTS public.idx_tasks_owner_message;
--   ALTER TABLE public.conversation_tasks DROP COLUMN IF EXISTS message_id;

-- 'Responder depois' da mensagem: agenda um lembrete para o proprio usuario
-- voltar a mensagem. A V2 unificou lembretes em public.conversation_tasks
-- (20260928140000) e e o cron tasks-notify-due -> notify_due_tasks() quem
-- entrega (20260928140100); o cron notify-due-reminders de public.reminders
-- foi DESAGENDADO nessa mesma migracao (20260928140100:56-59) e a tabela nao
-- tem mais leitor em src/ nem em supabase/functions. Por isso o lembrete
-- nasce como tarefa do dono (unico caminho entregue hoje), e nao em reminders.
--
--   * conversation_tasks ganha message_id ADITIVO e anulavel (FK para messages,
--     ON DELETE SET NULL) + indice parcial — o vinculo com a mensagem que faltava.
--   * remind_me_about_message(p_message_id, p_remind_at, p_note): SECURITY
--     DEFINER, exige que a mensagem exista E que seu contato esteja visivel ao
--     chamador (is_contact_visible_to_user) — inexistente e sem acesso respondem
--     o MESMO erro, sem oraculo de enumeracao. remind_at no futuro, ate 90 dias.
--     O dono e sempre o chamador (created_by = current_profile_id()); nao ha
--     parametro de dono. Nenhum texto de mensagem e lido ou gravado.

BEGIN;

ALTER TABLE public.conversation_tasks
  ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_owner_message
  ON public.conversation_tasks (created_by, message_id)
  WHERE message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.remind_me_about_message(
  p_message_id uuid,
  p_remind_at timestamptz,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_profile_id uuid;
  v_contact_id uuid;
  v_title      text;
  v_task_id    uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;

  -- Janela do lembrete: futuro e no maximo 90 dias.
  IF p_remind_at IS NULL OR p_remind_at <= now() THEN
    RAISE EXCEPTION 'remind_at_in_past' USING ERRCODE = '22023';
  END IF;
  IF p_remind_at > now() + interval '90 days' THEN
    RAISE EXCEPTION 'remind_at_too_far' USING ERRCODE = '22023';
  END IF;

  -- So o contato da mensagem e lido, nunca o texto (PII fora de log).
  SELECT m.contact_id INTO v_contact_id
  FROM public.messages AS m
  WHERE m.id = p_message_id;

  -- Mensagem inexistente e contato oculto respondem o MESMO erro.
  IF v_contact_id IS NULL
     OR NOT public.is_contact_visible_to_user(v_contact_id, v_caller) THEN
    RAISE EXCEPTION 'message_not_visible' USING ERRCODE = '42501';
  END IF;

  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = '42501';
  END IF;

  v_title := COALESCE(NULLIF(btrim(COALESCE(p_note, '')), ''), 'Responder depois');

  INSERT INTO public.conversation_tasks
    (title, description, remind_at, contact_id, message_id, created_by, status)
  VALUES
    (v_title, NULL, p_remind_at, v_contact_id, p_message_id, v_profile_id, 'todo')
  RETURNING id INTO v_task_id;

  RETURN v_task_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.remind_me_about_message(uuid, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remind_me_about_message(uuid, timestamptz, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.remind_me_about_message(uuid, timestamptz, text) TO authenticated;

COMMIT;
