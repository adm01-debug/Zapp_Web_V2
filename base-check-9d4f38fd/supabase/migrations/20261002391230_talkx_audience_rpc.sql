-- talkx_audience_rpc
-- versão 20261002391230 reservada para hermes-audience-rpc-2610020303c6ca em 2026-10-02T06:55:36-03:00 (hermes-db-migrar --nova)
-- rollback: DROP FUNCTION IF EXISTS public.talkx_resolve_audience(jsonb, uuid[], text, integer, uuid); DROP FUNCTION IF EXISTS public.talkx_audience_query(jsonb, uuid[], boolean); DROP INDEX IF EXISTS public.idx_contacts_talkx_audience_eligible;
--
-- X016 (Fase 2 · Tela 03/08/09 · banco). Fecha CAP-003, CAP-004, CAP-028, CAP-029, CAP-094, CAP-103.
--
-- HOJE: countAudience/resolveAudience rodam no navegador via PostgREST, filtram so
-- `phone not null` e cortam em 5.000 (segs:161-183). A supressão e filtrada no cliente
-- com a lista inteira (editor:325-338,563-570). O SELECT da blacklist e so de
-- admin/supervisor (M:20260410103218:20-24) e nao ha RPC de contagem.
--
-- FAZER (esta migration):
--   (a) funcao interna `talkx_audience_query(p_rules jsonb, p_contact_ids uuid[],
--       p_respect_suppression boolean)` — traduz {groups:[{match, rules:[{field,op,value}]}]}
--       para SQL com whitelist EXATA de campo/operador de RULE_FIELDS/RULE_OPS
--       (segs:15-80) e valores sempre parametrizados (format ... %L/%I, nunca valor cru).
--       Devolve, para cada contato que casa as regras e e visivel, a classificacao de
--       elegibilidade (is_suppressed, invalid_phone, legacy_or_deleted).
--   (b) RPC `talkx_resolve_audience(p_rules, p_segment_ids uuid[], p_mode text,
--       p_limit int, p_after uuid)` com modos count / sample (<=50, telefone mascarado) /
--       page (keyset por id, <=1000). Exige admin/supervisor (42501).
--
-- WHITELIST (identica a RULE_FIELDS/RULE_OPS em src/hooks/integrations/useTalkXSegments.ts):
--   text  (company, city, state, email, channel_type, lead_origin): eq, neq, contains,
--         not_contains, is_set, is_empty
--   enum  (group_category, contact_type, conversation_status, ai_priority, ai_sentiment,
--         consent_status): eq, neq, is_empty
--   uuid  (assigned_to): eq, neq, is_empty
--   array (tags): contains, not_contains, is_empty
--   number(lead_score, risk_score): eq, gt, gte, lt, lte
--   date  (updated_at, created_at): in_last_days, not_in_last_days
--   Qualquer campo/operador fora da whitelist -> 22023.
--
-- ELEGIVEL = deleted_at IS NULL AND is_lid_legacy = false AND phone ~ '^[0-9]{10,15}$'
--            (criterio de M:20260930450000) E visivel ao usuario (is_contact_visible_to_user).
-- SUPRIMIDO = talkx_blacklist ativa (removed_at IS NULL E (expires_at IS NULL OR
--             expires_at > statement_timestamp())) por contact_id OU por telefone
--             normalizado (regexp_replace(phone,'\D','','g'), como o app em editor:533).
--             Supressao expirada/removida NAO conta.
--
-- `in_last_days`/`not_in_last_days` usam dias de calendario em America/Sao_Paulo, igual ao
-- `zonedDayStartISO` do front (dias-1 a partir de hoje local), nao uma janela de d*24h.
--
-- Classe: ADITIVA (somente funcoes novas + 1 indice de apoio; nada existente e alterado).
-- Idempotente/replayavel: CREATE OR REPLACE FUNCTION + CREATE INDEX IF NOT EXISTS.

-- Indice de apoio: estreita a varredura aos contatos elegiveis quando a consulta nao tem
-- regra (audiencia inteira). O EXPLAIN do teste (PG17 descartavel) mostra varredura completa
-- da tabela para a consulta base; o indice parcial evita ler contatos excluidos/LID/telefone
-- invalido. As supressoes ja sao cobertas por idx_talkx_blacklist_contact (20260511233517) e
-- idx_talkx_blacklist_phone (20260910090000); a paginacao keyset usa a PK de contacts.
CREATE INDEX IF NOT EXISTS idx_contacts_talkx_audience_eligible
  ON public.contacts (id)
  WHERE deleted_at IS NULL
    AND is_lid_legacy = false
    AND phone ~ '^[0-9]{10,15}$';

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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'talkx_audience_authentication_required' USING ERRCODE = '42501';
  END IF;

  v_where := format('public.is_contact_visible_to_user(c.id, %L::uuid)', v_uid);

  IF p_contact_ids IS NOT NULL THEN
    v_where := v_where || format(' AND c.id = ANY(%L::uuid[])', p_contact_ids);
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

CREATE OR REPLACE FUNCTION public.talkx_resolve_audience(
  p_rules jsonb DEFAULT NULL,
  p_segment_ids uuid[] DEFAULT NULL,
  p_mode text DEFAULT 'count',
  p_limit integer DEFAULT NULL,
  p_after uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_mode text;
  v_groups jsonb := '[]'::jsonb;
  v_rules jsonb;
  v_limit integer;
  v_rows jsonb := '[]'::jsonb;
  v_matched bigint := 0;
  v_eligible bigint := 0;
  v_suppressed bigint := 0;
  v_invalid bigint := 0;
  v_legacy bigint := 0;
  v_has_more boolean := false;
  v_next_after uuid;
BEGIN
  IF v_uid IS NULL OR COALESCE(public.is_admin_or_supervisor(v_uid), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_audience_role_required' USING ERRCODE = '42501';
  END IF;

  v_mode := lower(COALESCE(NULLIF(btrim(p_mode), ''), 'count'));
  IF v_mode NOT IN ('count', 'sample', 'page') THEN
    RAISE EXCEPTION 'invalid_talkx_audience_mode' USING ERRCODE = '22023';
  END IF;

  IF p_after IS NOT NULL AND v_mode <> 'page' THEN
    RAISE EXCEPTION 'invalid_talkx_audience_after' USING ERRCODE = '22023';
  END IF;

  -- Une as regras explicitas (p_rules) com as dos segmentos salvos (p_segment_ids):
  -- os grupos combinam por OU, entao concatenar grupos e exatamente a uniao das audiencias.
  IF p_rules IS NOT NULL THEN
    IF jsonb_typeof(p_rules) <> 'object' THEN
      RAISE EXCEPTION 'invalid_talkx_audience_rules' USING ERRCODE = '22023';
    END IF;
    IF p_rules ? 'groups' THEN
      IF jsonb_typeof(p_rules -> 'groups') <> 'array' THEN
        RAISE EXCEPTION 'invalid_talkx_audience_rules' USING ERRCODE = '22023';
      END IF;
      v_groups := v_groups || (p_rules -> 'groups');
    END IF;
  END IF;

  IF p_segment_ids IS NOT NULL AND cardinality(p_segment_ids) > 0 THEN
    v_groups := v_groups || COALESCE(
      (SELECT jsonb_agg(grp.value)
         FROM public.talkx_segments seg
         CROSS JOIN LATERAL jsonb_array_elements(COALESCE(seg.rules -> 'groups', '[]'::jsonb)) AS grp(value)
        WHERE seg.id = ANY(p_segment_ids)),
      '[]'::jsonb);
  END IF;

  v_rules := jsonb_build_object('groups', v_groups);

  IF v_mode = 'count' THEN
    SELECT count(*),
           count(*) FILTER (WHERE NOT q.legacy_or_deleted AND NOT q.invalid_phone AND NOT q.is_suppressed),
           count(*) FILTER (WHERE NOT q.legacy_or_deleted AND q.invalid_phone),
           count(*) FILTER (WHERE q.legacy_or_deleted),
           count(*) FILTER (WHERE NOT q.legacy_or_deleted AND NOT q.invalid_phone AND q.is_suppressed)
      INTO v_matched, v_eligible, v_invalid, v_legacy, v_suppressed
      FROM public.talkx_audience_query(v_rules, NULL, true) AS q;

    RETURN jsonb_build_object(
      'mode', 'count',
      'matched', v_matched,
      'eligible', v_eligible,
      'suppressed', v_suppressed,
      'invalid_phone', v_invalid,
      'legacy_or_deleted', v_legacy
    );
  END IF;

  IF v_mode = 'sample' THEN
    v_limit := least(greatest(COALESCE(p_limit, 50), 1), 50);
  ELSE
    v_limit := least(greatest(COALESCE(p_limit, 50), 1), 1000);
  END IF;

  SELECT COALESCE(jsonb_agg(s.row_data ORDER BY s.cid), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT c.id AS cid,
             jsonb_build_object(
               'id', c.id,
               'name', c.name,
               'nickname', c.nickname,
               'phone', CASE
                 WHEN length(regexp_replace(c.phone, '\D', '', 'g')) <= 8
                   THEN repeat('*', length(regexp_replace(c.phone, '\D', '', 'g')))
                 ELSE left(regexp_replace(c.phone, '\D', '', 'g'), 4)
                      || repeat('*', greatest(length(regexp_replace(c.phone, '\D', '', 'g')) - 8, 0))
                      || right(regexp_replace(c.phone, '\D', '', 'g'), 4)
               END,
               'company', c.company,
               'avatar_url', c.avatar_url,
               'tags', c.tags
             ) AS row_data
        FROM public.talkx_audience_query(v_rules, NULL, true) AS q
        JOIN public.contacts AS c ON c.id = q.id
       WHERE NOT q.legacy_or_deleted
         AND NOT q.invalid_phone
         AND NOT q.is_suppressed
         AND (p_after IS NULL OR c.id > p_after)
       ORDER BY c.id
       LIMIT v_limit
    ) AS s;

  IF v_mode = 'sample' THEN
    RETURN jsonb_build_object(
      'mode', 'sample',
      'rows', v_rows,
      'count', jsonb_array_length(v_rows)
    );
  END IF;

  v_has_more := jsonb_array_length(v_rows) >= v_limit;
  IF v_has_more THEN
    v_next_after := (v_rows -> -1 ->> 'id')::uuid;
  END IF;

  RETURN jsonb_build_object(
    'mode', 'page',
    'rows', v_rows,
    'has_more', v_has_more,
    'next_after', to_jsonb(v_next_after)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_resolve_audience(jsonb, uuid[], text, integer, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_resolve_audience(jsonb, uuid[], text, integer, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.talkx_resolve_audience(jsonb, uuid[], text, integer, uuid) IS
  'Talk X (X016): audiencia unica resolvida no servidor. Modos count (matched/eligible/suppressed/invalid_phone/legacy_or_deleted), sample (<=50, telefone mascarado) e page (keyset por id, <=1000). Elegivel = deleted_at IS NULL, is_lid_legacy=false, phone ~ ''^[0-9]{10,15}$'' e visivel ao usuario; suprimido por contact_id ou telefone normalizado com removed_at IS NULL e expires_at futuro. Exige admin/supervisor (42501).';

-- Fail-closed: se alguma assinatura nao colar, a migration aborta em vez de deixar o
-- contrato pela metade.
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(assinatura, ', ') INTO v_missing
  FROM (
    VALUES
      ('public.talkx_audience_query(jsonb,uuid[],boolean)'),
      ('public.talkx_resolve_audience(jsonb,uuid[],text,integer,uuid)')
  ) AS esperado(assinatura)
  WHERE to_regprocedure(assinatura) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_audience_rpc_ausente: %', v_missing;
  END IF;
END;
$$;
