-- team_receipts_reactions_conversation_id_forced
-- Rollback: restaura o trigger de recibos que só derivava quando conversation_id vinha NULL e remove o trigger novo de reações:
-- Rollback:   create or replace function public.team_receipts_fill_conversation_id() returns trigger language plpgsql security definer set search_path to 'public' as $f$ begin if new.conversation_id is null then select tm.conversation_id into new.conversation_id from public.team_messages tm where tm.id = new.message_id; end if; if new.conversation_id is null then raise exception 'conversation_id_required: message % has no conversation_id', new.message_id; end if; return new; end; $f$;
-- Rollback:   drop trigger if exists team_receipts_fill_conversation_id_trig on public.team_message_receipts;
-- Rollback:   create trigger team_receipts_fill_conversation_id_trig before insert on public.team_message_receipts for each row execute function public.team_receipts_fill_conversation_id();
-- Rollback:   drop trigger if exists team_reactions_force_conversation_id_trig on public.team_message_reactions;
-- Rollback:   drop function if exists public.team_reactions_force_conversation_id();
--
-- Item 164 / TC-009 (P2) + R2-DB-011 — docs/reconciliation/reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md:148-160.
-- Defeito: recibos e reações NÃO forçavam conversation_id derivado da mensagem.
--   * recibos: o trigger `team_receipts_fill_conversation_id` só preenchia cid quando ele chegava NULL e só no
--     INSERT — um cid NÃO nulo e incorreto, mandado pelo PostgREST (useTeamMessages.ts manda `conversationId` do
--     painel), era gravado como veio; um UPDATE que trocasse `message_id` deixava o cid velho para trás;
--   * reações: não havia trigger nenhum — `useTeamMessageReactions.ts` insere direto com
--     `conversation_id: conversationId`; a RPC canônica derivava o cid da mensagem, o INSERT direto não.
--   Como a leitura e o filtro de realtime usam a coluna gravada (`reactions_select`,
--   "Conversation members can read receipts" e os canais `conversation_id=eq.<id>`), linha permitida pela
--   mensagem podia carregar cid inconsistente — agregando/realtimeando na conversa errada.
-- Correção: derivar cid INCONDICIONALMENTE da mensagem (NEW.message_id) em trigger BEFORE INSERT OR UPDATE,
--   nas duas tabelas; cid de mensagem inexistente é recusado em vez de aceito. Linhas antigas divergentes
--   são reconciliadas pelo backfill abaixo.
--
-- Sem BEGIN/COMMIT: o gateway aplica a migration numa única transação; qualquer erro desfaz tudo.

-- 1) Backfill: rows que já nasceram com cid divergente passam a apontar para a conversa da PRÓPRIA mensagem.
--    (DML com WHERE; roda antes do trigger novo para não depender dele.)
UPDATE public.team_message_receipts r
   SET conversation_id = m.conversation_id
  FROM public.team_messages m
 WHERE m.id = r.message_id
   AND r.conversation_id IS DISTINCT FROM m.conversation_id;

UPDATE public.team_message_reactions r
   SET conversation_id = m.conversation_id
  FROM public.team_messages m
 WHERE m.id = r.message_id
   AND r.conversation_id IS DISTINCT FROM m.conversation_id;

-- 2) Recibos: o cid passa a ser SEMPRE o da mensagem (antes só quando NULL). Vale para INSERT e UPDATE, então
--    trocar `message_id` re-deriva o cid em vez de conservar o antigo. Mensagem sem conversa resolvível é
--    recusada — nunca grava cid adivinhado.
CREATE OR REPLACE FUNCTION public.team_receipts_fill_conversation_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  SELECT tm.conversation_id INTO NEW.conversation_id
    FROM public.team_messages tm
   WHERE tm.id = NEW.message_id;
  IF NEW.conversation_id IS NULL THEN
    RAISE EXCEPTION 'conversation_id_required: message % has no conversation_id', NEW.message_id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.team_receipts_fill_conversation_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_receipts_fill_conversation_id() TO authenticated;

DROP TRIGGER IF EXISTS team_receipts_fill_conversation_id_trig ON public.team_message_receipts;
CREATE TRIGGER team_receipts_fill_conversation_id_trig
  BEFORE INSERT OR UPDATE ON public.team_message_receipts
  FOR EACH ROW EXECUTE FUNCTION public.team_receipts_fill_conversation_id();

-- 3) Reações: mesmo contrato, que não existia. O nome do trigger fica DEPOIS de `team_reactions_dedup_trig`
--    na ordem alfabética, então a deduplicação continua decidindo primeiro (RETURN NULL não chega aqui).
CREATE OR REPLACE FUNCTION public.team_reactions_force_conversation_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  SELECT tm.conversation_id INTO NEW.conversation_id
    FROM public.team_messages tm
   WHERE tm.id = NEW.message_id;
  IF NEW.conversation_id IS NULL THEN
    RAISE EXCEPTION 'conversation_id_required: message % has no conversation_id', NEW.message_id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.team_reactions_force_conversation_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_reactions_force_conversation_id() TO authenticated;

DROP TRIGGER IF EXISTS team_reactions_force_conversation_id_trig ON public.team_message_reactions;
CREATE TRIGGER team_reactions_force_conversation_id_trig
  BEFORE INSERT OR UPDATE ON public.team_message_reactions
  FOR EACH ROW EXECUTE FUNCTION public.team_reactions_force_conversation_id();
