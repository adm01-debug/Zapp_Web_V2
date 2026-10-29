-- messages_internal_stamps_guard
-- Rollback: restaura public.guard_message_provenance_fields com o corpo anterior (20261006114108_r2_db_022_provenance_trigger.sql), que nao olhava status/created_at/status_updated_at nem o texto de mensagem de cliente.
-- Rollback (SQL executável, na ordem):
--   create or replace function public.guard_message_provenance_fields() returns trigger language plpgsql set search_path = public, pg_temp as $function$ begin if current_user in ('postgres', 'service_role') then return new; end if; if tg_op = 'INSERT' then if new.sender is distinct from 'agent' then raise exception 'message_sender_forbidden' using errcode = '42501'; end if; if new.external_id is not null then raise exception 'message_external_id_forbidden' using errcode = '42501'; end if; if new.media_url is not null then raise exception 'message_media_url_forbidden' using errcode = '42501'; end if; elsif tg_op = 'UPDATE' then if new.media_url is distinct from old.media_url or new.contact_id is distinct from old.contact_id or new.sender is distinct from old.sender or new.agent_id is distinct from old.agent_id or new.external_id is distinct from old.external_id then raise exception 'message_provenance_forbidden' using errcode = '42501'; end if; end if; return new; end; $function$;
--   revoke all on function public.guard_message_provenance_fields() from public, anon, authenticated;
--
-- SEC-RLS-01 (P2) — residuo do SEC-RLS_CONTATOS_MENSAGENS-01
-- (docs/audits/SEGURANCA_RLS_CONTATOS_MENSAGENS_2026-10-07.md). Denuncia: sem
-- exploracao conhecida em producao.
--
-- O que a trigger 20261006114108 ja fechava (por INSERT/UPDATE de `authenticated`):
-- sender, external_id, media_url, contact_id, agent_id. NAO fechava o resto:
-- "a" POST /rest/v1/messages com sender='agent' e status='sent' escolhidos, mais
-- created_at/status_updated_at tambem escolhidos. O trigger AFTER INSERT
-- trg_messages_sla_first_response (20260903225000, revisto por 20261006211248)
-- dispara em sender='agent' AND status='sent' e grava a primeira resposta com
-- coalesce(NEW.status_updated_at, NEW.created_at): com os carimbos vindos do
-- cliente, dava para REGISTRAR (e antedatar) uma primeira resposta que nunca saiu.
-- O status default de `messages` e 'sent'::text (conferido em
-- supabase/schema-manifest.json, chave messages.status no bloco `defaults`), entao
-- uma linha nova ja nasceria em 'sent' — o que o cliente escolhia era o INSTANTE.
-- "b" UPDATE de `content` numa linha sender='contact' reescrevia o texto do
-- cliente (o teste T5 anterior permitia). O par exato do "apagar"
-- (is_deleted=true + content='[Mensagem apagada]') precisa continuar valendo para
-- mensagem das DUAS origens.
--
-- Escolha entre RECUSAR e FORCAR now(): recusar com 42501. Forcar em silencio faria
-- o cliente acreditar que gravou o instante que mandou (o PostgREST responde 201),
-- e o aceite pede recusa explicita. O efeito no SLA fica: a unica forma de INSERT
-- que passa no caminho do cliente grava o instante honesto da propria insercao;
-- nenhum instante pode ser antedatado. Medido no banco local: com a guarda antiga o
-- INSERT forjado gravou conversation_sla com first_response_at=2020-01-01 e
-- breached=true; com a nova, 42501 e nenhuma linha de SLA.
--
-- Uso legitimo preservado (conferido no front, git grep): INSERT direto de
-- `messages` pelo front nao existe; UPDATEs legitimos sao is_read, link_preview,
-- transcription/transcription_status, o par do apagar em qualquer origem e a
-- edicao de content de mensagem propria sender='agent'. status/created_at/
-- status_updated_at sao escritos por complete_outbound_message, webhooks e pela
-- ingestao inbound — todos SECURITY DEFINER/service_role, que passam pelo ramo
-- privilegiado abaixo.
--
-- Nada de policy, GRANT de tabela, dado, coluna ou trigger nova: so o corpo desta
-- funcao. O search_path e o REVOKE seguem iguais aos da versao anterior.

-- Os valores que a guarda compara sao os da coluna AGORA. Se o default de status
-- mudar, a migration falha aqui em vez de aceitar em silencio um estado que o SLA
-- de primeira resposta le como "resposta enviada".
DO $check$
DECLARE
  v_status_default text;
  v_created_default text;
  v_status_updated_default text;
BEGIN
  SELECT pg_get_expr(d.adbin, d.adrelid) INTO v_status_default
    FROM pg_attrdef d
    JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
   WHERE d.adrelid = 'public.messages'::regclass AND a.attname = 'status';
  SELECT pg_get_expr(d.adbin, d.adrelid) INTO v_created_default
    FROM pg_attrdef d
    JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
   WHERE d.adrelid = 'public.messages'::regclass AND a.attname = 'created_at';
  SELECT pg_get_expr(d.adbin, d.adrelid) INTO v_status_updated_default
    FROM pg_attrdef d
    JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
   WHERE d.adrelid = 'public.messages'::regclass AND a.attname = 'status_updated_at';

  IF v_status_default IS DISTINCT FROM '''sent''::text' THEN
    RAISE EXCEPTION 'guard_message_provenance_fields: messages.status default mudou (%), a guarda de status precisa ser revista', v_status_default;
  END IF;
  IF v_created_default IS DISTINCT FROM 'now()' THEN
    RAISE EXCEPTION 'guard_message_provenance_fields: messages.created_at default mudou (%), a guarda de created_at precisa ser revista', v_created_default;
  END IF;
  IF v_status_updated_default IS DISTINCT FROM 'now()' THEN
    RAISE EXCEPTION 'guard_message_provenance_fields: messages.status_updated_at default mudou (%), a guarda de status_updated_at precisa ser revista', v_status_updated_default;
  END IF;
END
$check$;

CREATE OR REPLACE FUNCTION public.guard_message_provenance_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  c_status_default constant text := 'sent';
  c_deleted_content constant text := '[Mensagem apagada]';
BEGIN
  IF current_user IN ('postgres', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.sender IS DISTINCT FROM 'agent' THEN
      RAISE EXCEPTION 'message_sender_forbidden' USING ERRCODE = '42501';
    END IF;
    IF NEW.external_id IS NOT NULL THEN
      RAISE EXCEPTION 'message_external_id_forbidden' USING ERRCODE = '42501';
    END IF;
    IF NEW.media_url IS NOT NULL THEN
      RAISE EXCEPTION 'message_media_url_forbidden' USING ERRCODE = '42501';
    END IF;

    -- (SEC-RLS-01) status e os carimbos de entrega sao do banco, nao do cliente.
    IF NEW.status IS DISTINCT FROM c_status_default THEN
      RAISE EXCEPTION 'message_status_forbidden' USING ERRCODE = '42501';
    END IF;
    IF NEW.created_at IS DISTINCT FROM now() THEN
      RAISE EXCEPTION 'message_created_at_forbidden' USING ERRCODE = '42501';
    END IF;
    IF NEW.status_updated_at IS DISTINCT FROM now() THEN
      RAISE EXCEPTION 'message_status_updated_at_forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.media_url IS DISTINCT FROM OLD.media_url
       OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
       OR NEW.sender IS DISTINCT FROM OLD.sender
       OR NEW.agent_id IS DISTINCT FROM OLD.agent_id
       OR NEW.external_id IS DISTINCT FROM OLD.external_id THEN
      RAISE EXCEPTION 'message_provenance_forbidden' USING ERRCODE = '42501';
    END IF;

    -- (SEC-RLS-01) carimbos de entrega: nao se escolhe status nem instante numa
    -- linha existente (era o vetor de forjar o SLA com 'failed' -> 'sent').
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'message_status_forbidden' USING ERRCODE = '42501';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'message_created_at_forbidden' USING ERRCODE = '42501';
    END IF;
    IF NEW.status_updated_at IS DISTINCT FROM OLD.status_updated_at THEN
      RAISE EXCEPTION 'message_status_updated_at_forbidden' USING ERRCODE = '42501';
    END IF;

    -- (SEC-RLS-01) o texto do cliente nao se reescreve. Unica excecao: o par
    -- exato do "apagar" usado pelo inbox em qualquer origem, com o caption
    -- intacto.
    IF OLD.sender = 'contact'
       AND (NEW.content IS DISTINCT FROM OLD.content
            OR NEW.caption IS DISTINCT FROM OLD.caption)
       AND NOT (NEW.is_deleted IS TRUE
                AND NEW.content = c_deleted_content
                AND NEW.caption IS NOT DISTINCT FROM OLD.caption) THEN
      RAISE EXCEPTION 'message_contact_content_forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_message_provenance_fields()
  FROM PUBLIC, anon, authenticated;
