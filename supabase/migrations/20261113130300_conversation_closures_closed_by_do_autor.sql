-- conversation_closures_closed_by_do_autor
-- Auditoria Conversas 2026-11-13, P1-5.
--
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists trg_conversation_closures_force_author on public.conversation_closures;
--   drop function if exists public.force_conversation_closure_author();
--   drop policy if exists "Agents can create closures for their contacts" on public.conversation_closures;
--   create policy "Agents can create closures for their contacts" on public.conversation_closures
--     for insert to authenticated with check (public.is_contact_visible_to_user(contact_id, auth.uid()));
--
-- O QUE ESTAVA ERRADO
--   A policy de INSERT só checava se o contato era visível; closed_by era livre. Um
--   INSERT direto (PostgREST) gravava encerramento "feito" por QUALQUER colega — e os
--   gatilhos de gamificação/indicadores contavam para ele.
--
-- O QUE MUDA
--   1. Gatilho BEFORE INSERT OR UPDATE OF closed_by: com sessão de usuário
--      (auth.uid() presente, papel não service_role), closed_by = perfil de quem está
--      logado — inclusive quando a gravação vem de RPC (close_conversation_atomic já
--      grava o próprio perfil; set_conversation_status gravava NULL e passa a gravar
--      o autor). UPDATE direto por authenticated/anon não troca o autor.
--      Jobs sem sessão (cron, service_role) seguem gravando o que informarem.
--   2. Policy de INSERT ganha "closed_by = perfil do usuário" (defesa em profundidade).
--
-- PÓS-CONDIÇÕES: gatilho e policy presentes.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $pre$
BEGIN
  IF to_regclass('public.conversation_closures') IS NULL
     OR to_regprocedure('public.get_profile_id_for_user(uuid)') IS NULL
     OR to_regprocedure('public.is_contact_visible_to_user(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'pre-condicao: conversation_closures/get_profile_id_for_user/is_contact_visible_to_user ausentes';
  END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.force_conversation_closure_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- SECURITY DEFINER: current_user aqui é o dono; o papel do cliente vem do JWT.
    IF COALESCE(auth.role(), '') IN ('authenticated', 'anon') THEN
      NEW.closed_by := OLD.closed_by;
    END IF;
    RETURN NEW;
  END IF;

  IF v_uid IS NOT NULL AND COALESCE(auth.role(), '') <> 'service_role' THEN
    NEW.closed_by := public.get_profile_id_for_user(v_uid);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.force_conversation_closure_author() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_conversation_closures_force_author ON public.conversation_closures;
CREATE TRIGGER trg_conversation_closures_force_author
BEFORE INSERT OR UPDATE OF closed_by ON public.conversation_closures
FOR EACH ROW
EXECUTE FUNCTION public.force_conversation_closure_author();

DROP POLICY IF EXISTS "Agents can create closures for their contacts" ON public.conversation_closures;
CREATE POLICY "Agents can create closures for their contacts"
ON public.conversation_closures FOR INSERT TO authenticated
WITH CHECK (
  public.is_contact_visible_to_user(contact_id, auth.uid())
  AND closed_by IS NOT DISTINCT FROM public.get_profile_id_for_user(auth.uid())
);

DO $post$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.conversation_closures'::regclass
       AND tgname = 'trg_conversation_closures_force_author'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'pos-condicao: gatilho de autor ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'conversation_closures'
       AND policyname = 'Agents can create closures for their contacts'
       AND with_check ILIKE '%get_profile_id_for_user%'
  ) THEN
    RAISE EXCEPTION 'pos-condicao: policy de INSERT sem checagem de autor';
  END IF;
END
$post$;

COMMIT;
