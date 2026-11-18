CREATE OR REPLACE FUNCTION public.talkx_audience_query(p_rules jsonb, p_contact_ids uuid[] DEFAULT NULL::uuid[], p_respect_suppression boolean DEFAULT true)
 RETURNS TABLE(id uuid, legacy_or_deleted boolean, invalid_phone boolean, is_suppressed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
$function$
