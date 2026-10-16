-- auditoria_config_operacional
-- Rollback: derruba os quatro gatilhos e a funcao de auditoria criados aqui; nao ha tabela,
-- coluna, policy, dado ou GRANT alterado, e a funcao nasce com EXECUTE revogado, entao nada
-- mais precisa voltar.
-- Rollback (SQL executavel, na ordem):
--   DROP TRIGGER IF EXISTS audit_queues_config ON public.queues;
--   DROP TRIGGER IF EXISTS audit_queue_members_config ON public.queue_members;
--   DROP TRIGGER IF EXISTS audit_connection_queues_config ON public.whatsapp_connection_queues;
--   DROP TRIGGER IF EXISTS audit_rate_limit_configs_config ON public.rate_limit_configs;
--   DROP FUNCTION IF EXISTS public.audit_operational_config();
--
-- Mudanca de configuracao operacional nao deixava rastro. Os unicos gatilhos de auditoria
-- do banco cobriam user_roles, role_permissions e contatos; fila, membros da fila, vinculo
-- conexao-fila e rate_limit_configs eram alterados em silencio (cartao t_a8be1908, segunda
-- passada da auditoria de paridade V3 -> V2 do doc 25-hooks-raiz-3).
--
-- Esta migration e ADITIVA: nao cria tabela nem coluna, nao muda policy, nao toca dado
-- existente e so acrescenta o rastro das quatro tabelas de configuracao operacional.
-- O que o evento grava:
--   autor        -> audit_logs.user_id (auth.uid()) + details.actor_* (mesmo bloco da
--                   20261003272707: actor_kind jwt/service_role_or_direct_sql, actor_db_role,
--                   actor_app_name, actor_addr);
--   acao         -> vocabulario deste cartao: queue_created|queue_updated|queue_deleted,
--                   queue_member_created|queue_member_updated|queue_member_deleted,
--                   connection_queue_linked|connection_queue_updated|connection_queue_unlinked,
--                   rate_limit_config_created|rate_limit_config_updated|rate_limit_config_deleted;
--   entity_type  -> nome da tabela (queues, queue_members, whatsapp_connection_queues,
--                   rate_limit_configs) e entity_id -> id da linha mexida (uuid);
--   diff minimo  -> UPDATE grava so as colunas que mudaram, em details.changed
--                   ({<coluna>: {old, new}}); INSERT grava details.new; DELETE grava
--                   details.old (o estado anterior, exigido pelo cartao). updated_at fica
--                   de fora do diff porque o gatilho update_<tabela>_updated_at o reescreve
--                   em todo UPDATE, sem que o autor tenha mexido nele.
-- Nenhum dado pessoal entra no evento: as quatro tabelas guardam nome/descricao de fila,
-- ids de profile/conexao e limites numericos (sem telefone e sem texto de mensagem).
--
-- ALLOWLIST do log_audit_event (PE-19, dona ainda nao integrada): as 11 acoes acima sao as
-- que este cartao acrescenta e devem entrar na lista quando PE-19 definir onde ela mora.

-- Uma funcao generica serve as quatro tabelas: o gatilho e por tabela, o corpo e o mesmo.
CREATE OR REPLACE FUNCTION public.audit_operational_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_entity    text := TG_TABLE_NAME;
  v_op        text := lower(TG_OP);
  v_action    text;
  v_entity_id uuid;
  v_details   jsonb;
  v_before    jsonb;
  v_after     jsonb;
  v_changed   jsonb := '{}'::jsonb;
  v_key       text;
  v_actor     jsonb;
BEGIN
  v_entity_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;

  v_action := CASE v_entity
                WHEN 'queues'                     THEN 'queue'
                WHEN 'queue_members'              THEN 'queue_member'
                WHEN 'whatsapp_connection_queues'  THEN 'connection_queue'
                WHEN 'rate_limit_configs'         THEN 'rate_limit_config'
                ELSE v_entity
              END
              || '_'
              || CASE
                   WHEN v_entity = 'whatsapp_connection_queues'
                     THEN CASE v_op WHEN 'insert' THEN 'linked'
                                    WHEN 'delete' THEN 'unlinked'
                                    ELSE 'updated' END
                   WHEN v_op = 'insert' THEN 'created'
                   WHEN v_op = 'update' THEN 'updated'
                   WHEN v_op = 'delete' THEN 'deleted'
                   ELSE v_op
                 END;

  IF TG_OP = 'INSERT' THEN
    v_details := jsonb_build_object('op', v_op, 'new', to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    v_details := jsonb_build_object('op', v_op, 'old', to_jsonb(OLD));
  ELSE
    v_before := to_jsonb(OLD);
    v_after  := to_jsonb(NEW);
    FOR v_key IN SELECT jsonb_object_keys(v_after) LOOP
      IF v_key <> 'updated_at'
         AND (v_after -> v_key) IS DISTINCT FROM (v_before -> v_key) THEN
        v_changed := v_changed || jsonb_build_object(
          v_key, jsonb_build_object('old', v_before -> v_key, 'new', v_after -> v_key));
      END IF;
    END LOOP;
    v_details := jsonb_build_object('op', v_op, 'changed', v_changed);
  END IF;

  v_actor := jsonb_build_object(
    'actor_kind', CASE WHEN auth.uid() IS NOT NULL THEN 'jwt' ELSE 'service_role_or_direct_sql' END,
    'actor_db_role', current_user,
    'actor_app_name', nullif(current_setting('application_name', true), ''),
    'actor_addr', coalesce(host(inet_client_addr()), 'local')
  );

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_action, v_entity, v_entity_id, v_details || v_actor);

  RETURN NULL;
END;
$function$;

-- A funcao nao e RPC: ninguem a chama por SELECT/PostgREST. Fecha o EXECUTE padrao do
-- Postgres (PUBLIC) e tambem anon/authenticated, como as demais funcoes de gatilho
-- (20261001191230_revoke_execute_internal_trigger_functions.sql).
REVOKE EXECUTE ON FUNCTION public.audit_operational_config() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER audit_queues_config
  AFTER INSERT OR UPDATE OR DELETE ON public.queues
  FOR EACH ROW EXECUTE FUNCTION public.audit_operational_config();

CREATE OR REPLACE TRIGGER audit_queue_members_config
  AFTER INSERT OR UPDATE OR DELETE ON public.queue_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_operational_config();

CREATE OR REPLACE TRIGGER audit_connection_queues_config
  AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_connection_queues
  FOR EACH ROW EXECUTE FUNCTION public.audit_operational_config();

CREATE OR REPLACE TRIGGER audit_rate_limit_configs_config
  AFTER INSERT OR UPDATE OR DELETE ON public.rate_limit_configs
  FOR EACH ROW EXECUTE FUNCTION public.audit_operational_config();
