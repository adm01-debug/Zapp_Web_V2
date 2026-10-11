-- edit_message_rpc
-- Rollback: recria o UPDATE direto de content (dropa a guarda de colunas imutaveis e a RPC edit_message).
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists trg_guard_message_immutable_columns on public.messages;
--   drop function if exists public.guard_message_immutable_columns();
--   drop function if exists public.edit_message(uuid, text);
--
-- Defeito: o cliente edita mensagem com UPDATE direto em public.messages. A
-- policy de UPDATE e por CONTATO (visibilidade), nao por remetente: qualquer
-- agente que ve o contato reescreve o conteudo de uma mensagem RECEBIDA ou ja
-- enviada, e ainda pode trocar sender / external_id / created_at.
--
-- Correcao em duas pecas:
--   1. public.edit_message(uuid, text) SECURITY DEFINER: unico caminho legitimo
--      para mudar o conteudo. Valida remetente (sender='agent'), mensagem ja
--      enviada (external_id), nao apagada, janela de 15 min, visibilidade do
--      contato (mesma regra das policies) e permissao send_messages; grava
--      is_edited=true e um evento de auditoria SEM o texto da mensagem.
--   2. public.guard_message_immutable_columns() (trigger BEFORE UPDATE): sob o
--      papel authenticated, recusa mudar sender / created_at / external_id /
--      contact_id / agent_id e recusa mudar content fora da RPC. A sessao da
--      RPC e sinalizada por uma configuracao local (app.edit_message_rpc) e so
--      vale junto com o dono (postgres): um UPDATE direto de authenticated nao
--      consegue se auto-marcar.
--      O soft delete (is_deleted=true, tombstone '[Mensagem apagada]') continua
--      funcionando, e service_role / Edge seguem escrevendo status e external_id.
--
-- Mapa dos fluxos legitimos que atualizam public.messages (item 1 do cartao) e as
-- colunas de cada um. Nenhum deles e barrado pela guarda:
--   - is_read (marcar lido/nao lido): src/services/chat.service.ts,
--     src/services/realtime.service.ts, src/hooks/inbox/useInboxBulkActions.ts e
--     supabase/functions/_shared/evolution-webhook-handlers.ts (service_role)
--     -> coluna is_read (fora do UPDATE OF do gatilho).
--   - soft delete: src/components/inbox/MessageContextActions.tsx e
--     src/components/inbox/chat/MessageHoverToolbar.tsx -> is_deleted + content
--     (tombstone '[Mensagem apagada]'); a guarda libera a troca de texto quando
--     is_deleted vira true.
--   - transcricao: src/components/inbox/AudioMessagePlayer.tsx -> transcription,
--     transcription_status (fora do UPDATE OF do gatilho).
--   - media_url: supabase/functions/migrate-media-storage e
--     recover-corrupted-audios (service_role) -> media_url.
--   - status/external_id/entrega: Edges com service_role e as RPCs
--     claim/complete/fail_outbound_message (dono postgres) -> status,
--     status_updated_at, external_id, delivery_*.
--   - reactions: tabela public.message_reactions (nao messages).
--   - reacoes de conteudo do cliente (edicao): passa a ser SO a RPC edit_message.

CREATE OR REPLACE FUNCTION public.guard_message_immutable_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  -- Edges (service_role) continuam atualizando status, external_id e midia.
  IF current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Identidade da mensagem: nunca muda pelo cliente autenticado. O dono da RPC
  -- (postgres) nao e barrado aqui porque complete_outbound_message troca
  -- external_id/status; o conteudo tem guarda propria abaixo, que vale para ele
  -- tambem.
  IF current_user <> 'postgres' THEN
    IF NEW.sender IS DISTINCT FROM OLD.sender
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.external_id IS DISTINCT FROM OLD.external_id
       OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
       OR NEW.agent_id IS DISTINCT FROM OLD.agent_id THEN
      RAISE EXCEPTION 'message_immutable_columns_forbidden'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Conteudo: so pela RPC edit_message (dono + marca de sessao) ou no soft
  -- delete inicial com o tombstone padrao. Um UPDATE direto de content por
  -- authenticated cai aqui, mesmo dentro da janela de edicao; ligar is_deleted=true
  -- com outro texto, ou reescrever uma mensagem ja apagada, nao vira atalho.
  IF NEW.content IS DISTINCT FROM OLD.content
     AND NOT (OLD.is_deleted IS NOT TRUE
              AND NEW.is_deleted IS TRUE
              AND NEW.content = '[Mensagem apagada]')
     AND NOT (current_user = 'postgres'
              AND coalesce(current_setting('app.edit_message_rpc', true), 'off') = 'on') THEN
    RAISE EXCEPTION 'message_content_edit_requires_rpc'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_message_immutable_columns()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_guard_message_immutable_columns
BEFORE UPDATE OF content, sender, created_at, external_id, contact_id, agent_id
ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.guard_message_immutable_columns();

CREATE OR REPLACE FUNCTION public.edit_message(
  p_message_id uuid,
  p_new_content text
)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_content text;
  v_message public.messages%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR coalesce(auth.role(), '') <> 'authenticated' THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF p_message_id IS NULL THEN
    RAISE EXCEPTION 'invalid_message_edit' USING ERRCODE = '22023';
  END IF;

  v_content := btrim(p_new_content);
  IF v_content IS NULL OR v_content = '' THEN
    RAISE EXCEPTION 'invalid_message_edit_content' USING ERRCODE = '22023';
  END IF;
  IF length(v_content) > 4096 THEN
    RAISE EXCEPTION 'message_edit_content_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_message
  FROM public.messages
  WHERE id = p_message_id
  FOR UPDATE;

  -- Mesmo erro para "nao existe" e "nao pode ver": nao vira oraculo de
  -- existencia de mensagem para quem nao tem visibilidade do contato.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_not_found_or_not_authorized' USING ERRCODE = '42501';
  END IF;

  IF public.is_contact_visible_to_user(v_message.contact_id, auth.uid()) IS NOT TRUE THEN
    RAISE EXCEPTION 'message_not_found_or_not_authorized' USING ERRCODE = '42501';
  END IF;

  IF public.user_has_permission(auth.uid(), 'send_messages') IS NOT TRUE THEN
    RAISE EXCEPTION 'send_messages_permission_required' USING ERRCODE = '42501';
  END IF;

  -- Só mensagem enviada pelo agente, ja com id do provedor, e viva.
  IF v_message.sender <> 'agent'
     OR v_message.external_id IS NULL
     OR v_message.is_deleted IS TRUE THEN
    RAISE EXCEPTION 'message_not_editable' USING ERRCODE = '42501';
  END IF;

  IF v_message.created_at < statement_timestamp() - interval '15 minutes' THEN
    RAISE EXCEPTION 'message_edit_window_expired' USING ERRCODE = '22023';
  END IF;

  -- Marca de sessao lida pela guarda; so o dono (postgres) a carrega.
  PERFORM set_config('app.edit_message_rpc', 'on', true);

  UPDATE public.messages
  SET content = v_content,
      is_edited = true,
      updated_at = statement_timestamp()
  WHERE id = p_message_id
  RETURNING * INTO v_message;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'message_edited',
    'message',
    p_message_id,
    jsonb_build_object('contact_id', v_message.contact_id)
  );

  RETURN v_message;
END;
$function$;

REVOKE ALL ON FUNCTION public.edit_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_message(uuid, text) TO authenticated;
