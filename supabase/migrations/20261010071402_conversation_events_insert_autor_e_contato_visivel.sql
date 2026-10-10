-- Rollback: DROP TRIGGER trg_conversation_events_default_performed_by ON public.conversation_events; DROP FUNCTION public.conversation_events_default_performed_by(); DROP POLICY "Authorized users can insert events" ON public.conversation_events;
-- DROP TRIGGER IF EXISTS trg_conversation_events_default_performed_by ON public.conversation_events;
-- DROP FUNCTION IF EXISTS public.conversation_events_default_performed_by();
-- DROP POLICY IF EXISTS "Authorized users can insert events" ON public.conversation_events;
-- CREATE POLICY "Authorized users can insert events"
-- ON public.conversation_events
-- FOR INSERT
-- TO authenticated
-- WITH CHECK (
--   (performed_by IS NULL OR performed_by = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1))
--   AND (
--     is_admin_or_supervisor(auth.uid())
--     OR contact_id IN (
--       SELECT c.id FROM contacts c
--       WHERE c.assigned_to = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1)
--     )
--   )
-- );
--
-- N-143 (SEC-RLS_CONTATOS_MENSAGENS-09): evento de conversa so e gravado com o proprio autor
-- e para contato visivel ao usuario.
--
-- Defeito: a politica de INSERT aceitava performed_by NULL (evento "do sistema" forjado por
-- usuario autenticado) e media a visibilidade por contacts.assigned_to, ignorando o criterio
-- padrao is_contact_visible_to_user (carteira estendida, fila, admin/supervisor).
--
-- Correcao: (1) a politica passa a exigir performed_by = current_profile_id() e
-- is_contact_visible_to_user; (2) como o front (useConversationActions.transfer) insere sem
-- performed_by, um BEFORE INSERT preenche o autor com o perfil do chamador quando o JWT e de
-- usuario e o campo veio vazio. Escritas do servidor (service_role, triggers SECURITY DEFINER,
-- auth.uid() nulo) seguem livres para gravar evento sem autor.

CREATE OR REPLACE FUNCTION public.conversation_events_default_performed_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.performed_by IS NULL THEN
    NEW.performed_by := public.current_profile_id();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.conversation_events_default_performed_by()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_conversation_events_default_performed_by ON public.conversation_events;
CREATE TRIGGER trg_conversation_events_default_performed_by
BEFORE INSERT ON public.conversation_events
FOR EACH ROW EXECUTE FUNCTION public.conversation_events_default_performed_by();

DROP POLICY IF EXISTS "Authorized users can insert events" ON public.conversation_events;
CREATE POLICY "Authorized users can insert events"
ON public.conversation_events
FOR INSERT
TO authenticated
WITH CHECK (
  performed_by = public.current_profile_id()
  AND public.is_contact_visible_to_user(contact_id, auth.uid())
);
