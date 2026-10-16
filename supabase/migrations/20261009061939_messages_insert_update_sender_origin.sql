-- Rollback: DROP POLICY IF EXISTS "Users can update messages from their assigned contacts" ON public.messages; CREATE POLICY "Users can update messages from their assigned contacts" ON public.messages FOR UPDATE TO authenticated USING ((contact_id IN (SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid())))) OR is_admin_or_supervisor(auth.uid()) OR (EXISTS (SELECT 1 FROM contacts c JOIN queue_members qm ON qm.queue_id = c.queue_id WHERE c.id = messages.contact_id AND qm.profile_id = get_profile_id_for_user(auth.uid()) AND qm.is_active = true))); DROP POLICY IF EXISTS "Users can insert messages" ON public.messages; CREATE POLICY "Users can insert messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()) OR ((agent_id IS NULL OR agent_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())) AND (contact_id IN (SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))) OR EXISTS (SELECT 1 FROM contacts c JOIN queue_members qm ON qm.queue_id = c.queue_id WHERE c.id = messages.contact_id AND qm.profile_id = get_profile_id_for_user(auth.uid()) AND qm.is_active = true)))); DROP FUNCTION IF EXISTS public.message_sender_atual(uuid);
--
-- SEC-RLS_CONTATOS_MENSAGENS-01 (docs/audits/SEGURANCA_RLS_CONTATOS_MENSAGENS_2026-10-07.md):
-- a ORIGEM da mensagem (sender) passa a ser do banco, nao do cliente. O papel
-- autenticado nao insere linha com sender='contact' (mensagem de cliente
-- forjada) nem troca a origem de uma linha existente.
--
-- Estado anterior (as duas policies de `messages`, nenhuma olhava `sender`):
--   - INSERT "Users can insert messages", corpo de
--     20260925120000_fix_messages_insert_rls_contact_visibility.sql: validava
--     agent_id e contato visivel; a coluna so tem CHECK (sender IN
--     ('agent','contact')) — as duas origens passavam.
--   - UPDATE "Users can update messages from their assigned contacts", USING de
--     20260925223000_messages_update_policy_queue_parity.sql e SEM WITH CHECK:
--     o Postgres usa a propria USING no registro novo, que so fala de contato
--     visivel — nem a origem, nem o contato do novo registro eram conferidos.
--
-- O que esta migration muda (so `messages` e duas policies + 1 helper):
--   1. INSERT: exige sender='agent' para o chamador comum. O ramo
--      public.is_privileged_contact_caller() mantem a ingestao inbound
--      (service_role/cron/postgres) e o ramo de admin/supervisor segue valendo.
--   2. UPDATE: WITH CHECK explicito. A visibilidade do registro NOVO passa a ser
--      conferida (antes so a do antigo) e a origem fica PINada:
--      sender IS NOT DISTINCT FROM public.message_sender_atual(messages.id).
--      O plano pedia `sender = 'agent'` aqui; medido, ele nao fecha o vetor e
--      quebra o uso legitimo: (a) aceita virar mensagem de ENTRADA em resposta
--      do atendente (o registro novo e sender='agent'), que e justamente o SLA
--      falso; e (b) recusa "marcar como lido" de mensagem de entrada, que o
--      inbox faz direto pelo REST (src/services/chat.service.ts:101,
--      src/services/realtime.service.ts:212, src/hooks/inbox/useInboxBulkActions.ts:57).
--      O pin fecha as DUAS direcoes e preserva is_read/is_deleted/content/
--      transcription/link_preview/status.
--   3. public.message_sender_atual(uuid): helper STABLE SECURITY DEFINER que
--      devolve a origem ATUAL de uma mensagem VISIVEL ao chamador. Existe porque
--      uma policy de UPDATE nao enxerga o registro antigo; subquery direta na
--      propria `messages` dentro do WITH CHECK entra em recursao (42P17,
--      "infinite recursion detected in policy"). Devolve NULL para id
--      inexistente OU fora do alcance (mesma resposta: nao cria oraculo de
--      enumeracao de id).
--
-- Nada de GRANT/REVOKE em tabela ou papel existente, coluna, tabela, gatilho ou
-- dado: as duas policies, o helper e os GRANTs do proprio helper.
-- Rollback (linha 1): devolve as duas policies aos corpos anteriores e remove o helper.

DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;

CREATE POLICY "Users can insert messages" ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_privileged_contact_caller()
  OR (
    sender = 'agent'
    AND (
      is_admin_or_supervisor(auth.uid())
      OR (
        (agent_id IS NULL OR agent_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
        AND (
          contact_id IN (
            SELECT c.id FROM contacts c
            WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
          )
          OR EXISTS (
            SELECT 1 FROM contacts c
            JOIN queue_members qm ON qm.queue_id = c.queue_id
            WHERE c.id = messages.contact_id
              AND qm.profile_id = get_profile_id_for_user(auth.uid())
              AND qm.is_active = true
          )
        )
      )
    )
  )
);

CREATE OR REPLACE FUNCTION public.message_sender_atual(_message_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT m.sender
  FROM public.messages m
  WHERE m.id = _message_id
    AND (
      is_admin_or_supervisor(auth.uid())
      OR m.contact_id IN (
        SELECT c.id FROM contacts c
        WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
      )
      OR EXISTS (
        SELECT 1 FROM contacts c
        JOIN queue_members qm ON qm.queue_id = c.queue_id
        WHERE c.id = m.contact_id
          AND qm.profile_id = get_profile_id_for_user(auth.uid())
          AND qm.is_active = true
      )
    )
$function$;

REVOKE ALL ON FUNCTION public.message_sender_atual(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.message_sender_atual(uuid) TO authenticated;

-- WITH CHECK explicito na policy de UPDATE: visibilidade do registro NOVO (igual
-- a do antigo) e origem PINada (nao vira 'agent' nem volta para 'contact').
ALTER POLICY "Users can update messages from their assigned contacts" ON public.messages
  WITH CHECK (
    public.is_privileged_contact_caller()
    OR (
      sender IS NOT DISTINCT FROM public.message_sender_atual(messages.id)
      AND (
        contact_id IN (
          SELECT c.id FROM contacts c
          WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
        )
        OR is_admin_or_supervisor(auth.uid())
        OR EXISTS (
          SELECT 1 FROM contacts c
          JOIN queue_members qm ON qm.queue_id = c.queue_id
          WHERE c.id = messages.contact_id
            AND qm.profile_id = get_profile_id_for_user(auth.uid())
            AND qm.is_active = true
        )
      )
    )
  );
