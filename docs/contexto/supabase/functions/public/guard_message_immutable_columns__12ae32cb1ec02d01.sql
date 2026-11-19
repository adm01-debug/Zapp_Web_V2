CREATE OR REPLACE FUNCTION public.guard_message_immutable_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
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
  -- com outro texto, reescrever uma mensagem ja apagada ou desfazer is_deleted
  -- nao vira atalho.
  IF OLD.is_deleted IS TRUE
     AND NEW.is_deleted IS NOT TRUE
     AND current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'message_undelete_forbidden'
      USING ERRCODE = '42501';
  END IF;

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
$function$
