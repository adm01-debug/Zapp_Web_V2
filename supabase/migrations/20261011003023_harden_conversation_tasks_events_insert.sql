-- harden_conversation_tasks_events_insert
-- Rollback: restaura as policies de INSERT de conversation_tasks e conversation_events
--   ao estado anterior e remove o trigger/funcao criados (nada de dado a desfazer).
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists trg_conversation_event_assign_performed_by on public.conversation_events;
--   drop function if exists public.conversation_event_assign_performed_by();
--   drop policy if exists "Authorized users can insert events" on public.conversation_events;
--   create policy "Authorized users can insert events" on public.conversation_events for insert to authenticated with check (((performed_by is null) or (performed_by = (select p.id from public.profiles p where p.user_id = auth.uid() limit 1))) and (public.is_admin_or_supervisor(auth.uid()) or (contact_id in (select c.id from public.contacts c where c.assigned_to = (select p.id from public.profiles p where p.user_id = auth.uid() limit 1)))));
--   drop policy if exists tasks_insert_own on public.conversation_tasks;
--   create policy tasks_insert_own on public.conversation_tasks for insert to authenticated with check (created_by = public.current_profile_id());
--
-- SEC-RLS_CONTATOS_MENSAGENS-06 e -09 (docs/audits/SEGURANCA_RLS_CONTATOS_MENSAGENS_2026-10-07.md).
--
-- 06 — conversation_tasks INSERT nao validava a visibilidade do contato: quem podia criar
--   a PROPRIA tarefa (created_by = current_profile_id()) podia aponta-la para QUALQUER
--   contato, mesmo um que nao enxerga. O guard de visibilidade existia so no UPDATE
--   (trg_prevent_conversation_task_field_forgery). Aqui o mesmo predicado entra no
--   WITH CHECK da policy de INSERT do dono. created_by NAO muda; contact_id nulo segue
--   valido (o app usa upsert/tarefa sem contato).
--
-- 09 — conversation_events INSERT aceitava performed_by nulo (evento de auditoria sem
--   ator) e o predicado de contato usava so o assigned_to direto, ignorando fila e
--   agente especial. Agora:
--     (a) trigger BEFORE INSERT amarra performed_by ao proprio perfil para chamador
--         nao privilegiado: NULL e preenchido com current_profile_id() (o app de
--         transferencia nao manda performed_by) e valor de terceiro e recusado. Admin/
--         supervisor e service_role/sistema seguem podendo deixar nulo.
--     (b) a policy de INSERT passa a usar is_contact_visible_to_user (carteira, fila,
--         agente especial e admin), superset estrito do predicado antigo.
-- Nada de DROP de coluna, DML, GRANT ou papel: so policy + trigger.

BEGIN;

-- ============================================================================
-- 1. conversation_tasks: INSERT exige contato visivel ao chamador
-- ============================================================================
DROP POLICY IF EXISTS tasks_insert_own ON public.conversation_tasks;
CREATE POLICY tasks_insert_own ON public.conversation_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = public.current_profile_id()
    AND (contact_id IS NULL OR public.is_contact_visible_to_user(contact_id, auth.uid()))
  );

-- ============================================================================
-- 2. conversation_events: performed_by amarrado ao chamador nao privilegiado
-- ============================================================================
CREATE OR REPLACE FUNCTION public.conversation_event_assign_performed_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- Só age quando há sessão de usuario (authenticated) e o chamador nao e admin/supervisor.
  -- service_role, cron (postgres) e chamadas de sistema tem auth.uid() nulo: passam.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
    IF NEW.performed_by IS NULL THEN
      NEW.performed_by := public.current_profile_id();
    ELSIF NEW.performed_by IS DISTINCT FROM public.current_profile_id() THEN
      RAISE EXCEPTION 'performed_by deve ser o usuario atual'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.conversation_event_assign_performed_by() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_conversation_event_assign_performed_by ON public.conversation_events;
CREATE TRIGGER trg_conversation_event_assign_performed_by
  BEFORE INSERT ON public.conversation_events
  FOR EACH ROW
  EXECUTE FUNCTION public.conversation_event_assign_performed_by();

-- ============================================================================
-- 3. conversation_events: policy de INSERT (visibilidade real + ator)
-- ============================================================================
DROP POLICY IF EXISTS "Authorized users can insert events" ON public.conversation_events;
CREATE POLICY "Authorized users can insert events" ON public.conversation_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_contact_visible_to_user(contact_id, auth.uid())
    AND (
      public.is_admin_or_supervisor(auth.uid())
      OR performed_by IS NOT DISTINCT FROM public.current_profile_id()
    )
  );

COMMIT;
