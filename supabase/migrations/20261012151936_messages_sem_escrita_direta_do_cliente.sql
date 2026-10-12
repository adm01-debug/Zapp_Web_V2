-- messages_sem_escrita_direta_do_cliente
-- Rollback: devolve INSERT/UPDATE de tabela a authenticated, derruba a trigger nova e recria a policy de INSERT original (20260925120000).
-- Rollback (SQL executável, na ordem):
--   GRANT INSERT ON public.messages TO authenticated;
--   GRANT UPDATE ON public.messages TO authenticated;
--   DROP TRIGGER IF EXISTS trg_guard_message_status_fields ON public.messages;
--   DROP FUNCTION IF EXISTS public.guard_message_status_fields();
--   CREATE POLICY "Users can insert messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor(auth.uid()) OR ((agent_id IS NULL OR agent_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())) AND (contact_id IN (SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))) OR EXISTS (SELECT 1 FROM contacts c JOIN queue_members qm ON qm.queue_id = c.queue_id WHERE c.id = messages.contact_id AND qm.profile_id = get_profile_id_for_user(auth.uid()) AND qm.is_active = true))));
--
-- Fecha a escrita direta do cliente em `messages`: o front nao deve poder criar
-- nem forjar linhas de conversa por INSERT/UPDATE na tabela.
--
-- POR QUE. A policy de INSERT ("Users can insert messages", 20260925120000) so
-- limitava a VISIBILIDADE do contato; qualquer agente com o contato visivel
-- inseria uma mensagem `sender='agent'` arbitraria na conversa. O `status`,
-- por sua vez, e livre para UPDATE em toda linha que a guarda de entrega
-- (`guard_message_delivery_internal_fields`, 20260909260000) nao cobre — ela
-- so trava linhas de fila atomica (`client_message_id IS NOT NULL AND
-- status='sending' AND external_id IS NULL`). Nas demais linhas o cliente
-- alterava `status`/`status_updated_at`, o que o trigger de SLA de primeira
-- resposta (20261006211248) usa como instante da resposta: dava para maquiar o
-- SLA e o estado de entrega.
--
-- Caminho legitimo NAO depende de escrita direta: `enqueue_outbound_message`,
-- `claim_outbound_message`/`complete_outbound_message`, `ingest_inbound_message`
-- e a ingestao/entrega das Edge sao SECURITY DEFINER (rodam como postgres) ou
-- usam service_role — nao sao afetados por RLS nem por GRANT de coluna.
--
-- ESCOPO. Migracao de permissao/guarda, sem DDL de coluna e sem toque em dado:
--   1. REVOKE INSERT de authenticated/anon/PUBLIC e DROP da policy de INSERT
--      (que ficaria orfa e enganosa);
--   2. UPDATE passa a ser por COLUNA, so as que o cliente realmente escreve:
--        is_read, is_deleted, content, updated_at, transcription,
--        transcription_status, link_preview.
--      `content` entra porque os fluxos de apagar mensagem fazem
--      `.update({ is_deleted: true, content: '[Mensagem apagada]' })`
--      (MessageContextActions, MessageHoverToolbar, useFilesActions,
--      chat.service.deleteMessage); `updated_at` entra porque a edicao de
--      mensagem faz `.update({ content, updated_at })`
--      (useChatPanelHandlers.ts:199) — sem o grant de coluna o fluxo legitimo
--      de edicao (R2-INB-014) quebraria com 42501. `is_deleted`/`content` saem
--      da lista quando o PE-20 integrar a RPC de apagar; `transcription`/
--      `transcription_status` quando o PE-55 integrar a transcricao na Edge.
--   3. Trigger de defesa em profundidade: alem do GRANT de coluna, uma trigger
--      recusa UPDATE de status/status_updated_at por quem nao e postgres/service_role.
--
-- `sender`, `external_id`, `agent_id` e `media_url` NAO recebem grant de coluna
-- (ficam fechados so por isso) E ja sao recusados pela guarda de proveniencia
-- `guard_message_provenance_fields` (20261006114108), que dispara BEFORE UPDATE
-- nas mesmas linhas. Nao existe coluna `error_*` em public.messages (o campo de
-- erro da entrega nao e exposto na tabela), entao a guarda nova cobre
-- status/status_updated_at — o que nenhuma das duas camadas anteriores cobria.

-- ---------------------------------------------------------------------------
-- 1. INSERT direto: negado ao cliente
-- ---------------------------------------------------------------------------
REVOKE INSERT ON public.messages FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;

-- ---------------------------------------------------------------------------
-- 2. UPDATE por coluna (so o que o front escreve de fato)
-- ---------------------------------------------------------------------------
REVOKE UPDATE ON public.messages FROM PUBLIC, anon, authenticated;
GRANT UPDATE (
  is_read,
  is_deleted,
  content,
  updated_at,
  transcription,
  transcription_status,
  link_preview
) ON public.messages TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Guarda de status (defesa em profundidade)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_message_status_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF current_user IN ('postgres', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (NEW.status IS DISTINCT FROM OLD.status
          OR NEW.status_updated_at IS DISTINCT FROM OLD.status_updated_at) THEN
    RAISE EXCEPTION 'message_status_forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_message_status_fields()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_message_status_fields ON public.messages;
CREATE TRIGGER trg_guard_message_status_fields
BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.guard_message_status_fields();
