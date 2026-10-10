-- talkx_segment_fields: lista oficial de campos e operadores de segmento do
-- Talk X + funcao talkx_compile_segment_rules (compila regras em predicado SQL).
--
-- Rollback: DROP FUNCTION IF EXISTS public.talkx_compile_segment_rules(jsonb, integer);
--   e DROP TABLE IF EXISTS public.talkx_segment_fields; (nesta ordem)
--
-- N-111. Esta tabela passa a ser a unica lista de campos/operadores permitidos.
-- Ela substitui a whitelist hardcoded no front
-- (src/hooks/integrations/useTalkXSegments.ts: RULE_FIELDS nas linhas 63-90 e
-- RULE_OPS nas linhas 92-109) e a logica replicada na RPC de audiencia
-- (supabase/migrations/20261002391230_talkx_audience_rpc.sql: whitelist de
-- campo nas linhas 139-160, de operador nas 165-173, validacao de tipo do
-- valor nas 183-200 e montagem do predicado nas 202-260).
--
-- PROBLEMA: nao existe lista oficial de campos/operadores no banco. O front
-- hardcoda RULE_FIELDS/RULE_OPS e a RPC de audiencia repete a mesma validacao
-- em PL/pgSQL; um campo ou operador fora da whitelist pode passar despercebido
-- e as duas validacoes saem de sincronia.
--
-- CORRECAO: a funcao talkx_compile_segment_rules valida cada regra contra a
-- tabela (falha fechada) e devolve um predicado SQL sobre `c` (alias de
-- contacts). O identificador da coluna sai por format('%I') e todo valor sai
-- por quote_literal/%L. O ramo de data (in_last_days/not_in_last_days)
-- converte o valor para integer validado ANTES de montar o intervalo, de modo
-- que o texto cru do valor nunca entra no SQL dinamico.
--
-- Semantica de data igual a RPC (20261002391230, linhas 248-259) e ao front
-- (useTalkXSegments.ts, ramo de data nas linhas 189-196): inicio do dia de
-- calendario em America/Sao_Paulo, (dias - 1) atras.
--
-- Classe: ADITIVA e idempotente (CREATE TABLE IF NOT EXISTS, INSERT ... ON
-- CONFLICT, DROP POLICY IF EXISTS + CREATE POLICY, CREATE OR REPLACE FUNCTION,
-- REVOKE/GRANT). Reaplicar na mesma base nao altera o resultado.

CREATE TABLE IF NOT EXISTS public.talkx_segment_fields (
  field    text PRIMARY KEY,
  category text NOT NULL,
  source   text NOT NULL DEFAULT 'contacts',
  expr     text NOT NULL,
  kind     text NOT NULL CHECK (kind IN ('text','array','number','date','enum','uuid')),
  ops      text[] NOT NULL,
  enabled  boolean NOT NULL DEFAULT true
);

-- Seed da whitelist (espelha RULE_FIELDS/RULE_OPS do front e a RPC de
-- audiencia). expr guarda a coluna do contato resolvida em `source`.
INSERT INTO public.talkx_segment_fields (field, category, source, expr, kind, ops) VALUES
  ('tags',                'basico',        'contacts', 'tags',                'array',  ARRAY['contains','not_contains','is_empty']),
  ('company',             'basico',        'contacts', 'company',             'text',   ARRAY['eq','neq','contains','not_contains','is_set','is_empty']),
  ('contact_type',        'comercial',     'contacts', 'contact_type',        'enum',   ARRAY['eq','neq','is_empty']),
  ('conversation_status', 'comportamento', 'contacts', 'conversation_status', 'enum',   ARRAY['eq','neq','is_empty']),
  ('channel_type',        'basico',        'contacts', 'channel_type',        'text',   ARRAY['eq','neq','contains','not_contains','is_set','is_empty']),
  ('consent_status',      'lgpd',          'contacts', 'consent_status',      'enum',   ARRAY['eq','neq','is_empty']),
  ('lead_score',          'comercial',     'contacts', 'lead_score',          'number', ARRAY['eq','gt','gte','lt','lte']),
  ('risk_score',          'comportamento', 'contacts', 'risk_score',          'number', ARRAY['eq','gt','gte','lt','lte']),
  ('ai_priority',         'comportamento', 'contacts', 'ai_priority',         'enum',   ARRAY['eq','neq','is_empty']),
  ('ai_sentiment',        'comportamento', 'contacts', 'ai_sentiment',        'enum',   ARRAY['eq','neq','is_empty']),
  ('lead_origin',         'basico',        'contacts', 'lead_origin',         'text',   ARRAY['eq','neq','contains','not_contains','is_set','is_empty']),
  ('updated_at',          'comportamento', 'contacts', 'updated_at',          'date',   ARRAY['in_last_days','not_in_last_days']),
  ('created_at',          'basico',        'contacts', 'created_at',          'date',   ARRAY['in_last_days','not_in_last_days']),
  ('email',               'basico',        'contacts', 'email',               'text',   ARRAY['eq','neq','contains','not_contains','is_set','is_empty']),
  ('city',                'basico',        'contacts', 'city',                'text',   ARRAY['eq','neq','contains','not_contains','is_set','is_empty']),
  ('state',               'basico',        'contacts', 'state',               'text',   ARRAY['eq','neq','contains','not_contains','is_set','is_empty']),
  ('assigned_to',         'comercial',     'contacts', 'assigned_to',         'uuid',   ARRAY['eq','neq','is_empty']),
  ('group_category',      'basico',        'contacts', 'group_category',      'enum',   ARRAY['eq','neq','is_empty'])
ON CONFLICT (field) DO UPDATE SET
  category = EXCLUDED.category,
  source   = EXCLUDED.source,
  expr     = EXCLUDED.expr,
  kind     = EXCLUDED.kind,
  ops      = EXCLUDED.ops,
  enabled  = EXCLUDED.enabled;

ALTER TABLE public.talkx_segment_fields ENABLE ROW LEVEL SECURITY;

-- DROP antes de CREATE: o Postgres nao tem CREATE POLICY IF NOT EXISTS. Sem
-- isso, reaplicar a migration na mesma base falharia na policy existente.
DROP POLICY IF EXISTS "talkx_segment_fields_select" ON public.talkx_segment_fields;
CREATE POLICY "talkx_segment_fields_select" ON public.talkx_segment_fields
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "talkx_segment_fields_service_role_write" ON public.talkx_segment_fields;
CREATE POLICY "talkx_segment_fields_service_role_write" ON public.talkx_segment_fields
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.talkx_segment_fields FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.talkx_segment_fields TO authenticated;
GRANT ALL ON public.talkx_segment_fields TO service_role;

-- Compila as regras do segmento em um predicado SQL sobre `c` (alias de
-- contacts). Cada regra e validada contra talkx_segment_fields; campo,
-- operador ou valor fora do contrato geram EXCEPTION 22023 (falha fechada).
--
-- p_depth existe para a compilacao de segmento dentro de segmento (in_segment):
-- a profundidade maxima e 1 (docs/talkx/v4/etapas/F09-segmentos.md:46).
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
$function$;

REVOKE ALL ON FUNCTION public.talkx_compile_segment_rules(jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_compile_segment_rules(jsonb, integer) TO authenticated, service_role;
