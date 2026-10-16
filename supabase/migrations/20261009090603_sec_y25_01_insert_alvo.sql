-- sec_y25_01_insert_alvo
-- Rollback: recria as três policies de INSERT com o texto anterior (abaixo) e dropa o gatilho e a função novos.
-- Rollback (SQL executável, na ordem):
--   DROP TRIGGER IF EXISTS trg_prevent_call_contact_redirect ON public.calls;
--   DROP FUNCTION IF EXISTS public.prevent_call_contact_redirect();
--   DROP POLICY IF EXISTS "Authenticated can insert deal activities" ON public.deal_activities;
--   CREATE POLICY "Authenticated can insert deal activities" ON public.deal_activities FOR INSERT TO authenticated WITH CHECK (performed_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()));
--   DROP POLICY IF EXISTS "Users can insert calls" ON public.calls;
--   CREATE POLICY "Users can insert calls" ON public.calls FOR INSERT TO authenticated WITH CHECK (agent_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()));
--   DROP POLICY IF EXISTS tasks_insert_own ON public.conversation_tasks;
--   CREATE POLICY tasks_insert_own ON public.conversation_tasks FOR INSERT TO authenticated WITH CHECK (created_by = public.current_profile_id());
--
-- SEC-RLS_TAREFAS_EMAIL_LIGACOES-01 (P0), de docs/audits/SEGURANCA_RLS_TAREFAS_EMAIL_LIGACOES_2026-10-07.md.
--
-- Defeito: o INSERT de `deal_activities`, `calls` e `conversation_tasks` validava só o AUTOR
-- (`performed_by` / `agent_id` / `created_by`), nunca o ALVO (`deal_id` / `contact_id`). Um usuário
-- autenticado qualquer gravava item de histórico apontando para negócio/contato fora do seu escopo,
-- e o cliente não tem UPDATE/DELETE nessas tabelas para desfazer. A trilha de auditoria de negócio
-- (visível ao dono do negócio e a admins) aceitava linha de terceiro.
--
-- Correção: o ALVO passa a ser exigido pela MESMA noção de escopo usada no resto do sistema.
--   1. deal_activities: negócio do próprio agente (`sales_deals.assigned_to` = perfil do chamador),
--      que é a mesma noção da policy de SELECT "Agents can view activities on their deals"
--      (20260404155608); admin/supervisor segue liberado.
--   2. calls: contato visível ao chamador por `is_contact_visible_to_user` — o predicado canônico de
--      visibilidade de contato (20260909200000, o mesmo de `contact_notes`). Chamada sem contato
--      (número desconhecido / entrada de provedor reconciliada) continua permitida.
--   3. conversation_tasks: idem, com tarefa pessoal (sem contato) ainda permitida. O gatilho
--      `trg_prevent_conversation_task_field_forgery` só cobre UPDATE; este INSERT é o que faltava.
--
-- `calls` tem um segundo caminho do mesmo defeito: o alvo TAMBÉM muda por UPDATE. A RPC
-- `upsert_my_call` (20260926800000) grava com `INSERT ... ON CONFLICT (id) DO UPDATE SET
-- contact_id = coalesce(excluded.contact_id, calls.contact_id)` — e o ramo de UPDATE é julgado
-- pela policy de UPDATE, não pelo WITH CHECK do INSERT. Por isso o item 4: gatilho BEFORE UPDATE
-- que valida o contato novo. A policy de UPDATE de `calls` não serve para isto (ela só tem USING,
-- aplicado também à linha nova, o que travaria o UPDATE de status de qualquer chamada legada cuja
-- linha aponte para contato hoje fora do alcance). O caminho de sistema (webhook de entrada, RPC
-- SECURITY DEFINER chamada por service_role — 20261004172554) roda como `postgres`/`service_role`
-- e é preservado pelo teste de papel no gatilho.
--
-- O autor continua obrigatório como antes; nada de GRANT a papel, coluna ou outra tabela muda aqui.

BEGIN;

-- 1. deal_activities: só negócio do próprio agente, ou admin/supervisor.
DROP POLICY IF EXISTS "Authenticated can insert deal activities" ON public.deal_activities;
CREATE POLICY "Authenticated can insert deal activities" ON public.deal_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    OR (
      performed_by = public.get_profile_id_for_user(auth.uid())
      AND deal_id IN (
        SELECT deal.id
        FROM public.sales_deals AS deal
        WHERE deal.assigned_to = public.get_profile_id_for_user(auth.uid())
      )
    )
  );

-- 2. calls: contato visível ao chamador (ou sem contato); autor obrigatório.
DROP POLICY IF EXISTS "Users can insert calls" ON public.calls;
CREATE POLICY "Users can insert calls" ON public.calls
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    OR (
      agent_id IN (SELECT profile.id FROM public.profiles AS profile WHERE profile.user_id = auth.uid())
      AND (contact_id IS NULL OR public.is_contact_visible_to_user(contact_id, auth.uid()))
    )
  );

-- 3. conversation_tasks: contato visível ao chamador (ou tarefa pessoal, sem contato).
DROP POLICY IF EXISTS tasks_insert_own ON public.conversation_tasks;
CREATE POLICY tasks_insert_own ON public.conversation_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = public.current_profile_id()
    AND (contact_id IS NULL OR public.is_contact_visible_to_user(contact_id, auth.uid()))
  );

-- 4. calls: o alvo não muda de dono. Gatilho INVOKER (o dono da função seria `postgres` e o
--    teste de papel abaixo nunca barraria) que só age quando `contact_id` MUDA — update de
--    status da chamada não passa por aqui, então linha legada não é afetada.
CREATE OR REPLACE FUNCTION public.prevent_call_contact_redirect()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $f$
BEGIN
  -- Caminho de sistema: webhook/RPC SECURITY DEFINER (dono `postgres`) e cliente service_role
  -- (edge function). O chamador final ali é o provedor, não um usuário logado.
  IF current_user IN ('postgres', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF NEW.contact_id IS DISTINCT FROM OLD.contact_id
     AND NEW.contact_id IS NOT NULL
     AND NOT public.is_contact_visible_to_user(NEW.contact_id, auth.uid())
  THEN
    RAISE EXCEPTION 'Sem permissao para apontar a chamada para este contato'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$f$;

REVOKE ALL ON FUNCTION public.prevent_call_contact_redirect()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prevent_call_contact_redirect ON public.calls;
CREATE TRIGGER trg_prevent_call_contact_redirect
  BEFORE UPDATE ON public.calls
  FOR EACH ROW
  WHEN (NEW.contact_id IS DISTINCT FROM OLD.contact_id)
  EXECUTE FUNCTION public.prevent_call_contact_redirect();

COMMIT;
