CREATE OR REPLACE FUNCTION public.talkx_compile_segment_rules(p_rules jsonb, p_depth integer DEFAULT 0)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_groups     jsonb;
  v_group      jsonb;
  v_rule       jsonb;
  v_match      text;
  v_field      text;
  v_op         text;
  v_value      text;
  v_kind       text;
  v_ops        text[];
  v_expr       text;
  v_col        text;
  v_days       integer;
  v_threshold  timestamptz;
  v_rule_sql   text;
  v_rules_sql  text[] := ARRAY[]::text[];
  v_groups_sql text[] := ARRAY[]::text[];
  v_field_row  record;
BEGIN
  -- Defesa em profundidade contra recursao (profundidade maxima 1).
  IF p_depth > 1 THEN
    RAISE EXCEPTION 'segment_rules_depth_exceeded' USING ERRCODE = '22023';
  END IF;

  IF p_rules IS NULL THEN
    RETURN '';
  END IF;

  IF jsonb_typeof(p_rules) <> 'object' THEN
    RAISE EXCEPTION 'invalid_talkx_segment_rules' USING ERRCODE = '22023';
  END IF;

  v_groups := p_rules -> 'groups';
  IF v_groups IS NULL THEN
    RETURN '';
  END IF;

  IF jsonb_typeof(v_groups) <> 'array' THEN
    RAISE EXCEPTION 'invalid_talkx_segment_rules' USING ERRCODE = '22023';
  END IF;

  FOR v_group IN SELECT grp.value FROM jsonb_array_elements(v_groups) AS grp(value) LOOP
    IF jsonb_typeof(v_group) <> 'object' THEN
      RAISE EXCEPTION 'invalid_talkx_segment_group' USING ERRCODE = '22023';
    END IF;

    v_match := v_group ->> 'match';
    IF v_match IS NULL OR v_match NOT IN ('and', 'or') THEN
      RAISE EXCEPTION 'invalid_talkx_segment_group_match' USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(v_group -> 'rules') <> 'array' THEN
      RAISE EXCEPTION 'invalid_talkx_segment_group_rules' USING ERRCODE = '22023';
    END IF;

    v_rules_sql := ARRAY[]::text[];

    FOR v_rule IN SELECT r.value FROM jsonb_array_elements(v_group -> 'rules') AS r(value) LOOP
      IF jsonb_typeof(v_rule) <> 'object' THEN
        RAISE EXCEPTION 'invalid_talkx_segment_rule' USING ERRCODE = '22023';
      END IF;

      v_field := v_rule ->> 'field';
      v_op    := v_rule ->> 'op';
      v_value := v_rule ->> 'value';

      -- Campo tem de existir (e estar habilitado) na lista oficial.
      SELECT sf.kind, sf.ops, sf.expr
        INTO v_field_row
        FROM public.talkx_segment_fields sf
       WHERE sf.field = v_field
         AND sf.enabled = true;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid_talkx_segment_field' USING ERRCODE = '22023';
      END IF;

      v_kind := v_field_row.kind;
      v_ops  := v_field_row.ops;
      v_expr := v_field_row.expr;

      IF v_op IS NULL OR NOT (v_op = ANY(v_ops)) THEN
        RAISE EXCEPTION 'invalid_talkx_segment_operator' USING ERRCODE = '22023';
      END IF;

      -- is_set/is_empty nao exigem valor; os demais exigem valor nao vazio.
      IF v_op <> 'is_set' AND v_op <> 'is_empty'
         AND (v_value IS NULL OR btrim(v_value) = '') THEN
        RAISE EXCEPTION 'invalid_talkx_segment_rule_value' USING ERRCODE = '22023';
      END IF;

      -- Valida o tipo do valor ANTES de montar qualquer cast, para o erro de
      -- contrato ser sempre 22023 (nunca um 22P02 cru do ::numeric/::uuid).
      -- No ramo de data o valor vira integer validado (> = 1): e este integer,
      -- nunca o texto cru, que entra no intervalo do predicado.
      IF v_kind = 'number' THEN
        BEGIN
          PERFORM btrim(v_value)::numeric;
        EXCEPTION WHEN others THEN
          RAISE EXCEPTION 'invalid_talkx_segment_rule_value' USING ERRCODE = '22023';
        END;
      ELSIF v_kind = 'uuid' AND v_op <> 'is_empty' THEN
        BEGIN
          PERFORM btrim(v_value)::uuid;
        EXCEPTION WHEN others THEN
          RAISE EXCEPTION 'invalid_talkx_segment_rule_value' USING ERRCODE = '22023';
        END;
      ELSIF v_kind = 'date' THEN
        BEGIN
          v_days := btrim(v_value)::integer;
        EXCEPTION WHEN others THEN
          RAISE EXCEPTION 'invalid_talkx_segment_rule_value' USING ERRCODE = '22023';
        END;
        IF v_days IS NULL OR v_days < 1 THEN
          RAISE EXCEPTION 'invalid_talkx_segment_rule_value' USING ERRCODE = '22023';
        END IF;
      END IF;

      -- Coluna do contato: identificador citado da tabela oficial, sempre
      -- entre aspas por format('%I') — nao ha como o valor da regra influir aqui.
      v_col := format('c.%I', v_expr);

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
          v_rule_sql := format('%s ILIKE %L', v_col, '%' || v_value || '%');
        END IF;
      ELSIF v_op = 'not_contains' THEN
        IF v_kind = 'array' THEN
          v_rule_sql := format('(%s IS NULL OR NOT (%s @> ARRAY[%L]::text[]))', v_col, v_col, v_value);
        ELSE
          v_rule_sql := format('(%s IS NULL OR %s NOT ILIKE %L)', v_col, v_col, '%' || v_value || '%');
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
      ELSIF v_op IN ('in_last_days', 'not_in_last_days') THEN
        -- v_days ja e integer validado (>= 1). O intervalo usa o integer; o
        -- texto cru do valor nunca chega ao SQL dinamico.
        SELECT ((date_trunc('day', statement_timestamp() AT TIME ZONE 'America/Sao_Paulo')
                 - make_interval(days => v_days - 1))
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

  IF array_length(v_groups_sql, 1) > 0 THEN
    RETURN array_to_string(v_groups_sql, ' OR ');
  END IF;

  RETURN '';
END;
$function$
