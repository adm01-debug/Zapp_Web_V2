-- talkx_lgpd_consentimento_expurgo
-- versão 20261003232707 reservada para hermes-talkx-lgpd-consentimento-expurgo-2610032219a047 em 2026-10-03T23:06:02-03:00 (hermes-db-migrar --nova)
-- nomes-antigos-conferidos: talkx_suppress_contact — o DROP FUNCTION IF EXISTS é só da assinatura antiga de 6 argumentos (pré-X029, já removida pela 20261002581230); a assinatura de 7 argumentos (p_campaign_id) é recriada por CREATE OR REPLACE e as 3 referências no código chamam via supabase.rpc com a assinatura nova.
-- x032_lgpd_consentimento_e_expurgo
-- rollback: 1) recriar public.trigger_talkx_engine_tick() com o corpo vivo de 20261001391230
--              (sem a chamada a purge_talkx_expired_data); 2) DROP FUNCTION IF EXISTS
--              public.purge_talkx_expired_data(integer); 3) recriar public.transition_talkx_campaign
--              com o corpo de 20261003172707 (sem o gate de consentimento no start);
--              4) recriar public.enforce_talkx_campaign_mutability com o corpo de
--              20261003222707 (sem o gate scheduled); 5) recriar public.save_talkx_campaign_draft
--              com o corpo de 20261002551230 (sem consent_confirmed_by/at/legal_basis);
--              6) recriar public.talkx_audience_query com o corpo de 20261002391230 (sem o filtro
--              de consentimento); 7) recriar public.talkx_suppress_contact com o corpo de
--              20261002581230 (sem o UPDATE de consent_status); 8) recriar o trigger
--              trg_talkx_blacklist_consent_revoked se ele tiver sido criado aqui; 9) ALTER TABLE
--              public.talkx_campaigns DROP CONSTRAINT IF EXISTS talkx_campaigns_legal_basis_check,
--              DROP COLUMN IF EXISTS consent_confirmed_by, DROP COLUMN IF EXISTS consent_confirmed_at,
--              DROP COLUMN IF EXISTS legal_basis; 10) DELETE FROM public.talkx_settings WHERE key IN
--              ('require_granted_consent','retention_days_message','retention_days_clicks',
--              'retention_days_test_sends','retention_days_ai','last_purge_at').
--
-- X032 (Fase 3 · Tela 03/09 · camada banco + cron · DDL). Fecha CAP-104, CAP-105, CAP-106.
-- Exige X012, X016, X024, X029 (todas mergeadas).
--
-- HOJE: contacts.consent_status e 'unknown' em toda a base; o envio/audiencia nunca consulta
-- consentimento; nao ha expurgo (o comentario 'job de limpeza (E89+)' de 20260910080000 nunca
-- virou job); personalized_message e talkx_link_clicks.ua/ip_hash ficam guardados sem prazo.
--
-- FAZER (esta migration):
--   (a) talkx_campaigns.consent_confirmed_by / consent_confirmed_at / legal_basis
--       ('consent'|'legitimate_interest'|'contract'), gravados por save_talkx_campaign_draft;
--   (b) public.talkx_audience_query exclui SEMPRE consent_status='revoked' e, com o setting
--       require_granted_consent ligado (padrao desligado), exige 'granted';
--   (c) public.talkx_suppress_contact com origem 'auto_optout' marca contacts.consent_status
--       como 'revoked' (N10: bloquear so quem revogou);
--   (d) public.enforce_talkx_campaign_mutability recusa agendar (NEW.status='scheduled') sem
--       consent_confirmed_at; public.transition_talkx_campaign recusa 'start' sem confirmacao;
--   (e) settings de retencao + funcao public.purge_talkx_expired_data(p_limit) chamada UMA VEZ
--       POR DIA pelo tick (controle em talkx_settings.last_purge_at): anula texto/snapshots de
--       midia de destinatarios de campanhas terminais vencidas, limpa ua/ip_hash, apaga linhas
--       vencidas de teste (talkx_test_send_claims) e de IA (ai_jobs terminais), e objetos de
--       talkx-media sem referencia; grava evento com as contagens. Nunca apaga talkx_blacklist,
--       contadores nem eventos.
--
-- REGRA DE RECONSTRUCAO: os corpos de talkx_audience_query (20261002391230),
-- talkx_suppress_contact (20261002581230), save_talkx_campaign_draft (20261002551230),
-- enforce_talkx_campaign_mutability (20261003222707), transition_talkx_campaign (20261003172707)
-- e trigger_talkx_engine_tick (20261001391230) foram COPIADOS VIVOS da migration mais recente de
-- cada um; so o delta do X032 foi aplicado.
--
-- Classe: CONTRATO (ALTER TABLE + CREATE OR REPLACE FUNCTION + CREATE TABLE event trigger + ACL).
-- Idempotente/replayavel: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, ON CONFLICT DO NOTHING,
-- DROP FUNCTION/TRIGGER IF EXISTS. A ordem merge -> deploy -> apply vale porque o front que
-- grava consent_confirmed_* e a leitura nova ainda nao existem em producao.

-- ============================================================================
-- (a) colunas de consentimento da campanha
-- ============================================================================
ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS consent_confirmed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consent_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS legal_basis text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'talkx_campaigns_legal_basis_check'
       AND conrelid = 'public.talkx_campaigns'::regclass
  ) THEN
    ALTER TABLE public.talkx_campaigns
      ADD CONSTRAINT talkx_campaigns_legal_basis_check
      CHECK (legal_basis IS NULL OR legal_basis IN ('consent', 'legitimate_interest', 'contract'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.talkx_campaigns.consent_confirmed_by IS
  'X032: perfil do operador que confirmou a base legal/consentimento no lancamento da campanha.';
COMMENT ON COLUMN public.talkx_campaigns.consent_confirmed_at IS
  'X032: instante da confirmacao de consentimento; sem ele, agendar e iniciar sao recusados.';
COMMENT ON COLUMN public.talkx_campaigns.legal_basis IS
  'X032: base legal da campanha — consent | legitimate_interest | contract (NULL = nao informada).';

-- ============================================================================
-- (e0) settings de consentimento e retencao
-- ============================================================================
INSERT INTO public.talkx_settings (key, value, description) VALUES
  ('require_granted_consent',   'false'::jsonb,
     'X032: quando true, a audiencia exige consent_status = granted (alem de excluir revoked). Padrao false.'),
  ('retention_days_message',    '180'::jsonb,
     'X032: dias de retencao do texto/snapshot de midia dos destinatarios de campanhas terminais.'),
  ('retention_days_clicks',     '365'::jsonb,
     'X032: dias de retencao de ua/ip_hash em talkx_link_clicks.'),
  ('retention_days_test_sends', '90'::jsonb,
     'X032: dias de retencao das linhas de envio de teste (talkx_test_send_claims).'),
  ('retention_days_ai',         '90'::jsonb,
     'X032: dias de retencao de linhas terminais de IA (ai_jobs).'),
  ('last_purge_at',             'null'::jsonb,
     'X032: instante do ultimo expurgo (purge_talkx_expired_data). Controle de uma execucao por dia.')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- (b) talkx_audience_query — corpo vivo 20261002391230 + delta de consentimento
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_audience_query(
  p_rules jsonb,
  p_contact_ids uuid[] DEFAULT NULL,
  p_respect_suppression boolean DEFAULT true
)
RETURNS TABLE (id uuid, legacy_or_deleted boolean, invalid_phone boolean, is_suppressed boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_phone_regex constant text := '^[0-9]{10,15}$';
  v_backslash_d constant text := '\D';
  v_groups jsonb;
  v_group jsonb;
  v_rule jsonb;
  v_match text;
  v_field text;
  v_op text;
  v_value text;
  v_kind text;
  v_col text;
  v_like text;
  v_ops text[];
  v_rule_sql text;
  v_rules_sql text[];
  v_groups_sql text[] := ARRAY[]::text[];
  v_where text;
  v_sql text;
  v_threshold timestamptz;
  v_days integer;
  v_respect boolean := COALESCE(p_respect_suppression, true);
  v_require_granted boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'talkx_audience_authentication_required' USING ERRCODE = '42501';
  END IF;

  v_where := format('public.is_contact_visible_to_user(c.id, %L::uuid)', v_uid);

  IF p_contact_ids IS NOT NULL THEN
    v_where := v_where || format(' AND c.id = ANY(%L::uuid[])', p_contact_ids);
  END IF;

  -- X032 (N10): quem pediu para sair NUNCA volta a audiencia. O filtro e mandatorio e
  -- independe das regras do usuario; NULL (desconhecido) continua entrando.
  v_where := v_where || ' AND c.consent_status IS DISTINCT FROM ''revoked''';

  -- X032: modo estrito opcional. Padrao DESLIGADO — so passou a existir a coluna agora e
  -- a base inteira esta 'unknown'; ligar por padrao zeraria a audiencia.
  SELECT COALESCE((settings.value #>> '{}')::boolean, false)
    INTO v_require_granted
    FROM public.talkx_settings AS settings
   WHERE settings.key = 'require_granted_consent';
  IF v_require_granted IS TRUE THEN
    v_where := v_where || ' AND c.consent_status = ''granted''';
  END IF;

  IF p_rules IS NOT NULL THEN
    IF jsonb_typeof(p_rules) <> 'object' THEN
      RAISE EXCEPTION 'invalid_talkx_audience_rules' USING ERRCODE = '22023';
    END IF;

    v_groups := p_rules -> 'groups';
    IF v_groups IS NOT NULL THEN
      IF jsonb_typeof(v_groups) <> 'array' THEN
        RAISE EXCEPTION 'invalid_talkx_audience_rules' USING ERRCODE = '22023';
      END IF;

      FOR v_group IN SELECT grp.value FROM jsonb_array_elements(v_groups) AS grp(value) LOOP
        IF jsonb_typeof(v_group) <> 'object' THEN
          RAISE EXCEPTION 'invalid_talkx_audience_group' USING ERRCODE = '22023';
        END IF;

        v_match := v_group ->> 'match';
        IF v_match IS NULL OR v_match NOT IN ('and', 'or') THEN
          RAISE EXCEPTION 'invalid_talkx_audience_group_match' USING ERRCODE = '22023';
        END IF;

        IF jsonb_typeof(v_group -> 'rules') <> 'array' THEN
          RAISE EXCEPTION 'invalid_talkx_audience_group_rules' USING ERRCODE = '22023';
        END IF;

        v_rules_sql := ARRAY[]::text[];

        FOR v_rule IN SELECT r.value FROM jsonb_array_elements(v_group -> 'rules') AS r(value) LOOP
          IF jsonb_typeof(v_rule) <> 'object' THEN
            RAISE EXCEPTION 'invalid_talkx_audience_rule' USING ERRCODE = '22023';
          END IF;

          v_field := v_rule ->> 'field';
          v_op := v_rule ->> 'op';
          v_value := v_rule ->> 'value';

          -- Whitelist de campo (RULE_FIELDS) e o kind que decide os operadores.
          v_kind := CASE v_field
            WHEN 'tags' THEN 'array'
            WHEN 'company' THEN 'text'
            WHEN 'city' THEN 'text'
            WHEN 'state' THEN 'text'
            WHEN 'group_category' THEN 'enum'
            WHEN 'email' THEN 'text'
            WHEN 'channel_type' THEN 'text'
            WHEN 'lead_origin' THEN 'text'
            WHEN 'assigned_to' THEN 'uuid'
            WHEN 'contact_type' THEN 'enum'
            WHEN 'conversation_status' THEN 'enum'
            WHEN 'lead_score' THEN 'number'
            WHEN 'risk_score' THEN 'number'
            WHEN 'ai_priority' THEN 'enum'
            WHEN 'ai_sentiment' THEN 'enum'
            WHEN 'updated_at' THEN 'date'
            WHEN 'created_at' THEN 'date'
            WHEN 'consent_status' THEN 'enum'
            ELSE NULL
          END;
          IF v_kind IS NULL THEN
            RAISE EXCEPTION 'invalid_talkx_audience_field' USING ERRCODE = '22023';
          END IF;

          -- Whitelist de operador por kind (RULE_OPS).
          v_ops := CASE v_kind
            WHEN 'text' THEN ARRAY['eq','neq','contains','not_contains','is_set','is_empty']
            WHEN 'enum' THEN ARRAY['eq','neq','is_empty']
            WHEN 'uuid' THEN ARRAY['eq','neq','is_empty']
            WHEN 'array' THEN ARRAY['contains','not_contains','is_empty']
            WHEN 'number' THEN ARRAY['eq','gt','gte','lt','lte']
            WHEN 'date' THEN ARRAY['in_last_days','not_in_last_days']
          END;
          IF v_op IS NULL OR NOT (v_op = ANY(v_ops)) THEN
            RAISE EXCEPTION 'invalid_talkx_audience_operator' USING ERRCODE = '22023';
          END IF;

          IF v_op <> 'is_set' AND v_op <> 'is_empty'
             AND (v_value IS NULL OR btrim(v_value) = '') THEN
            RAISE EXCEPTION 'invalid_talkx_audience_rule_value' USING ERRCODE = '22023';
          END IF;

          -- Valida o tipo do valor ANTES de montar o cast, para o erro de contrato ser
          -- sempre 22023 (nunca um 22P02 cru do ::numeric/::uuid/::integer).
          IF v_kind = 'number' THEN
            BEGIN PERFORM btrim(v_value)::numeric; EXCEPTION WHEN others THEN
              RAISE EXCEPTION 'invalid_talkx_audience_rule_value' USING ERRCODE = '22023';
            END;
          ELSIF v_kind = 'uuid' AND v_op <> 'is_empty' THEN
            BEGIN PERFORM btrim(v_value)::uuid; EXCEPTION WHEN others THEN
              RAISE EXCEPTION 'invalid_talkx_audience_rule_value' USING ERRCODE = '22023';
            END;
          ELSIF v_kind = 'date' THEN
            BEGIN v_days := btrim(v_value)::integer; EXCEPTION WHEN others THEN
              RAISE EXCEPTION 'invalid_talkx_audience_rule_value' USING ERRCODE = '22023';
            END;
            IF v_days IS NULL OR v_days < 1 THEN
              RAISE EXCEPTION 'invalid_talkx_audience_rule_value' USING ERRCODE = '22023';
            END IF;
          END IF;

          v_col := format('c.%I', v_field);

          IF v_op = 'is_set' THEN
            v_rule_sql := format('%s IS NOT NULL', v_col);
          ELSIF v_op = 'is_empty' THEN
            IF v_kind = 'array' THEN
              v_rule_sql := format('(%s IS NULL OR %s = %L::text[])', v_col, v_col, '{}');
            ELSIF v_kind = 'uuid' THEN
              v_rule_sql := format('%s IS NULL', v_col);
            ELSE
              v_rule_sql := format('(%s IS NULL OR %s = %L)', v_col, v_col, '');
            END IF;
          ELSIF v_op = 'contains' THEN
            IF v_kind = 'array' THEN
              v_rule_sql := format('%s @> ARRAY[%L]::text[]', v_col, v_value);
            ELSE
              v_like := '%' || v_value || '%';
              v_rule_sql := format('%s ILIKE %L', v_col, v_like);
            END IF;
          ELSIF v_op = 'not_contains' THEN
            IF v_kind = 'array' THEN
              v_rule_sql := format('(%s IS NULL OR NOT (%s @> ARRAY[%L]::text[]))', v_col, v_col, v_value);
            ELSE
              v_like := '%' || v_value || '%';
              v_rule_sql := format('(%s IS NULL OR %s NOT ILIKE %L)', v_col, v_col, v_like);
            END IF;
          ELSIF v_op = 'eq' THEN
            IF v_kind = 'number' THEN
              v_rule_sql := format('%s = %L::numeric', v_col, v_value);
            ELSIF v_kind = 'uuid' THEN
              v_rule_sql := format('%s = %L::uuid', v_col, v_value);
            ELSE
              v_rule_sql := format('%s = %L', v_col, v_value);
            END IF;
          ELSIF v_op = 'neq' THEN
            IF v_kind = 'number' THEN
              v_rule_sql := format('(%s IS NULL OR %s <> %L::numeric)', v_col, v_col, v_value);
            ELSIF v_kind = 'uuid' THEN
              v_rule_sql := format('(%s IS NULL OR %s <> %L::uuid)', v_col, v_col, v_value);
            ELSE
              v_rule_sql := format('(%s IS NULL OR %s <> %L)', v_col, v_col, v_value);
            END IF;
          ELSIF v_op IN ('gt', 'gte', 'lt', 'lte') THEN
            v_rule_sql := format('%s %s %L::numeric', v_col,
              CASE v_op WHEN 'gt' THEN '>' WHEN 'gte' THEN '>=' WHEN 'lt' THEN '<' ELSE '<=' END,
              v_value);
          ELSIF v_op = 'in_last_days' OR v_op = 'not_in_last_days' THEN
            -- Inicio do dia de calendario em Sao Paulo, (dias-1) atras — mesma semantica
            -- de zonedDayStartISO(SEGMENT_TIMEZONE, dias - 1) no front.
            SELECT ((date_trunc('day', statement_timestamp() AT TIME ZONE 'America/Sao_Paulo')
                     - ((v_days - 1) || ' days')::interval)
                    AT TIME ZONE 'America/Sao_Paulo')
              INTO v_threshold;
            IF v_op = 'in_last_days' THEN
              v_rule_sql := format('%s >= %L::timestamptz', v_col, v_threshold);
            ELSE
              v_rule_sql := format('%s < %L::timestamptz', v_col, v_threshold);
            END IF;
          END IF;

          v_rules_sql := v_rules_sql || v_rule_sql;
        END LOOP;

        IF array_length(v_rules_sql, 1) > 0 THEN
          IF v_match = 'or' THEN
            v_groups_sql := v_groups_sql || ('(' || array_to_string(v_rules_sql, ' OR ') || ')');
          ELSE
            v_groups_sql := v_groups_sql || ('(' || array_to_string(v_rules_sql, ' AND ') || ')');
          END IF;
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF array_length(v_groups_sql, 1) > 0 THEN
    v_where := v_where || ' AND (' || array_to_string(v_groups_sql, ' OR ') || ')';
  END IF;

  -- Toda classificacao e calculada em SQL parametrizado. A supressao por telefone compara
  -- o telefone normalizado dos dois lados (`\D` removido), como o app faz na blacklist.
  v_sql := format(
    'SELECT c.id, '
    || '(c.deleted_at IS NOT NULL OR c.is_lid_legacy) AS legacy_or_deleted, '
    || '(c.deleted_at IS NULL AND c.is_lid_legacy = false AND c.phone !~ %L) AS invalid_phone, '
    || '(%s AND c.deleted_at IS NULL AND c.is_lid_legacy = false AND c.phone ~ %L AND EXISTS ('
    ||     'SELECT 1 FROM public.talkx_blacklist bl '
    ||     'WHERE bl.removed_at IS NULL '
    ||     'AND (bl.expires_at IS NULL OR bl.expires_at > statement_timestamp()) '
    ||     'AND (bl.contact_id = c.id OR (bl.phone IS NOT NULL '
    ||          'AND regexp_replace(bl.phone, %L, %L, %L) = regexp_replace(c.phone, %L, %L, %L))))) AS is_suppressed '
    || 'FROM public.contacts c WHERE %s',
    v_phone_regex,
    CASE WHEN v_respect THEN 'true' ELSE 'false' END,
    v_phone_regex,
    v_backslash_d, '', 'g',
    v_backslash_d, '', 'g',
    v_where
  );

  RETURN QUERY EXECUTE v_sql;
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_audience_query(jsonb, uuid[], boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_audience_query(jsonb, uuid[], boolean)
  TO service_role;

COMMENT ON FUNCTION public.talkx_audience_query(jsonb, uuid[], boolean) IS
  'Talk X (X016 + X032): audiencia interna. Elegibilidade + supressao iguais a X016; alem disso exclui SEMPRE consent_status=revoked e, com o setting require_granted_consent=true, exige granted.';

-- ============================================================================
-- (c) talkx_suppress_contact — corpo vivo 20261002581230 + consent_status revogado
-- ============================================================================
-- A assinatura de 6 argumentos ja nao existe em producao (dropada na X029); o DROP abaixo e
-- defensivo para nao recriar ambiguidade 42725 num replay da X029 sobre esta.
DROP FUNCTION IF EXISTS public.talkx_suppress_contact(
  uuid, text, text, public.talkx_blacklist_reason, text, uuid
);

CREATE OR REPLACE FUNCTION public.talkx_suppress_contact(
  p_contact_id uuid,
  p_phone text,
  p_reason text,
  p_reason_code public.talkx_blacklist_reason,
  p_origin text,
  p_source_message_id uuid,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id uuid;
  v_campaign_id uuid := p_campaign_id;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  -- X029: sem campanha informada, o opt-out automatico herda a campanha do envio
  -- mais recente ao contato (o pedido de saida fica ligado a campanha que o gerou,
  -- em vez de nascer orfao).
  IF v_campaign_id IS NULL
     AND p_origin = 'auto_optout'
     AND p_contact_id IS NOT NULL THEN
    SELECT r.campaign_id
      INTO v_campaign_id
      FROM public.talkx_recipients AS r
     WHERE r.contact_id = p_contact_id
       AND r.sent_at IS NOT NULL
     ORDER BY r.sent_at DESC, r.id DESC
     LIMIT 1;
  END IF;

  -- X029: o indice unico ativo ignora expires_at, entao uma supressao EXPIRADA
  -- bloqueia o INSERT novo no ON CONFLICT DO NOTHING. Encerra a expirada
  -- (removed_at) e insere a nova NA MESMA transacao — nada fica visivel no meio.
  -- So a expirada e encerrada: uma supressao ativa e vigente segue vencendo o
  -- conflito e devolvendo NULL (idempotencia preservada).
  UPDATE public.talkx_blacklist AS b
     SET removed_at = statement_timestamp()
   WHERE b.removed_at IS NULL
     AND b.expires_at IS NOT NULL
     AND b.expires_at <= statement_timestamp()
     AND (
       (p_contact_id IS NOT NULL AND b.contact_id = p_contact_id)
       OR (p_phone IS NOT NULL AND b.phone = p_phone)
     );

  INSERT INTO public.talkx_blacklist
    (contact_id, phone, reason, reason_code, origin, source_message_id, campaign_id)
  VALUES
    (p_contact_id, p_phone, p_reason, p_reason_code, p_origin, p_source_message_id, v_campaign_id)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  -- X032 (N10): o pedido de saida automatico marca o contato como 'revoked'. Fica FORA da
  -- audiencia (talkx_audience_query sempre exclui revoked) e so quem revogou e bloqueado —
  -- a base inteira continua 'unknown' entrando. Idempotente: repetir nao muda o resultado.
  IF p_origin = 'auto_optout' AND p_contact_id IS NOT NULL THEN
    UPDATE public.contacts AS c
       SET consent_status = 'revoked',
           updated_at = statement_timestamp()
     WHERE c.id = p_contact_id
       AND c.consent_status IS DISTINCT FROM 'revoked';
  END IF;

  RETURN v_id; -- NULL => ja havia supressao ATIVA nao expirada (idempotente, em qualquer eixo)
END;
$fn$;

REVOKE ALL ON FUNCTION public.talkx_suppress_contact(
  uuid, text, text, public.talkx_blacklist_reason, text, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_suppress_contact(
  uuid, text, text, public.talkx_blacklist_reason, text, uuid, uuid
) TO service_role;

COMMENT ON FUNCTION public.talkx_suppress_contact(
  uuid, text, text, public.talkx_blacklist_reason, text, uuid, uuid
) IS
  'Talk X (X029 + X032): supressao idempotente nos eixos contact_id e phone. Origem auto_optout marca o contato como consent_status=revoked (N10).';

-- ============================================================================
-- (d) gates de consentimento: agendar (trigger) e start (RPC)
-- ============================================================================
-- Corpo vivo: 20261003222707 (X031) + gate scheduled.
CREATE OR REPLACE FUNCTION public.enforce_talkx_campaign_mutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- X010: worker_id/worker_lease_expires_at NUNCA são escritos à mão. Só a RPC de
  -- lease (claim/release) liga app.talkx_worker_write, de forma transacional. Vale
  -- para QUALQUER papel — inclusive service_role — porque a trava é por campanha,
  -- não por destinatário.
  IF TG_OP = 'UPDATE'
     AND (NEW.worker_id IS DISTINCT FROM OLD.worker_id
          OR NEW.worker_lease_expires_at IS DISTINCT FROM OLD.worker_lease_expires_at)
     AND current_setting('app.talkx_worker_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'talkx_campaign_worker_managed_by_lease' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(auth.role(), '') <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'talkx_campaign_insert_must_be_draft' USING ERRCODE = '22023';
    END IF;
    IF NEW.total_recipients <> 0
       OR NEW.sent_count <> 0
       OR NEW.failed_count <> 0
       OR NEW.delivered_count <> 0
       OR NEW.outcome_unknown_count <> 0
       OR NEW.replied_count <> 0
       OR NEW.read_count <> 0
       OR NEW.skipped_count <> 0
       OR NEW.started_at IS NOT NULL
       OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- X026: além do rascunho, a RPC delete_talkx_campaign pode apagar 'scheduled'
    -- (sem envio). A fuga é transacional (app.talkx_campaign_delete) e NUNCA cobre
    -- 'sending'/'paused'/'completed'/'cancelled' — esses continuam recusados aqui.
    IF OLD.status <> 'draft'
       AND NOT (OLD.status = 'scheduled'
                AND current_setting('app.talkx_campaign_delete', true) = 'on') THEN
      RAISE EXCEPTION 'talkx_campaign_delete_denied' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'talkx_campaign_owner_immutable' USING ERRCODE = '42501';
  END IF;

  -- Escape hatch sancionado: só a RPC update_talkx_campaign_limits liga essa flag
  -- (transacional, nunca vaza para outra sessão). Ele permite os limites mudarem em
  -- qualquer status, mas status/dono/estado de entrega continuam geridos pelo worker
  -- e pelo dono. Defesa em profundidade (achado #6): o GUC sozinho não basta — o
  -- chamador precisa ser o dono da campanha (perfil ativo) ou admin/supervisor.
  IF current_setting('app.talkx_limits_write', true) = 'on' THEN
    IF NOT (
      EXISTS (
        SELECT 1
          FROM public.profiles profile
         WHERE profile.user_id = auth.uid()
           AND profile.is_active = true
           AND profile.id = NEW.created_by
      )
      OR COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS TRUE
    ) THEN
      RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'talkx_campaign_transition_denied' USING ERRCODE = '55000';
    END IF;
    IF NEW.total_recipients IS DISTINCT FROM OLD.total_recipients
       OR NEW.sent_count IS DISTINCT FROM OLD.sent_count
       OR NEW.failed_count IS DISTINCT FROM OLD.failed_count
       OR NEW.delivered_count IS DISTINCT FROM OLD.delivered_count
       OR NEW.outcome_unknown_count IS DISTINCT FROM OLD.outcome_unknown_count
       OR NEW.replied_count IS DISTINCT FROM OLD.replied_count
       OR NEW.read_count IS DISTINCT FROM OLD.read_count
       OR NEW.skipped_count IS DISTINCT FROM OLD.skipped_count
       OR NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
      RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- X031: fuga sancionada do retry/resolução. Só a RPC retry_talkx_recipients /
  -- resolve_talkx_outcome_unknown liga app.talkx_retry_write (transacional). Ela
  -- permite (a) ajustar os contadores de entrega e (b) reabrir 'completed' -> 'sending';
  -- NENHUMA outra transição passa por aqui. Defesa em profundidade: além do GUC, o
  -- chamador precisa ser admin/supervisor.
  IF current_setting('app.talkx_retry_write', true) = 'on' THEN
    IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
      RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'completed' AND NEW.status = 'sending') THEN
      RAISE EXCEPTION 'talkx_campaign_transition_denied' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status NOT IN ('draft', 'scheduled')
     OR NEW.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_campaign_transition_denied' USING ERRCODE = '55000';
  END IF;

  -- X014: agendar (ou manter agendado) é ato de admin/supervisor. A RLS de UPDATE
  -- também exige o papel; aqui é defesa em profundidade contra quem alcança a
  -- tabela por caminho que não passe pela policy.
  IF NEW.status = 'scheduled'
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_schedule_role_required' USING ERRCODE = '42501';
  END IF;

  -- X032: agendar exige a confirmacao de consentimento/base legal gravada. Sem ela, a
  -- campanha so pode continuar rascunho.
  IF NEW.status = 'scheduled'
     AND NEW.consent_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'talkx_schedule_requires_consent_confirmation' USING ERRCODE = '22023';
  END IF;

  IF NEW.status = 'scheduled'
     AND (NEW.scheduled_at IS NULL OR NEW.total_recipients <= 0) THEN
    RAISE EXCEPTION 'talkx_schedule_requires_audience_and_timestamp' USING ERRCODE = '22023';
  END IF;

  IF NEW.status = 'scheduled'
     AND NEW.scheduled_at <= statement_timestamp() THEN
    RAISE EXCEPTION 'talkx_schedule_must_be_future' USING ERRCODE = '22023';
  END IF;

  -- X009: sair de draft exige mensagem não vazia OU mídia — uma campanha agendada
  -- sem nada para enviar é recusada.
  IF NEW.status = 'scheduled'
     AND btrim(COALESCE(NEW.message_template, '')) = ''
     AND NEW.media_url IS NULL THEN
    RAISE EXCEPTION 'talkx_schedule_requires_message_or_media' USING ERRCODE = '22023';
  END IF;

  IF NEW.total_recipients IS DISTINCT FROM OLD.total_recipients
     AND current_setting('app.talkx_recipient_snapshot_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'talkx_recipient_count_managed' USING ERRCODE = '42501';
  END IF;

  IF NEW.sent_count IS DISTINCT FROM OLD.sent_count
     OR NEW.failed_count IS DISTINCT FROM OLD.failed_count
     OR NEW.delivered_count IS DISTINCT FROM OLD.delivered_count
     OR NEW.outcome_unknown_count IS DISTINCT FROM OLD.outcome_unknown_count
     OR NEW.replied_count IS DISTINCT FROM OLD.replied_count
     OR NEW.read_count IS DISTINCT FROM OLD.read_count
     OR NEW.skipped_count IS DISTINCT FROM OLD.skipped_count
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_talkx_campaign_mutability() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_talkx_campaign_mutability ON public.talkx_campaigns;
CREATE TRIGGER enforce_talkx_campaign_mutability
  BEFORE INSERT OR DELETE OR UPDATE ON public.talkx_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_talkx_campaign_mutability();

-- Corpo vivo: 20261003172707 (X024) + gate de consentimento no start.
CREATE OR REPLACE FUNCTION public.transition_talkx_campaign(
  p_campaign_id  uuid,
  p_action       text,
  p_pause_reason text DEFAULT NULL,
  p_actor_id     uuid DEFAULT NULL
)
RETURNS TABLE(campaign_id uuid, previous_status text, current_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_next_status text;
  v_event_type  text;
  v_event_msg   text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL OR p_action NOT IN ('start', 'pause', 'cancel') THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_transition' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_campaign
  FROM public.talkx_campaigns AS campaign
  WHERE campaign.id = p_campaign_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  CASE p_action
    WHEN 'start' THEN
      IF v_campaign.status = 'sending' THEN
        -- X010: retomada idempotente — já enviando, a transição é no-op e NÃO toca
        -- em started_at (o UPDATE abaixo nem chega a rodar).
        RETURN QUERY SELECT p_campaign_id, 'sending', 'sending';
        RETURN;
      END IF;
      IF v_campaign.status NOT IN ('draft', 'scheduled', 'paused') THEN
        RAISE EXCEPTION 'talkx_campaign_start_denied_from_%', v_campaign.status USING ERRCODE = '55000';
      END IF;
      -- X032: iniciar exige a confirmacao de consentimento/base legal gravada.
      IF v_campaign.consent_confirmed_at IS NULL THEN
        RAISE EXCEPTION 'talkx_campaign_consent_required' USING ERRCODE = '22023';
      END IF;
      IF btrim(COALESCE(v_campaign.message_template, '')) = '' THEN
        RAISE EXCEPTION 'talkx_campaign_message_required' USING ERRCODE = '22023';
      END IF;
      IF v_campaign.total_recipients <= 0
         OR NOT EXISTS (
           SELECT 1 FROM public.talkx_recipients AS recipient
           WHERE recipient.campaign_id = p_campaign_id
         ) THEN
        RAISE EXCEPTION 'talkx_campaign_recipients_required' USING ERRCODE = '22023';
      END IF;
      v_next_status := 'sending';
      -- X024: retomada distinta — com ator é 'resumed', sem ator (worker/cron) é 'resumed_auto'.
      v_event_type := CASE
        WHEN v_campaign.status = 'paused' THEN
          CASE WHEN p_actor_id IS NULL THEN 'resumed_auto' ELSE 'resumed' END
        ELSE 'started'
      END;
      v_event_msg := NULL;
    WHEN 'pause' THEN
      IF v_campaign.status <> 'sending' THEN
        RAISE EXCEPTION 'talkx_campaign_pause_denied_from_%', v_campaign.status USING ERRCODE = '55000';
      END IF;
      v_next_status := 'paused';
      v_event_type := 'paused';
      v_event_msg := p_pause_reason;
    WHEN 'cancel' THEN
      IF v_campaign.status NOT IN ('draft', 'scheduled', 'sending', 'paused') THEN
        RAISE EXCEPTION 'talkx_campaign_cancel_denied_from_%', v_campaign.status USING ERRCODE = '55000';
      END IF;
      v_next_status := 'cancelled';
      v_event_type := 'cancelled';
      v_event_msg := NULL;
      -- V14 + X024: fecha a fila — pendentes e em voo viram cancelled; leases são soltas
      -- sem dispatch (delivery_claim_* = NULL respeita o CHECK talkx_recipients_delivery_claim_state).
      UPDATE public.talkx_recipients AS recipient
      SET status = 'cancelled',
          delivery_claim_token = NULL,
          delivery_claimed_at = NULL,
          delivery_claim_expires_at = NULL,
          delivery_claimed_by = NULL,
          updated_at = statement_timestamp()
      WHERE recipient.campaign_id = p_campaign_id
        AND recipient.status IN ('pending', 'sending');
  END CASE;
  UPDATE public.talkx_campaigns AS campaign
  SET status       = v_next_status,
      pause_reason = CASE WHEN p_action = 'pause' THEN p_pause_reason ELSE NULL END,
      started_at   = CASE WHEN p_action = 'start'
        THEN COALESCE(campaign.started_at, statement_timestamp())
        ELSE campaign.started_at END,
      launched_by  = CASE WHEN p_action = 'start'
        THEN COALESCE(campaign.launched_by, p_actor_id)
        ELSE campaign.launched_by END,
      launched_at  = CASE WHEN p_action = 'start'
        THEN COALESCE(campaign.launched_at, statement_timestamp())
        ELSE campaign.launched_at END,
      paused_at    = CASE WHEN p_action = 'pause' THEN statement_timestamp() ELSE campaign.paused_at END,
      paused_by    = CASE
        WHEN p_action = 'pause' THEN p_actor_id
        WHEN p_action = 'start' THEN NULL
        ELSE campaign.paused_by END,
      cancelled_at = CASE WHEN p_action = 'cancel' THEN statement_timestamp() ELSE campaign.cancelled_at END,
      cancelled_by = CASE WHEN p_action = 'cancel' THEN p_actor_id ELSE campaign.cancelled_by END,
      -- X024: cancelar solta a trava do worker — nenhum worker continua a campanha.
      worker_id    = CASE WHEN p_action = 'cancel' THEN NULL ELSE campaign.worker_id END,
      worker_lease_expires_at = CASE WHEN p_action = 'cancel' THEN NULL ELSE campaign.worker_lease_expires_at END,
      updated_at   = statement_timestamp()
  WHERE campaign.id = p_campaign_id;

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id)
  VALUES (p_campaign_id, v_event_type, v_event_msg, p_actor_id);

  RETURN QUERY SELECT p_campaign_id, v_campaign.status, v_next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_talkx_campaign(uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_talkx_campaign(uuid, text, text, uuid)
  TO service_role;

COMMENT ON FUNCTION public.transition_talkx_campaign(uuid, text, text, uuid) IS
  'Talk X (X024 + X032): transicoes start/pause/cancel com evento, ator e motivo. X032: start recusa campanha sem consent_confirmed_at (talkx_campaign_consent_required).';

-- ============================================================================
-- (a2) save_talkx_campaign_draft — corpo vivo 20261002551230 + consentimento
-- ============================================================================
CREATE OR REPLACE FUNCTION public.save_talkx_campaign_draft(
  p_campaign_id uuid,
  p_expected_revision bigint,
  p_creation_key uuid,
  p_payload jsonb
)
RETURNS TABLE(campaign_id uuid, revision bigint, creation_replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_now timestamptz := statement_timestamp();
  v_name text;
  v_message_template text;
  v_description text;
  v_objective text;
  v_audience_source text;
  v_audience_filters jsonb;
  v_segment_id uuid;
  v_template_id uuid;
  v_connection_id uuid;
  v_media_url text;
  v_media_type text;
  v_scheduled_at timestamptz;
  v_schedule_timezone text;
  v_window_start time;
  v_window_end time;
  v_speed_profile text;
  v_typing_delay_min integer;
  v_typing_delay_max integer;
  v_send_interval_min integer;
  v_send_interval_max integer;
  v_business_hours_only boolean;
  v_respect_suppression boolean;
  v_confirm_consent boolean;
  v_legal_basis text;
  v_consent_by uuid;
  v_consent_at timestamptz;
  v_draft_step integer;
  v_owner uuid;
  v_template_version_id uuid;
  v_requested_status text;
  v_max_per_minute smallint;
  v_pace record;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor_profile_id
   FROM public.profiles profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1
   FOR SHARE;
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;

  -- X014: criar/editar rascunho é ato de admin/supervisor.
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR pg_column_size(p_payload) > 65536 THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_payload' USING ERRCODE = '22023';
  END IF;

  v_name := NULLIF(btrim(p_payload ->> 'name'), '');
  v_message_template := COALESCE(p_payload ->> 'message_template', '');
  v_description := p_payload ->> 'description';
  v_objective := p_payload ->> 'objective';
  v_audience_source := p_payload ->> 'audience_source';
  v_audience_filters := COALESCE(p_payload -> 'audience_filters', '{}'::jsonb);
  v_segment_id := NULLIF(p_payload ->> 'segment_id', '')::uuid;
  v_template_id := NULLIF(p_payload ->> 'template_id', '')::uuid;
  v_connection_id := NULLIF(p_payload ->> 'whatsapp_connection_id', '')::uuid;
  v_media_url := p_payload ->> 'media_url';
  v_media_type := p_payload ->> 'media_type';
  v_scheduled_at := NULLIF(p_payload ->> 'scheduled_at', '')::timestamptz;
  v_schedule_timezone := COALESCE(NULLIF(p_payload ->> 'schedule_timezone', ''), 'America/Sao_Paulo');
  v_window_start := NULLIF(p_payload ->> 'send_window_start', '')::time;
  v_window_end := NULLIF(p_payload ->> 'send_window_end', '')::time;
  v_business_hours_only := COALESCE((p_payload ->> 'business_hours_only')::boolean, false);
  v_respect_suppression := COALESCE((p_payload ->> 'respect_suppression')::boolean, true);
  v_confirm_consent := COALESCE((p_payload ->> 'confirm_consent')::boolean, false);
  v_draft_step := COALESCE(NULLIF(p_payload ->> 'draft_step', '')::integer, 1);
  v_owner := NULLIF(p_payload ->> 'owner', '')::uuid;
  v_template_version_id := NULLIF(p_payload ->> 'template_version_id', '')::uuid;
  v_requested_status := NULLIF(p_payload ->> 'status', '');

  -- X032: base legal e carimbo do operador que confirmou. A confirmacao so e gravada
  -- quando o operador marca o checkbox (confirm_consent); desmarcar limpa o carimbo.
  -- O carimbo original e preservado mais abaixo (update), quando ja existia.
  v_legal_basis := NULLIF(btrim(COALESCE(p_payload ->> 'legal_basis', '')), '');
  IF v_confirm_consent THEN
    v_consent_by := v_actor_profile_id;
    v_consent_at := v_now;
  ELSE
    v_consent_by := NULL;
    v_consent_at := NULL;
  END IF;

  -- X018: ritmo derivado do perfil (clamp na faixa) em vez dos valores crus.
  SELECT * INTO v_pace FROM public.talkx_resolve_speed_pace(
    NULLIF(p_payload ->> 'speed_profile', ''),
    NULLIF(p_payload ->> 'send_interval_min', '')::integer,
    NULLIF(p_payload ->> 'send_interval_max', '')::integer,
    NULLIF(p_payload ->> 'typing_delay_min', '')::integer,
    NULLIF(p_payload ->> 'typing_delay_max', '')::integer
  );
  v_speed_profile := v_pace.speed_profile;
  v_send_interval_min := v_pace.send_interval_min;
  v_send_interval_max := v_pace.send_interval_max;
  v_typing_delay_min := v_pace.typing_delay_min;
  v_typing_delay_max := v_pace.typing_delay_max;

  -- X018: max_per_minute (nulo = usa o padrão do setting; acima do teto -> 22023).
  v_max_per_minute := NULLIF(p_payload ->> 'max_per_minute', '')::smallint;

  -- Unificação owner × responsible_id: owner é o ÚNICO responsável.
  IF v_owner IS NULL THEN
    v_owner := v_actor_profile_id;
  END IF;

  -- X017: recusa desmarcar a supressão.
  IF v_respect_suppression IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_respect_suppression_false_nao_liberado' USING ERRCODE = '22023';
  END IF;

  IF v_name IS NULL OR length(v_name) > 200
     OR v_objective IS NULL OR v_audience_source IS NULL
     OR length(v_message_template) > 4096
     OR (v_description IS NOT NULL AND length(v_description) > 4000)
     OR v_objective NOT IN ('vendas', 'engajamento', 'reativacao', 'relacionamento', 'pesquisa', 'institucional')
     OR v_audience_source NOT IN ('contacts', 'segment', 'crm360')
     OR jsonb_typeof(v_audience_filters) <> 'object'
     OR (v_audience_source = 'segment' AND v_segment_id IS NULL)
     OR (v_audience_source <> 'segment' AND v_segment_id IS NOT NULL)
     OR v_send_interval_min > v_send_interval_max
     OR v_typing_delay_min > v_typing_delay_max
     OR v_speed_profile NOT IN ('slow', 'moderate', 'fast')
     OR (v_media_url IS NOT NULL AND (length(v_media_url) > 8192 OR v_media_url !~ '^https://'))
     OR (v_media_type IS NOT NULL AND v_media_type NOT IN ('image', 'video', 'document', 'audio'))
     OR ((v_media_url IS NULL) <> (v_media_type IS NULL))
     OR public.is_valid_talkx_schedule_timezone(v_schedule_timezone) IS NOT TRUE
     OR ((v_window_start IS NULL) <> (v_window_end IS NULL))
     OR (v_window_start IS NOT NULL AND v_window_start >= v_window_end)
     OR (v_legal_basis IS NOT NULL AND v_legal_basis NOT IN ('consent', 'legitimate_interest', 'contract'))
     OR (v_draft_step < 1 OR v_draft_step > 4)
     OR (v_requested_status IS NOT NULL AND v_requested_status <> 'draft')
     OR (v_max_per_minute IS NOT NULL AND v_max_per_minute < 1) THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_draft' USING ERRCODE = '22023';
  END IF;

  -- X018: max_per_minute acima do teto por minuto da conexão -> 22023.
  IF v_max_per_minute IS NOT NULL
     AND v_max_per_minute > COALESCE((SELECT (settings.value)::text::integer
                                        FROM public.talkx_settings settings
                                       WHERE settings.key = 'max_per_minute_per_connection'), 6) THEN
    RAISE EXCEPTION 'talkx_max_per_minute_acima_do_teto' USING ERRCODE = '22023';
  END IF;

  IF v_connection_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.whatsapp_connections connection
        WHERE connection.id = v_connection_id
          AND connection.status = 'connected'
          AND NULLIF(btrim(connection.instance_id), '') IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'selected_whatsapp_connection_unavailable' USING ERRCODE = '22023';
  END IF;

  IF p_campaign_id IS NULL THEN
    IF p_creation_key IS NULL THEN
      RAISE EXCEPTION 'talkx_draft_creation_key_required' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.talkx_campaigns (
      name, message_template, description, objective, audience_source,
      audience_filters, segment_id, template_id, whatsapp_connection_id,
      media_url, media_type, scheduled_at, schedule_timezone,
      send_window_start, send_window_end, business_hours_only, speed_profile,
      typing_delay_min, typing_delay_max, send_interval_min, send_interval_max,
      max_per_minute,
      respect_suppression, confirm_consent, legal_basis, consent_confirmed_by, consent_confirmed_at,
      draft_step, owner, template_version_id,
      status, created_by, draft_creation_key, revision, created_at, updated_at
    ) VALUES (
      v_name, v_message_template, v_description, v_objective, v_audience_source,
      v_audience_filters, v_segment_id, v_template_id, v_connection_id,
      v_media_url, v_media_type, v_scheduled_at, v_schedule_timezone,
      v_window_start, v_window_end, v_business_hours_only, v_speed_profile,
      v_typing_delay_min, v_typing_delay_max, v_send_interval_min, v_send_interval_max,
      v_max_per_minute,
      v_respect_suppression, v_confirm_consent, v_legal_basis, v_consent_by, v_consent_at,
      v_draft_step, v_owner, v_template_version_id,
      'draft', v_actor_profile_id, p_creation_key, 1, v_now, v_now
    )
    ON CONFLICT (created_by, draft_creation_key) WHERE draft_creation_key IS NOT NULL DO NOTHING
    RETURNING * INTO v_campaign;

    IF FOUND THEN
      RETURN QUERY SELECT v_campaign.id, v_campaign.revision, false;
      RETURN;
    END IF;

    SELECT * INTO v_campaign
      FROM public.talkx_campaigns campaign
     WHERE campaign.created_by = v_actor_profile_id
       AND campaign.draft_creation_key = p_creation_key
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'talkx_draft_creation_recovery_failed' USING ERRCODE = '40001';
    END IF;

    IF v_campaign.name IS DISTINCT FROM v_name
       OR v_campaign.message_template IS DISTINCT FROM v_message_template
       OR v_campaign.description IS DISTINCT FROM v_description
       OR v_campaign.objective IS DISTINCT FROM v_objective
       OR v_campaign.audience_source IS DISTINCT FROM v_audience_source
       OR v_campaign.audience_filters IS DISTINCT FROM v_audience_filters
       OR v_campaign.segment_id IS DISTINCT FROM v_segment_id
       OR v_campaign.template_id IS DISTINCT FROM v_template_id
       OR v_campaign.whatsapp_connection_id IS DISTINCT FROM v_connection_id
       OR v_campaign.media_url IS DISTINCT FROM v_media_url
       OR v_campaign.media_type IS DISTINCT FROM v_media_type
       OR v_campaign.scheduled_at IS DISTINCT FROM v_scheduled_at
       OR v_campaign.schedule_timezone IS DISTINCT FROM v_schedule_timezone
       OR v_campaign.send_window_start IS DISTINCT FROM v_window_start
       OR v_campaign.send_window_end IS DISTINCT FROM v_window_end
       OR v_campaign.business_hours_only IS DISTINCT FROM v_business_hours_only
       OR v_campaign.respect_suppression IS DISTINCT FROM v_respect_suppression
       OR v_campaign.confirm_consent IS DISTINCT FROM v_confirm_consent
       OR v_campaign.legal_basis IS DISTINCT FROM v_legal_basis
       OR (v_campaign.consent_confirmed_at IS NOT NULL) IS DISTINCT FROM v_confirm_consent
       OR v_campaign.draft_step IS DISTINCT FROM v_draft_step
       OR v_campaign.owner IS DISTINCT FROM v_owner
       OR v_campaign.template_version_id IS DISTINCT FROM v_template_version_id
       OR v_campaign.speed_profile IS DISTINCT FROM v_speed_profile
       OR v_campaign.typing_delay_min IS DISTINCT FROM v_typing_delay_min
       OR v_campaign.typing_delay_max IS DISTINCT FROM v_typing_delay_max
       OR v_campaign.send_interval_min IS DISTINCT FROM v_send_interval_min
       OR v_campaign.send_interval_max IS DISTINCT FROM v_send_interval_max
       OR v_campaign.max_per_minute IS DISTINCT FROM v_max_per_minute THEN
      RAISE EXCEPTION 'talkx_draft_creation_key_payload_conflict' USING ERRCODE = '40001';
    END IF;

    RETURN QUERY SELECT v_campaign.id, v_campaign.revision, true;
    RETURN;
  END IF;

  IF p_expected_revision IS NULL OR p_expected_revision < 1 THEN
    RAISE EXCEPTION 'talkx_draft_expected_revision_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_campaign
    FROM public.talkx_campaigns campaign
   WHERE campaign.id = p_campaign_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_campaign.created_by IS DISTINCT FROM v_actor_profile_id
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
  END IF;
  IF v_campaign.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_campaign_not_editable' USING ERRCODE = '55000';
  END IF;
  IF v_campaign.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
  END IF;

  -- X032: nao "piscar" o carimbo — se ja havia confirmacao, mantem o autor/instante originais.
  IF v_confirm_consent AND v_campaign.consent_confirmed_at IS NOT NULL THEN
    v_consent_by := v_campaign.consent_confirmed_by;
    v_consent_at := v_campaign.consent_confirmed_at;
  END IF;

  UPDATE public.talkx_campaigns campaign
     SET name = v_name,
         message_template = v_message_template,
         description = v_description,
         objective = v_objective,
         audience_source = v_audience_source,
         audience_filters = v_audience_filters,
         segment_id = v_segment_id,
         template_id = v_template_id,
         whatsapp_connection_id = v_connection_id,
         media_url = v_media_url,
         media_type = v_media_type,
         scheduled_at = v_scheduled_at,
         schedule_timezone = v_schedule_timezone,
         send_window_start = v_window_start,
         send_window_end = v_window_end,
         business_hours_only = v_business_hours_only,
         respect_suppression = v_respect_suppression,
         confirm_consent = v_confirm_consent,
         legal_basis = v_legal_basis,
         consent_confirmed_by = v_consent_by,
         consent_confirmed_at = v_consent_at,
         draft_step = v_draft_step,
         owner = v_owner,
         template_version_id = v_template_version_id,
         speed_profile = v_speed_profile,
         typing_delay_min = v_typing_delay_min,
         typing_delay_max = v_typing_delay_max,
         send_interval_min = v_send_interval_min,
         send_interval_max = v_send_interval_max,
         max_per_minute = v_max_per_minute,
         status = COALESCE(v_requested_status, campaign.status),
         revision = campaign.revision + 1,
         updated_at = v_now
   WHERE campaign.id = v_campaign.id
   RETURNING * INTO v_campaign;

  RETURN QUERY SELECT v_campaign.id, v_campaign.revision, false;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb) IS
  'Talk X (X018 + X032): grava rascunho com ritmo derivado do perfil e, quando confirm_consent=true, carimba consent_confirmed_by/at e legal_basis.';

-- ============================================================================
-- (e) expurgo por prazo
-- ============================================================================
-- Uma vez por dia (controle em talkx_settings.last_purge_at, dia de calendario em
-- America/Sao_Paulo): na segunda execucao do mesmo dia devolve contagens zeradas sem tocar
-- em nada. Nunca apaga talkx_blacklist, contadores nem eventos.
CREATE OR REPLACE FUNCTION public.purge_talkx_expired_data(p_limit integer DEFAULT 1000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_days_message integer;
  v_days_clicks  integer;
  v_days_test    integer;
  v_days_ai      integer;
  v_now          timestamptz := statement_timestamp();
  v_last         timestamptz;
  v_msg          integer := 0;
  v_clicks       integer := 0;
  v_test         integer := 0;
  v_ai           integer := 0;
  v_media        integer := 0;
  v_events       integer := 0;
  v_entity_id    uuid := gen_random_uuid();
  v_counts       jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'invalid_talkx_purge_limit' USING ERRCODE = '22023';
  END IF;

  SELECT (settings.value #>> '{}')::timestamptz
    INTO v_last
    FROM public.talkx_settings AS settings
   WHERE settings.key = 'last_purge_at';

  -- Gate diario: se o ultimo expurgo foi hoje (America/Sao_Paulo), nao roda de novo.
  IF v_last IS NOT NULL
     AND (v_last AT TIME ZONE 'America/Sao_Paulo')::date
         = (v_now AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RETURN jsonb_build_object(
      'skipped', true, 'messages', 0, 'clicks', 0, 'test_sends', 0, 'ai', 0, 'media', 0
    );
  END IF;

  SELECT (settings.value #>> '{}')::integer INTO v_days_message
    FROM public.talkx_settings AS settings WHERE settings.key = 'retention_days_message';
  SELECT (settings.value #>> '{}')::integer INTO v_days_clicks
    FROM public.talkx_settings AS settings WHERE settings.key = 'retention_days_clicks';
  SELECT (settings.value #>> '{}')::integer INTO v_days_test
    FROM public.talkx_settings AS settings WHERE settings.key = 'retention_days_test_sends';
  SELECT (settings.value #>> '{}')::integer INTO v_days_ai
    FROM public.talkx_settings AS settings WHERE settings.key = 'retention_days_ai';
  v_days_message := COALESCE(v_days_message, 180);
  v_days_clicks  := COALESCE(v_days_clicks, 365);
  v_days_test    := COALESCE(v_days_test, 90);
  v_days_ai      := COALESCE(v_days_ai, 90);

  -- 1) texto e snapshots de midia dos destinatarios de campanhas TERMINAIS vencidas
  WITH terminal AS (
    SELECT recipient.id
      FROM public.talkx_recipients AS recipient
      JOIN public.talkx_campaigns AS campaign ON campaign.id = recipient.campaign_id
     WHERE campaign.status IN ('completed', 'cancelled')
       AND COALESCE(campaign.completed_at, campaign.cancelled_at, campaign.updated_at)
           < v_now - make_interval(days => v_days_message)
       AND (recipient.personalized_message IS NOT NULL
            OR recipient.media_url_snapshot IS NOT NULL
            OR recipient.media_type_snapshot IS NOT NULL)
     ORDER BY recipient.id
     LIMIT p_limit
     FOR UPDATE OF recipient SKIP LOCKED
  )
  UPDATE public.talkx_recipients AS recipient
     SET personalized_message = NULL,
         media_url_snapshot = NULL,
         media_type_snapshot = NULL,
         updated_at = v_now
    FROM terminal
   WHERE recipient.id = terminal.id;
  GET DIAGNOSTICS v_msg = ROW_COUNT;

  -- 2) ua/ip_hash de cliques vencidos
  WITH vencidos AS (
    SELECT click.id
      FROM public.talkx_link_clicks AS click
     WHERE click.clicked_at < v_now - make_interval(days => v_days_clicks)
       AND (click.ua IS NOT NULL OR click.ip_hash IS NOT NULL)
     ORDER BY click.id
     LIMIT p_limit
     FOR UPDATE OF click SKIP LOCKED
  )
  UPDATE public.talkx_link_clicks AS click
     SET ua = NULL,
         ip_hash = NULL
    FROM vencidos
   WHERE click.id = vencidos.id;
  GET DIAGNOSTICS v_clicks = ROW_COUNT;

  -- 3) linhas vencidas de teste (envio de teste)
  IF to_regclass('public.talkx_test_send_claims') IS NOT NULL THEN
    WITH vencidos AS (
      SELECT claim.id
        FROM public.talkx_test_send_claims AS claim
       WHERE claim.created_at < v_now - make_interval(days => v_days_test)
       ORDER BY claim.id
       LIMIT p_limit
    )
    DELETE FROM public.talkx_test_send_claims AS claim
     USING vencidos
     WHERE claim.id = vencidos.id;
    GET DIAGNOSTICS v_test = ROW_COUNT;
  END IF;

  -- 4) linhas vencidas de IA (jobs terminais antigos)
  IF to_regclass('public.ai_jobs') IS NOT NULL THEN
    WITH vencidos AS (
      SELECT job.id
        FROM public.ai_jobs AS job
       WHERE job.status IN ('succeeded', 'failed', 'cancelled', 'outcome_unknown')
         AND COALESCE(job.finished_at, job.created_at) < v_now - make_interval(days => v_days_ai)
       ORDER BY job.id
       LIMIT p_limit
    )
    DELETE FROM public.ai_jobs AS job
     USING vencidos
     WHERE job.id = vencidos.id;
    GET DIAGNOSTICS v_ai = ROW_COUNT;
  END IF;

  -- 5) objetos de talkx-media sem referencia (bucket ainda pode nao existir; guarded).
  -- Referencia a storage.objects so aparece em SQL dinamico/EXECUTE para nao falhar o
  -- parse da funcao quando o schema storage nao existe (PostgreSQL descartavel).
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE format($media$
      WITH orfaos AS (
        SELECT object.id
          FROM storage.objects AS object
         WHERE object.bucket_id = 'talkx-media'
           AND object.created_at < %L::timestamptz - make_interval(days => %s)
           AND NOT EXISTS (
             SELECT 1 FROM public.talkx_campaigns AS campaign
              WHERE campaign.media_url LIKE '%%/' || object.name
           )
           AND NOT EXISTS (
             SELECT 1 FROM public.talkx_recipients AS recipient
              WHERE recipient.media_url_snapshot LIKE '%%/' || object.name
           )
         ORDER BY object.id
         LIMIT %s
      )
      DELETE FROM storage.objects AS object
       USING orfaos
       WHERE object.id = orfaos.id
    $media$, v_now, v_days_message, p_limit);
    GET DIAGNOSTICS v_media = ROW_COUNT;
  END IF;

  -- Marca o expurgo do dia ANTES do evento, para o gate valer mesmo se o INSERT falhar.
  INSERT INTO public.talkx_settings AS settings (key, value, description, updated_at)
  VALUES ('last_purge_at', to_jsonb(v_now::text), 'X032: instante do ultimo expurgo.', v_now)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

  v_counts := jsonb_build_object(
    'skipped', false,
    'messages', v_msg,
    'clicks', v_clicks,
    'test_sends', v_test,
    'ai', v_ai,
    'media', v_media
  );

  -- Evento com as contagens (campanha nula => evento de entidade, respeita o target_check).
  INSERT INTO public.talkx_campaign_events
    (campaign_id, event_type, message, actor_id, entity_type, entity_id)
  VALUES (NULL, 'note', v_counts::text, NULL, 'talkx_lgpd_purge', v_entity_id);
  GET DIAGNOSTICS v_events = ROW_COUNT;

  RETURN v_counts || jsonb_build_object('events', v_events);
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_talkx_expired_data(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_talkx_expired_data(integer)
  TO service_role;

COMMENT ON FUNCTION public.purge_talkx_expired_data(integer) IS
  'Talk X (X032): expurgo LGPD por prazo. Roda no maximo 1x/dia (talkx_settings.last_purge_at). Anula personalized_message/media snapshots de destinatarios de campanhas terminais vencidas, limpa ua/ip_hash, apaga linhas vencidas de teste e de IA e objetos de talkx-media orfaos; grava evento com as contagens. Nunca apaga talkx_blacklist, contadores nem eventos.';

-- ============================================================================
-- (f) tick do motor chama o expurgo (corpo vivo 20261001391230 + purge)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trigger_talkx_engine_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_campaign_id      uuid;
  v_scheduler_url    text;
  v_anon_key         text;
  v_cron_secret      text;
BEGIN
  -- O tick é chamador privilegiado (EXECUTE só para service_role + pg_cron).
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  -- X032: expurgo LGPD — a propria funcao se limita a 1x/dia (last_purge_at).
  PERFORM public.purge_talkx_expired_data(1000);

  -- 1) Fecha item preso (POST feito, lease expirado) ANTES de qualquer fan-out,
  --    senão a campanha nunca consegue drenar.
  PERFORM public.sweep_talkx_stuck_recipients(500);

  -- 2) Campanha 'sending' sem nenhum destinatário pendente/sending já drenou.
  FOR v_campaign_id IN
    SELECT campaign.id
      FROM public.talkx_campaigns AS campaign
     WHERE campaign.status = 'sending'
       AND NOT EXISTS (
         SELECT 1
           FROM public.talkx_recipients AS recipient
          WHERE recipient.campaign_id = campaign.id
            AND recipient.status IN ('pending', 'sending')
       )
     ORDER BY campaign.updated_at
  LOOP
    BEGIN
      PERFORM public.complete_talkx_campaign_if_drained(v_campaign_id);
    EXCEPTION WHEN OTHERS THEN
      -- Uma campanha inválida não pode travar o tick.
      NULL;
    END;
  END LOOP;

  -- 3) Fan-out: no máximo UMA campanha 'sending' por conexão por tick (a de
  --    updated_at mais antigo), teto de 10 no tick. Antes, a edge podia levar
  --    N campanhas na MESMA instância — fan-out que derruba a sessão do WhatsApp.
  FOR v_campaign_id IN
    SELECT ranked.id
      FROM (
        SELECT campaign.id,
               row_number() OVER (
                 PARTITION BY COALESCE(campaign.whatsapp_connection_id::text, 'sem-conexao')
                 ORDER BY campaign.updated_at, campaign.id
               ) AS position
          FROM public.talkx_campaigns AS campaign
         WHERE campaign.status = 'sending'
      ) AS ranked
     WHERE ranked.position <= 1
     ORDER BY ranked.id
     LIMIT 10
  LOOP
    BEGIN
      PERFORM public.kick_talkx_campaign(v_campaign_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  -- 4) Camada agendada: o talkx-scheduler resolve 'scheduled' e 'paused' dentro
  --    da janela. Mesmo segredo e mesmo timeout do kick.
  SELECT decrypted_secret INTO v_scheduler_url
    FROM vault.decrypted_secrets WHERE name = 'talkx_scheduler_url' LIMIT 1;
  SELECT decrypted_secret INTO v_anon_key
    FROM vault.decrypted_secrets WHERE name = 'talkx_anon_key' LIMIT 1;
  v_cron_secret := public.get_talkx_cron_secret();

  IF v_scheduler_url IS NOT NULL AND v_cron_secret IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_scheduler_url,
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_anon_key,
        'Authorization', 'Bearer ' || v_anon_key,
        'x-cron-secret', v_cron_secret
      ),
      timeout_milliseconds := 30000
    );
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.trigger_talkx_engine_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_talkx_engine_tick() TO service_role;

-- ============================================================================
-- Fail-closed: se qualquer objeto do contrato nao colar, aborta.
-- ============================================================================
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(assinatura, ', ') INTO v_missing
  FROM (
    VALUES
      ('public.purge_talkx_expired_data(integer)'),
      ('public.talkx_audience_query(jsonb,uuid[],boolean)'),
      ('public.talkx_suppress_contact(uuid,text,text,public.talkx_blacklist_reason,text,uuid,uuid)'),
      ('public.save_talkx_campaign_draft(uuid,bigint,uuid,jsonb)'),
      ('public.transition_talkx_campaign(uuid,text,text,uuid)'),
      ('public.enforce_talkx_campaign_mutability()'),
      ('public.trigger_talkx_engine_tick()')
  ) AS esperado(assinatura)
  WHERE to_regprocedure(assinatura) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_x032_objetos_ausentes: %', v_missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'talkx_campaigns'
       AND column_name = 'consent_confirmed_at'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'talkx_campaigns'
       AND column_name = 'legal_basis'
  ) THEN
    RAISE EXCEPTION 'talkx_x032_colunas_ausentes';
  END IF;
END;
$$;
