-- talkx_compile_segment_rules_safe: corrige injecao SQL no caso in_last_days/not_in_last_days
-- O v_value era interpolado diretamente com %s (sem quote_literal), permitindo injecao SQL.
-- O fix usa %L (quote_literal) e faz cast a int, impedindo qualquer injecao via valor.
-- Rollback: reverter para a versao anterior da funcao talkx_compile_segment_rules (sem a correcao de injecao)
-- Rollback (SQL executavel, na ordem):
--   CREATE OR REPLACE FUNCTION public.talkx_compile_segment_rules(jsonb, integer)
--   RETURNS text
--   LANGUAGE plpgsql
--   STABLE
--   SECURITY DEFINER
--   SET search_path = public, pg_temp
--   AS $function$
--   DECLARE
--     v_groups    jsonb;
--     v_group     jsonb;
--     v_rule      jsonb;
--     v_match     text;
--     v_field     text;
--     v_op        text;
--     v_value     text;
--     v_kind      text;
--     v_ops       text[];
--     v_expr      text;
--     v_rule_sql  text;
--     v_rules_sql text[] := ARRAY[]::text[];
--     v_groups_sql text[] := ARRAY[]::text[];
--     v_field_row record;
--   BEGIN
--     IF p_depth > 10 THEN
--       RAISE EXCEPTION 'segment_rules_depth_exceeded' USING ERRCODE = '22023';
--     END IF;
--     IF p_rules IS NULL THEN
--       RETURN '';
--     END IF;
--     IF jsonb_typeof(p_rules) <> 'object' THEN
--       RAISE EXCEPTION 'invalid_talkx_segment_rules' USING ERRCODE = '22023';
--     END IF;
--     v_groups := p_rules -> 'groups';
--     IF v_groups IS NULL THEN
--       RETURN '';
--     END IF;
--     IF jsonb_typeof(v_groups) <> 'array' THEN
--       RAISE EXCEPTION 'invalid_talkx_segment_rules' USING ERRCODE = '22023';
--     END IF;
--     FOR v_group IN SELECT grp.value FROM jsonb_array_elements(v_groups) AS grp(value) LOOP
--       IF jsonb_typeof(v_group) <> 'object' THEN
--         RAISE EXCEPTION 'invalid_talkx_segment_group' USING ERRCODE = '22023';
--       END IF;
--       v_match := v_group ->> 'match';
--       IF v_match IS NULL OR v_match NOT IN ('and', 'or') THEN
--         RAISE EXCEPTION 'invalid_talkx_segment_group_match' USING ERRCODE = '22023';
--       END IF;
--       IF jsonb_typeof(v_group -> 'rules') <> 'array' THEN
--         RAISE EXCEPTION 'invalid_talkx_segment_group_rules' USING ERRCODE = '22023';
--       END IF;
--       v_rules_sql := ARRAY[]::text[];
--       FOR v_rule IN SELECT r.value FROM jsonb_array_elements(v_group -> 'rules') AS r(value) LOOP
--         IF jsonb_typeof(v_rule) <> 'object' THEN
--           RAISE EXCEPTION 'invalid_talkx_segment_rule' USING ERRCODE = '22023';
--         END IF;
--         v_field := v_rule ->> 'field';
--         v_op    := v_rule ->> 'op';
--         v_value := v_rule ->> 'value';
--         SELECT sf.kind, sf.ops, sf.expr
--           INTO v_field_row
--           FROM public.talkx_segment_fields sf
--          WHERE sf.field = v_field
--            AND sf.enabled = true;
--         IF v_field_row IS NULL THEN
--           RAISE EXCEPTION 'invalid_talkx_segment_field' USING ERRCODE = '22023';
--         END IF;
--         v_kind := v_field_row.kind;
--         v_ops  := v_field_row.ops;
--         v_expr := v_field_row.expr;
--         IF v_op IS NULL OR NOT (v_op = ANY(v_ops)) THEN
--           RAISE EXCEPTION 'invalid_talkx_segment_operator' USING ERRCODE = '22023';
--         END IF;
--         IF v_op <> 'is_set' AND v_op <> 'is_empty'
--            AND (v_value IS NULL OR btrim(v_value) = '') THEN
--           RAISE EXCEPTION 'invalid_talkx_segment_rule_value' USING ERRCODE = '22023';
--         END IF;
--         IF v_op = 'is_set' THEN
--           v_rule_sql := format('%s IS NOT NULL', v_expr);
--         ELSIF v_op = 'is_empty' THEN
--           IF v_kind = 'array' THEN
--             v_rule_sql := format('(%s IS NULL OR %s = %L::text[])', v_expr, v_expr, '{}');
--           ELSIF v_kind = 'uuid' THEN
--             v_rule_sql := format('%s IS NULL', v_expr);
--           ELSE
--             v_rule_sql := format('(%s IS NULL OR %s = %L)', v_expr, v_expr, '');
--           END IF;
--         ELSIF v_op = 'contains' THEN
--           IF v_kind = 'array' THEN
--             v_rule_sql := format('%s @> ARRAY[%L]::text[]', v_expr, v_value);
--           ELSE
--             v_rule_sql := format('%s ILIKE %L', v_expr, '%' || v_value || '%');
--           END IF;
--         ELSIF v_op = 'not_contains' THEN
--           IF v_kind = 'array' THEN
--             v_rule_sql := format('(%s IS NULL OR NOT (%s @> ARRAY[%L]::text[]))', v_expr, v_expr, v_value);
--           ELSE
--             v_rule_sql := format('(%s IS NULL OR %s NOT ILIKE %L)', v_expr, v_expr, '%' || v_value || '%');
--           END IF;
--         ELSIF v_op = 'eq' THEN
--           IF v_kind = 'number' THEN
--             v_rule_sql := format('%s = %L::numeric', v_expr, v_value);
--           ELSIF v_kind = 'uuid' THEN
--             v_rule_sql := format('%s = %L::uuid', v_expr, v_value);
--           ELSE
--             v_rule_sql := format('%s = %L', v_expr, v_value);
--           END IF;
--         ELSIF v_op = 'neq' THEN
--           IF v_kind = 'number' THEN
--             v_rule_sql := format('(%s IS NULL OR %s <> %L::numeric)', v_expr, v_expr, v_value);
--           ELSIF v_kind = 'uuid' THEN
--             v_rule_sql := format('(%s IS NULL OR %s <> %L::uuid)', v_expr, v_expr, v_value);
--           ELSE
--             v_rule_sql := format('(%s IS NULL OR %s <> %L)', v_expr, v_expr, v_value);
--           END IF;
--         ELSIF v_op IN ('gt', 'gte', 'lt', 'lte') THEN
--           v_rule_sql := format('%s %s %L::numeric', v_expr,
--             CASE v_op WHEN 'gt' THEN '>' WHEN 'gte' THEN '>=' WHEN 'lt' THEN '<' ELSE '<=' END,
--             v_value);
--         ELSIF v_op IN ('in_last_days', 'not_in_last_days') THEN
--           v_rule_sql := format(
--             '%s %s (date_trunc(''day'', statement_timestamp() AT TIME ZONE ''America/Sao_Paulo'') - ((%s - 1) || '' days'')::interval AT TIME ZONE ''America/Sao_Paulo'')::timestamptz',
--             v_expr,
--             CASE v_op WHEN 'in_last_days' THEN '>=' ELSE '<' END,
--             v_value
--           );
--         END IF;
--         v_rules_sql := v_rules_sql || v_rule_sql;
--       END LOOP;
--       IF array_length(v_rules_sql, 1) > 0 THEN
--         IF v_match = 'or' THEN
--           v_groups_sql := v_groups_sql || ('(' || array_to_string(v_rules_sql, ' OR ') || ')');
--         ELSE
--           v_groups_sql := v_groups_sql || ('(' || array_to_string(v_rules_sql, ' AND ') || ')');
--         END IF;
--       END IF;
--     END LOOP;
--     IF array_length(v_groups_sql, 1) > 0 THEN
--       RETURN array_to_string(v_groups_sql, ' OR ');
--     END IF;
--     RETURN '';
--   END;
--   $function$;
--   REVOKE ALL ON FUNCTION public.talkx_compile_segment_rules(jsonb, integer) FROM PUBLIC, anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.talkx_compile_segment_rules(jsonb, integer) TO service_role;
CREATE OR REPLACE FUNCTION public.talkx_compile_segment_rules(
  p_rules jsonb,
  p_depth int DEFAULT 0
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_groups    jsonb;
  v_group     jsonb;
  v_rule      jsonb;
  v_match     text;
  v_field     text;
  v_op        text;
  v_value     text;
  v_kind      text;
  v_ops       text[];
  v_expr      text;
  v_rule_sql  text;
  v_rules_sql text[] := ARRAY[]::text[];
  v_groups_sql text[] := ARRAY[]::text[];
  v_field_row record;
BEGIN
  -- Protecao contra recursao profunda (defesa em profundidade).
  IF p_depth > 10 THEN
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

      -- Validar campo contra a tabela oficial.
      SELECT sf.kind, sf.ops, sf.expr
        INTO v_field_row
        FROM public.talkx_segment_fields sf
       WHERE sf.field = v_field
         AND sf.enabled = true;

      IF v_field_row IS NULL THEN
        RAISE EXCEPTION 'invalid_talkx_segment_field' USING ERRCODE = '22023';
      END IF;

      v_kind := v_field_row.kind;
      v_ops  := v_field_row.ops;
      v_expr := v_field_row.expr;

      -- Validar operador contra a lista oficial do campo.
      IF v_op IS NULL OR NOT (v_op = ANY(v_ops)) THEN
        RAISE EXCEPTION 'invalid_talkx_segment_operator' USING ERRCODE = '22023';
      END IF;

      -- Validar valor obrigatorio para operadores que nao sao is_set/is_empty.
      IF v_op <> 'is_set' AND v_op <> 'is_empty'
         AND (v_value IS NULL OR btrim(v_value) = '') THEN
        RAISE EXCEPTION 'invalid_talkx_segment_rule_value' USING ERRCODE = '22023';
      END IF;

      -- Construir o predicado SQL com format('%I') para identificadores e quote_literal (%L) para valores.
      -- O v_expr vem da tabela oficial talkx_segment_fields (whitelist), portanto e seguro.
      -- O v_value e sempre quote_literal via %L, impedindo injecao SQL.
      IF v_op = 'is_set' THEN
        v_rule_sql := format('%I IS NOT NULL', split_part(v_expr, '.', 2));
      ELSIF v_op = 'is_empty' THEN
        IF v_kind = 'array' THEN
          v_rule_sql := format('(%I IS NULL OR %I = %L::text[])', split_part(v_expr, '.', 2), split_part(v_expr, '.', 2), '{}');
        ELSIF v_kind = 'uuid' THEN
          v_rule_sql := format('%I IS NULL', split_part(v_expr, '.', 2));
        ELSE
          v_rule_sql := format('(%I IS NULL OR %I = %L)', split_part(v_expr, '.', 2), split_part(v_expr, '.', 2), '');
        END IF;
      ELSIF v_op = 'contains' THEN
        IF v_kind = 'array' THEN
          v_rule_sql := format('%I @> ARRAY[%L]::text[]', split_part(v_expr, '.', 2), v_value);
        ELSE
          v_rule_sql := format('%I ILIKE %L', split_part(v_expr, '.', 2), '%' || v_value || '%');
        END IF;
      ELSIF v_op = 'not_contains' THEN
        IF v_kind = 'array' THEN
          v_rule_sql := format('(%I IS NULL OR NOT (%I @> ARRAY[%L]::text[]))', split_part(v_expr, '.', 2), split_part(v_expr, '.', 2), v_value);
        ELSE
          v_rule_sql := format('(%I IS NULL OR %I NOT ILIKE %L)', split_part(v_expr, '.', 2), split_part(v_expr, '.', 2), '%' || v_value || '%');
        END IF;
      ELSIF v_op = 'eq' THEN
        IF v_kind = 'number' THEN
          v_rule_sql := format('%I = %L::numeric', split_part(v_expr, '.', 2), v_value);
        ELSIF v_kind = 'uuid' THEN
          v_rule_sql := format('%I = %L::uuid', split_part(v_expr, '.', 2), v_value);
        ELSE
          v_rule_sql := format('%I = %L', split_part(v_expr, '.', 2), v_value);
        END IF;
      ELSIF v_op = 'neq' THEN
        IF v_kind = 'number' THEN
          v_rule_sql := format('(%I IS NULL OR %I <> %L::numeric)', split_part(v_expr, '.', 2), split_part(v_expr, '.', 2), v_value);
        ELSIF v_kind = 'uuid' THEN
          v_rule_sql := format('(%I IS NULL OR %I <> %L::uuid)', split_part(v_expr, '.', 2), split_part(v_expr, '.', 2), v_value);
        ELSE
          v_rule_sql := format('(%I IS NULL OR %I <> %L)', split_part(v_expr, '.', 2), split_part(v_expr, '.', 2), v_value);
        END IF;
      ELSIF v_op IN ('gt', 'gte', 'lt', 'lte') THEN
        v_rule_sql := format('%I %s %L::numeric', split_part(v_expr, '.', 2),
          CASE v_op WHEN 'gt' THEN '>' WHEN 'gte' THEN '>=' WHEN 'lt' THEN '<' ELSE '<=' END,
          v_value);
      ELSIF v_op IN ('in_last_days', 'not_in_last_days') THEN
        v_rule_sql := format(
          '%I %s (date_trunc(''day'', statement_timestamp() AT TIME ZONE ''America/Sao_Paulo'') - ((%L::int - 1) || '' days'')::interval AT TIME ZONE ''America/Sao_Paulo'')::timestamptz',
          split_part(v_expr, '.', 2),
          CASE v_op WHEN 'in_last_days' THEN '>=' ELSE '<' END,
          v_value
        );
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
$function$;

REVOKE ALL ON FUNCTION public.talkx_compile_segment_rules(jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_compile_segment_rules(jsonb, integer) TO service_role;