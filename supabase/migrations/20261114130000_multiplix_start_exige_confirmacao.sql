-- 20261114130000_multiplix_start_exige_confirmacao
-- Regra do dono (docs/contexto/regras/manual/regras.md §8): RETOMAR um disparo PAUSADO e um
-- clique; INICIAR um rascunho ou MATERIALIZAR uma fila e irreversivel e exige confirmacao.
--
-- Achado (revisao do Multiplix, 14/11/2026):
--   * transition_multiplix_dispatch (corpo da 20261002521230_f59) aceita 'start' a partir de
--     'draft'. O worker multiplix-send, logo depois da transicao, chama
--     multiplix_materialize_legacy_queue, que transforma o message_template em bloco e gera a
--     fila — SEM a revalidacao do F49 e SEM o congelamento do confirm (F51). O composer usava
--     exatamente esse caminho no "Iniciar agora".
--   * Os legados pausados pela 20261005150259 (pause_reason='legacy_queue_unmaterialized') nao
--     tem fila; o botao "Retomar" (um clique) chamava o mesmo 'start' e materializava + enviava.
--   * Achado colateral que IMPEDE usar o confirm hoje: o gatilho de versao do F05
--     (multiplix_bump_version_on_dispatch_edit, 20261002461230) le NEW.template e
--     NEW.variables_snapshot — colunas que multiplix_dispatches NAO tem (o texto e
--     message_template; variables_snapshot e de multiplix_recipients). Todo UPDATE que mantem o
--     disparo em 'draft' (editar o rascunho, inserir/hashear bloco de rascunho) estoura 42703
--     "record new has no field template" — inclusive o passo 4 do proprio confirm, que hasheia
--     os blocos com o disparo ainda em 'draft'. Medido no harness desta migration (cadeia real).
--
-- O que esta migration faz (tudo numa transacao):
--   1. multiplix_bump_version_on_dispatch_edit: compara message_template (a coluna real) e deixa
--      de citar variables_snapshot. Mesma regra do F05: so age em 'draft'.
--   2. transition_multiplix_dispatch: 'start' a partir de 'draft' ou 'paused' SEM fila
--      materializada (nenhuma linha em multiplix_delivery_items) e recusado com
--      'multiplix_dispatch_confirm_required' (55000). A fila existir e a marca de que o disparo
--      passou pelo confirm (e o confirm que a gera, na mesma transacao do congelamento).
--      Continua permitido: retomar pausado COM fila (um clique), o 'start' do cron sobre
--      'scheduled' e o 'start' de 'sending' (re-entrada do worker). Pause/cancel intactos.
--   3. multiplix_confirm_dispatch passa a cobrir os dois casos que antes so o worker cobria:
--      a) rascunho do composer sem bloco: o message_template (nao vazio) vira o bloco texto
--         unico, DENTRO do confirm — mesma forma que a 20261005150259 usava; template vazio
--         continua 'multiplix_confirm_no_blocks';
--      b) rascunho sem conexao: fixa a primeira conexao 'connected' (mesma regra do worker:
--         o composer nao oferece escolha) — sem nenhuma conectada continua
--         'multiplix_confirm_connection_required';
--      c) pausado SEM fila (legado): passa a ser confirmavel. So destinatario ainda 'pending'
--         vira item (nunca reenvia quem ja recebeu pela fila antiga); total_recipients e
--         started_at do legado sao preservados; pause_reason e limpo; agendamento vencido
--         vira envio imediato.
--      Idempotencia, escopo, revalidacao (F49), congelamento e trilha: os mesmos do F51.
--      O bloco e inserido DEPOIS da troca de status, entao o gatilho do F05 nao versiona por
--      cima do confirm.
--
-- Corpo de partida: o PROD nao pode ser lido nesta sessao (MCP do Supabase desconectado em
-- 14/11/2026). As funcoes partem do ultimo corpo versionado no repo:
--   transition_multiplix_dispatch      <- 20261002521230_f59_transition_dispatch_enum_cast.sql
--   multiplix_confirm_dispatch         <- 20261002461230_f51c_multiplix_confirm_dispatch_contrato.sql
--   multiplix_bump_version_on_dispatch_edit <- 20261002461230_f51c (mesmo arquivo)
-- A pre-condicao abaixo confere marcas textuais desses corpos e aborta se o prod divergir.
--
-- APLICAR SO COM APROVACAO DO DONO. Teste: supabase/tests/db-audit/multiplix-start-exige-confirmacao.test.sh
--
-- Rollback (SQL executavel, na ordem): reaplicar os corpos anteriores, que sao CREATE OR REPLACE
-- e nao dependem de dado:
--   psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261002461230_f51c_multiplix_confirm_dispatch_contrato.sql
--   psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261002521230_f59_transition_dispatch_enum_cast.sql
-- Fim do rollback
-- Rollback honesto: o rollback reabre o 'start' sem confirmacao (o defeito acima) e devolve o
-- gatilho que estoura 42703. Fila gerada e mensagem enviada depois desta migration nao voltam.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 0. Pre-condicoes: os objetos existem e os corpos sao os medidos no repo.
-- ---------------------------------------------------------------------------
DO $pre$
DECLARE
  v_src text;
BEGIN
  IF to_regclass('public.multiplix_delivery_items') IS NULL
     OR to_regclass('public.multiplix_blocks') IS NULL
     OR to_regclass('public.multiplix_events') IS NULL THEN
    RAISE EXCEPTION 'pre: tabelas do modelo por item (F32a/F33/F34) ausentes';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'multiplix_dispatches'
       AND column_name = 'message_template'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'multiplix_dispatches'
       AND column_name = 'pause_reason'
  ) THEN
    RAISE EXCEPTION 'pre: multiplix_dispatches sem message_template/pause_reason';
  END IF;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.transition_multiplix_dispatch(uuid, text, text)');
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'pre: transition_multiplix_dispatch(uuid,text,text) ausente';
  END IF;
  -- Corpo da f59 (ou o desta migration, na reaplicacao).
  IF position('multiplix_dispatch_start_denied_from_' IN v_src) = 0
     OR position('v_next_status::public.multiplix_dispatch_status' IN v_src) = 0 THEN
    RAISE EXCEPTION 'pre: transition_multiplix_dispatch diverge do corpo versionado (f59) — reler o prod antes de aplicar';
  END IF;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.multiplix_confirm_dispatch(uuid, uuid, boolean, integer, timestamp with time zone, uuid)');
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'pre: multiplix_confirm_dispatch ausente';
  END IF;
  IF position('multiplix_dispatch_already_confirmed' IN v_src) = 0
     OR position('multiplix_confirm_no_blocks' IN v_src) = 0 THEN
    RAISE EXCEPTION 'pre: multiplix_confirm_dispatch diverge do corpo versionado (f51c) — reler o prod antes de aplicar';
  END IF;

  IF to_regprocedure('public.multiplix_bump_version_on_dispatch_edit()') IS NULL THEN
    RAISE EXCEPTION 'pre: multiplix_bump_version_on_dispatch_edit() ausente';
  END IF;
END
$pre$;

-- Mesma ordem de lock das funcoes (dispatch antes de item): sem esperar indefinidamente.
LOCK TABLE public.multiplix_dispatches IN SHARE ROW EXCLUSIVE MODE;

-- ---------------------------------------------------------------------------
-- 1. Gatilho de versao do F05 com as colunas reais.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.multiplix_bump_version_on_dispatch_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- So rascunho: o congelamento do confirm muda o status e e ele quem versiona.
  IF OLD.status <> 'draft' OR NEW.status <> 'draft' THEN
    RETURN NEW;
  END IF;

  -- Metadados de trabalho (a propria versao, timestamps, contadores) nao sao
  -- "revisao": mudar so eles nao pode invalidar uma previa ja revisada.
  -- message_template e a coluna real do texto (o corpo anterior citava as colunas
  -- template e variables_snapshot, inexistentes nesta tabela: 42703 em todo UPDATE de rascunho).
  IF NEW.name IS DISTINCT FROM OLD.name
     OR NEW.message_template IS DISTINCT FROM OLD.message_template
     OR NEW.whatsapp_connection_id IS DISTINCT FROM OLD.whatsapp_connection_id
     OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
     OR NEW.audience_version IS DISTINCT FROM OLD.audience_version THEN
    NEW.dispatch_version := OLD.dispatch_version + 1;
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.multiplix_bump_version_on_dispatch_edit() IS
  'F05: incrementa dispatch_version quando o rascunho e editado (nome, message_template, conexao, agendamento ou publico). Inerte fora de draft.';

REVOKE ALL ON FUNCTION public.multiplix_bump_version_on_dispatch_edit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.multiplix_bump_version_on_dispatch_edit() TO service_role;

-- ---------------------------------------------------------------------------
-- 2. 'start' sem fila exige confirmacao.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transition_multiplix_dispatch(p_dispatch_id uuid, p_action text, p_pause_reason text DEFAULT NULL::text)
 RETURNS TABLE(dispatch_id uuid, previous_status text, current_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dispatch public.multiplix_dispatches%ROWTYPE;
  v_next_status text;
  v_closed integer := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_dispatch_id IS NULL OR p_action NOT IN ('start', 'pause', 'cancel') THEN
    RAISE EXCEPTION 'invalid_multiplix_dispatch_transition' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.multiplix_dispatches AS dispatch
  WHERE dispatch.id = p_dispatch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_dispatch_not_found' USING ERRCODE = 'P0002';
  END IF;

  CASE p_action
    WHEN 'start' THEN
      IF v_dispatch.status = 'sending' AND v_dispatch.updated_at > now() - interval '3 minutes' THEN
        RAISE EXCEPTION 'multiplix_dispatch_already_running' USING ERRCODE = '55001';
      END IF;
      IF v_dispatch.status NOT IN ('draft', 'scheduled', 'paused', 'sending') THEN
        RAISE EXCEPTION 'multiplix_dispatch_start_denied_from_%', v_dispatch.status USING ERRCODE = '55000';
      END IF;
      -- Regra do dono (§8): iniciar rascunho / materializar fila e irreversivel e passa pelo
      -- confirm (F51: revalida, congela e gera a fila na mesma transacao). Sem fila, 'draft' e
      -- 'paused' nao andam por aqui — nem por clique, nem pelo cron. Retomar pausado COM fila
      -- continua um clique.
      IF v_dispatch.status IN ('draft', 'paused')
         AND NOT EXISTS (
           SELECT 1 FROM public.multiplix_delivery_items AS item
            WHERE item.dispatch_id = p_dispatch_id
         ) THEN
        RAISE EXCEPTION 'multiplix_dispatch_confirm_required' USING ERRCODE = '55000';
      END IF;
      IF btrim(COALESCE(v_dispatch.message_template, '')) = '' THEN
        RAISE EXCEPTION 'multiplix_dispatch_message_required' USING ERRCODE = '22023';
      END IF;
      IF v_dispatch.total_recipients <= 0
         OR NOT EXISTS (
           SELECT 1 FROM public.multiplix_recipients AS recipient
           WHERE recipient.dispatch_id = p_dispatch_id
         ) THEN
        RAISE EXCEPTION 'multiplix_dispatch_recipients_required' USING ERRCODE = '22023';
      END IF;
      v_next_status := 'sending';
    WHEN 'pause' THEN
      IF v_dispatch.status <> 'sending' THEN
        RAISE EXCEPTION 'multiplix_dispatch_pause_denied_from_%', v_dispatch.status USING ERRCODE = '55000';
      END IF;
      v_next_status := 'paused';
    WHEN 'cancel' THEN
      IF v_dispatch.status NOT IN ('draft', 'scheduled', 'sending', 'paused') THEN
        RAISE EXCEPTION 'multiplix_dispatch_cancel_denied_from_%', v_dispatch.status USING ERRCODE = '55000';
      END IF;
      v_next_status := 'cancelled';
  END CASE;

  -- F14: cancelar tem de encerrar a fila. Item sem POST ao provedor vira
  -- 'cancelled' (com motivo explicito); item em voo (provider_dispatch_started_at
  -- preenchido) fica intacto — o resultado dele ainda e desconhecido e o sweeper
  -- resolve para outcome_unknown.
  IF p_action = 'cancel' THEN
    UPDATE public.multiplix_recipients AS recipient
       SET status = 'cancelled',
           error_message = COALESCE(recipient.error_message, 'Cancelado pelo operador antes do envio'),
           delivery_claim_token = NULL,
           delivery_claimed_at = NULL,
           delivery_claim_expires_at = NULL,
           delivery_claimed_by = NULL,
           retry_after = NULL,
           updated_at = statement_timestamp()
     WHERE recipient.dispatch_id = p_dispatch_id
       AND recipient.status IN ('pending', 'sending')
       AND recipient.provider_dispatch_started_at IS NULL;

    GET DIAGNOSTICS v_closed = ROW_COUNT;

    -- F57: a fila POR ITEM tambem e encerrada (item sem POST vira 'cancelled').
    UPDATE public.multiplix_delivery_items AS item
       SET status = 'cancelled',
           error_message = COALESCE(item.error_message, 'Cancelado pelo operador antes do envio'),
           lease_token = NULL,
           lease_until = NULL,
           worker_id = NULL,
           updated_at = statement_timestamp()
     WHERE item.dispatch_id = p_dispatch_id
       AND item.status IN ('pending', 'sending')
       AND item.provider_dispatch_started_at IS NULL;
  END IF;

  UPDATE public.multiplix_dispatches AS dispatch
  SET status       = v_next_status::public.multiplix_dispatch_status,
      pause_reason = CASE WHEN p_action = 'pause' THEN p_pause_reason ELSE NULL END,
      started_at   = CASE WHEN p_action = 'start'
        THEN COALESCE(dispatch.started_at, statement_timestamp())
        ELSE dispatch.started_at END,
      paused_at    = CASE WHEN p_action = 'pause' THEN statement_timestamp() ELSE dispatch.paused_at END,
      completed_at = CASE WHEN p_action = 'cancel' THEN statement_timestamp() ELSE dispatch.completed_at END,
      updated_at   = statement_timestamp()
  WHERE dispatch.id = p_dispatch_id;

  RETURN QUERY SELECT p_dispatch_id, v_dispatch.status::text, v_next_status::text;
END;
$function$;

-- ACL igual a vigente: so service_role (a edge e o cron).
REVOKE ALL ON FUNCTION public.transition_multiplix_dispatch(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_multiplix_dispatch(uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Confirm (F51) cobre rascunho do composer e legado pausado sem fila.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.multiplix_confirm_dispatch(
  p_dispatch_id uuid,
  p_actor_id uuid,
  p_allow_manage_all boolean,
  p_expected_version integer,
  p_scheduled_at timestamp with time zone DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE(
  dispatch_id uuid,
  dispatch_version integer,
  status public.multiplix_dispatch_status,
  recipient_count integer,
  block_count integer,
  items_created integer,
  items_total integer,
  created boolean,
  scheduled_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dispatch      public.multiplix_dispatches%ROWTYPE;
  v_candidate     integer;
  v_confirmed     integer;
  v_scheduled     timestamp with time zone;
  v_recipients    integer;
  v_eligible      integer;
  v_blocks        integer;
  v_items_before  integer;
  v_items_created integer;
  v_new_status    public.multiplix_dispatch_status;
  v_connection    uuid;
  v_legacy        boolean;
  v_bridge_block  boolean := false;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_dispatch_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'invalid_multiplix_confirm' USING ERRCODE = '22023';
  END IF;

  -- Serializa confirmacoes concorrentes do MESMO disparo.
  SELECT * INTO v_dispatch
    FROM public.multiplix_dispatches AS d
   WHERE d.id = p_dispatch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_dispatch_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Escopo: a edge ja resolveu dono/manage_all; a RPC reconfere (defesa em profundidade).
  IF v_dispatch.created_by IS DISTINCT FROM p_actor_id
     AND COALESCE(p_allow_manage_all, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'multiplix_dispatch_scope_denied' USING ERRCODE = '42501';
  END IF;

  -- ---- 1. idempotencia por (dispatch_id, dispatch_version) ----
  v_candidate := p_expected_version + 1;

  SELECT COALESCE(max(item.dispatch_version), 0) INTO v_confirmed
    FROM public.multiplix_delivery_items AS item
   WHERE item.dispatch_id = p_dispatch_id;

  IF v_confirmed > 0 THEN
    IF v_confirmed = v_candidate THEN
      SELECT count(*)::integer INTO v_recipients
        FROM public.multiplix_recipients AS r WHERE r.dispatch_id = p_dispatch_id;
      SELECT count(*)::integer INTO v_blocks
        FROM public.multiplix_blocks AS b WHERE b.dispatch_id = p_dispatch_id;
      SELECT count(*)::integer INTO v_items_created
        FROM public.multiplix_delivery_items AS item
       WHERE item.dispatch_id = p_dispatch_id AND item.dispatch_version = v_candidate;

      RETURN QUERY SELECT p_dispatch_id, v_candidate, v_dispatch.status,
                          v_recipients, v_blocks, 0, v_items_created, false, v_dispatch.scheduled_at;
      RETURN;
    END IF;
    -- Ja existe confirmacao em OUTRA versao: nao re-materializa em cima dela.
    RAISE EXCEPTION 'multiplix_dispatch_already_confirmed' USING ERRCODE = '55000';
  END IF;

  -- ---- 2. estado e revisao ----
  -- 'paused' sem fila (chegou ate aqui: v_confirmed = 0) e o legado da 20261005150259 — ou
  -- qualquer pausado que nunca materializou. Iniciar esse disparo e a mesma decisao
  -- irreversivel de iniciar um rascunho, entao passa pela MESMA confirmacao.
  IF v_dispatch.status NOT IN ('draft', 'scheduled', 'paused') THEN
    RAISE EXCEPTION 'multiplix_dispatch_not_confirmable' USING ERRCODE = '55000';
  END IF;
  v_legacy := v_dispatch.status = 'paused';

  IF v_dispatch.dispatch_version <> p_expected_version THEN
    RAISE EXCEPTION 'multiplix_dispatch_review_stale' USING ERRCODE = '55000';
  END IF;

  -- ---- 3. revalidacao (F49), ainda na transacao ----
  v_scheduled := COALESCE(p_scheduled_at, v_dispatch.scheduled_at);
  -- Legado: um agendamento antigo ja vencido nao e "agendar" — e envio imediato.
  IF v_legacy AND v_scheduled IS NOT NULL AND v_scheduled <= statement_timestamp() THEN
    v_scheduled := NULL;
  END IF;

  -- Apto = MESMO balde `eligible` do F49 (classe persistida + pessoa). So destinatario ainda
  -- 'pending' entra: no legado, quem ja saiu pela fila antiga nunca recebe de novo; no
  -- rascunho todos estao 'pending'.
  SELECT count(*)::integer,
         count(*) FILTER (
           WHERE r.status = 'pending'
             AND r.eligibility IN ('eligible', 'media_pending', 'connection_unavailable', 'requires_template')
             AND (r.singu_contact_id IS NOT NULL OR r.destino_e164 IS NOT NULL)
         )::integer
    INTO v_recipients, v_eligible
    FROM public.multiplix_recipients AS r
   WHERE r.dispatch_id = p_dispatch_id;

  IF v_recipients = 0 THEN
    RAISE EXCEPTION 'multiplix_confirm_no_recipients' USING ERRCODE = '22023';
  END IF;
  IF v_eligible = 0 THEN
    RAISE EXCEPTION 'multiplix_confirm_no_eligible_recipients' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_blocks
    FROM public.multiplix_blocks AS b
   WHERE b.dispatch_id = p_dispatch_id;

  IF v_blocks = 0 THEN
    -- Rascunho do composer / legado: o texto do disparo vira o bloco unico (inserido no
    -- passo 5, depois da troca de status). Texto vazio nao vira fila.
    IF btrim(COALESCE(v_dispatch.message_template, '')) = '' THEN
      RAISE EXCEPTION 'multiplix_confirm_no_blocks' USING ERRCODE = '22023';
    END IF;
    v_bridge_block := true;
    v_blocks := 1;
  END IF;

  -- Conexao: a do disparo; sem uma, a primeira conectada (mesma regra do worker — o
  -- composer nao oferece escolha). Ordem estavel para a escolha nao variar entre chamadas.
  v_connection := v_dispatch.whatsapp_connection_id;
  IF v_connection IS NULL THEN
    SELECT c.id INTO v_connection
      FROM public.whatsapp_connections AS c
     WHERE c.status = 'connected'
     ORDER BY c.created_at, c.id
     LIMIT 1;
  END IF;
  IF v_connection IS NULL THEN
    RAISE EXCEPTION 'multiplix_confirm_connection_required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.whatsapp_connections AS c
     WHERE c.id = v_connection
       AND c.status = 'connected'
  ) THEN
    RAISE EXCEPTION 'multiplix_confirm_connection_unavailable' USING ERRCODE = '22023';
  END IF;

  -- ---- 4. estado final do disparo (ANTES de mexer em bloco) ----
  -- Sair de 'draft' primeiro deixa o gatilho de versao do F05 inerte para o resto da
  -- transacao: o bloco criado/hasheado abaixo nao versiona por cima do confirm.
  v_new_status := CASE WHEN v_scheduled IS NOT NULL
                       THEN 'scheduled'::public.multiplix_dispatch_status
                       ELSE 'sending'::public.multiplix_dispatch_status
                  END;

  UPDATE public.multiplix_dispatches AS d
     SET dispatch_version = v_candidate,
         audience_version = v_candidate,
         status = v_new_status,
         scheduled_at = v_scheduled,
         whatsapp_connection_id = v_connection,
         -- Legado preserva o total original (o progresso conta quem ja saiu pela fila antiga).
         total_recipients = CASE WHEN v_legacy THEN d.total_recipients ELSE v_eligible END,
         pause_reason = NULL,
         started_at = CASE WHEN v_scheduled IS NULL
                           THEN COALESCE(d.started_at, statement_timestamp())
                           ELSE d.started_at END,
         updated_at = statement_timestamp()
   WHERE d.id = p_dispatch_id;

  -- ---- 5. congelamento do publico e dos blocos ----
  UPDATE public.multiplix_recipients AS r
     SET audience_version = v_candidate,
         variables_snapshot = COALESCE(r.variables_snapshot, '{}'::jsonb)
           || jsonb_strip_nulls(jsonb_build_object(
                'audience_version', v_candidate,
                'frozen_at', statement_timestamp(),
                'company_id', r.company_id,
                'company_name', r.company_name_snapshot,
                'eligibility', r.eligibility::text,
                'inclusion_reason', r.inclusion_reason
              )),
         updated_at = statement_timestamp()
   WHERE r.dispatch_id = p_dispatch_id;

  IF v_bridge_block THEN
    INSERT INTO public.multiplix_blocks (dispatch_id, block_order, block_type, content)
    VALUES (p_dispatch_id, 1, 'text', jsonb_build_object('text', v_dispatch.message_template));
  END IF;

  UPDATE public.multiplix_blocks AS b
     SET content_hash = encode(extensions.digest(b.content::text, 'sha256'), 'hex'),
         updated_at = statement_timestamp()
   WHERE b.dispatch_id = p_dispatch_id;

  -- ---- 6. materializacao da fila (UMA linha por destinatario apto x bloco) ----
  SELECT count(*)::integer INTO v_items_before
    FROM public.multiplix_delivery_items AS item
   WHERE item.dispatch_id = p_dispatch_id;

  INSERT INTO public.multiplix_delivery_items AS item (
    dispatch_id, recipient_id, block_id, dispatch_version, status, next_attempt_at
  )
  SELECT p_dispatch_id, r.id, b.id, v_candidate, 'pending',
         CASE WHEN v_scheduled IS NOT NULL THEN v_scheduled END
    FROM public.multiplix_recipients AS r
    CROSS JOIN public.multiplix_blocks AS b
   WHERE r.dispatch_id = p_dispatch_id
     AND b.dispatch_id = p_dispatch_id
     AND r.status = 'pending'
     AND r.eligibility IN ('eligible', 'media_pending', 'connection_unavailable', 'requires_template')
     AND (r.singu_contact_id IS NOT NULL OR r.destino_e164 IS NOT NULL)
  ON CONFLICT (idempotency_key) DO NOTHING;

  GET DIAGNOSTICS v_items_created = ROW_COUNT;

  -- ---- 7. trilha (F34/F43) ----
  INSERT INTO public.multiplix_events (dispatch_id, kind, payload, correlation_id)
  VALUES (
    p_dispatch_id,
    CASE WHEN v_new_status = 'scheduled' THEN 'dispatch_scheduled' ELSE 'dispatch_started' END,
    jsonb_build_object(
      'dispatch_version', v_candidate,
      'recipients', v_eligible,
      'blocks', v_blocks,
      'items', v_items_created,
      'actor_id', p_actor_id,
      'legacy_paused', v_legacy,
      'block_from_template', v_bridge_block
    ),
    p_correlation_id
  );

  RETURN QUERY SELECT p_dispatch_id, v_candidate, v_new_status,
                      v_eligible, v_blocks, v_items_created, v_items_before + v_items_created,
                      true, v_scheduled;
END;
$function$;

REVOKE ALL ON FUNCTION public.multiplix_confirm_dispatch(uuid, uuid, boolean, integer, timestamp with time zone, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.multiplix_confirm_dispatch(uuid, uuid, boolean, integer, timestamp with time zone, uuid) TO service_role;

COMMENT ON FUNCTION public.multiplix_confirm_dispatch(uuid, uuid, boolean, integer, timestamp with time zone, uuid) IS
  'F51: confirma o disparo numa transacao — revalida (F49), congela publico/blocos, avanca '
  'dispatch_version e materializa multiplix_delivery_items. Idempotente por '
  '(dispatch_id, dispatch_version). Aceita rascunho, agendado e pausado SEM fila (legado); '
  'sem bloco usa o message_template como bloco texto; sem conexao fixa a primeira conectada. '
  'service_role apenas.';

COMMENT ON FUNCTION public.transition_multiplix_dispatch(uuid, text, text) IS
  'Transicao start/pause/cancel do Multiplix (service_role). start de draft/paused SEM fila '
  'materializada e recusado (multiplix_dispatch_confirm_required): iniciar exige o confirm.';

-- ---------------------------------------------------------------------------
-- 8. Pos-condicoes.
-- ---------------------------------------------------------------------------
DO $pos$
DECLARE
  v_src text;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p
   WHERE p.oid = 'public.transition_multiplix_dispatch(uuid, text, text)'::regprocedure;
  IF position('multiplix_dispatch_confirm_required' IN v_src) = 0 THEN
    RAISE EXCEPTION 'pos: transition sem a guarda de confirmacao';
  END IF;

  SELECT p.prosrc INTO v_src FROM pg_proc p
   WHERE p.oid = 'public.multiplix_bump_version_on_dispatch_edit()'::regprocedure;
  IF position('NEW.template' IN v_src) > 0 OR position('NEW.variables_snapshot' IN v_src) > 0 THEN
    RAISE EXCEPTION 'pos: gatilho de versao ainda cita coluna inexistente';
  END IF;

  IF has_function_privilege('anon', 'public.transition_multiplix_dispatch(uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.transition_multiplix_dispatch(uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.multiplix_confirm_dispatch(uuid, uuid, boolean, integer, timestamp with time zone, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.multiplix_confirm_dispatch(uuid, uuid, boolean, integer, timestamp with time zone, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos: ACL das RPCs do Multiplix mais larga que service_role';
  END IF;
END
$pos$;

NOTIFY pgrst, 'reload schema';

COMMIT;
