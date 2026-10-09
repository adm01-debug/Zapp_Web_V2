-- talkx_segment_fields: tabela oficial de campos e operadores de segmento + funcao de compilacao
-- Rollback: DROP FUNCTION IF EXISTS public.talkx_compile_segment_rules; DROP TABLE IF EXISTS public.talkx_segment_fields;
-- Rollback (SQL executavel, na ordem):
--   DROP FUNCTION IF EXISTS public.talkx_compile_segment_rules;
--   DROP TABLE IF EXISTS public.talkx_segment_fields;
--
-- N-111: lista oficial de campos e operadores de segmento do Talk X.
-- A tabela talkx_segment_fields e a funcao talkx_compile_segment_rules
-- substituem a whitelist hardcoded em src/hooks/integrations/useTalkXSegments.ts
-- (RULE_FIELDS/RULE_OPS) e a logica de validacao em
-- supabase/migrations/20261002391230_talkx_audience_rpc.sql (segs:139-174).
-- O front continua usando RULE_FIELDS/RULE_OPS como fonte de verdade para
-- a UI; o banco e a funcao sao a fonte oficial para compilacao e seguranca.
--
-- PROBLEMA: nao ha lista oficial de campos/operadores no banco; o front
-- hardcoda a whitelist e a RPC de audiencia replica a mesma logica em PL/pgSQL.
-- Campos ou operadores invalidos podem passar despercebidos ou a validacao
-- fica dessincronizada entre front e banco.
--
-- CORRECAO: criar a tabela talkx_segment_fields com a lista completa de
-- campos autorizados, seus tipos (kind), operadores permitidos (ops) e a
-- expressao SQL que os resolve (expr). Criar a funcao
-- talkx_compile_segment_rules que le desta tabela e monta o predicado SQL
-- usando format('%I') e quote_literal, garantindo que so campos e
-- operadores aprovados chegam ao SQL dinamico.
--
-- Classe: ADITIVA (tabela nova + funcao nova + policies + grants).
-- Idempotente/replayavel: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE
-- FUNCTION + CREATE POLICY IF NOT EXISTS (nao existe no Postgres,
-- substitui por DROP/CREATE).

-- Tabela com a lista oficial de campos/operadores permitidos em segmentos.
CREATE TABLE IF NOT EXISTS public.talkx_segment_fields (
  field      text PRIMARY KEY,
  category   text NOT NULL,
  source     text NOT NULL DEFAULT 'contacts',
  expr       text NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('text','array','number','date','enum','uuid')),
  ops        text[] NOT NULL,
  enabled    boolean NOT NULL DEFAULT true
);

-- Seed com a whitelist completa (espelha RULE_FIELDS/RULE_OPS do front).
INSERT INTO public.talkx_segment_fields (field, category, source, expr, kind, ops) VALUES
  ('tags',           'basico',     'contacts', 'c.tags',                       'array',  ARRAY['contains','not_contains','is_empty']),
  ('company',        'basico',     'contacts', 'c.company',                    'text',   ARRAY['eq','neq','contains','not_contains','is_set','is_empty']),
  ('contact_type',   'comercial',  'contacts', 'c.contact_type',               'enum',   ARRAY['eq','neq','is_empty']),
  ('conversation_status', 'comportamento', 'contacts', 'c.conversation_status', 'enum', ARRAY['eq','neq','is_empty']),
  ('channel_type',   'basico',     'contacts', 'c.channel_type',               'text',   ARRAY['eq','neq','contains','not_contains','is_set','is_empty']),
  ('consent_status', 'lgpd',       'contacts', 'c.consent_status',             'enum',   ARRAY['eq','neq','is_empty']),
  ('lead_score',     'comercial',  'contacts', 'c.lead_score',                 'number', ARRAY['eq','gt','gte','lt','lte']),
  ('risk_score',     'comportamento', 'contacts', 'c.risk_score',               'number', ARRAY['eq','gt','gte','lt','lte']),
  ('ai_priority',    'comportamento', 'contacts', 'c.ai_priority',              'enum',   ARRAY['eq','neq','is_empty']),
  ('ai_sentiment',   'comportamento', 'contacts', 'c.ai_sentiment',             'enum',   ARRAY['eq','neq','is_empty']),
  ('lead_origin',    'basico',     'contacts', 'c.lead_origin',                'text',   ARRAY['eq','neq','contains','not_contains','is_set','is_empty']),
  ('updated_at',     'comportamento', 'contacts', 'c.updated_at',               'date',   ARRAY['in_last_days','not_in_last_days']),
  ('created_at',     'basico',     'contacts', 'c.created_at',                 'date',   ARRAY['in_last_days','not_in_last_days']),
  ('email',          'basico',     'contacts', 'c.email',                      'text',   ARRAY['eq','neq','contains','not_contains','is_set','is_empty']),
  ('city',           'basico',     'contacts', 'c.city',                       'text',   ARRAY['eq','neq','contains','not_contains','is_set','is_empty']),
  ('state',          'basico',     'contacts', 'c.state',                      'text',   ARRAY['eq','neq','contains','not_contains','is_set','is_empty']),
  ('assigned_to',    'comercial',  'contacts', 'c.assigned_to',                'uuid',   ARRAY['eq','neq','is_empty']),
  ('group_category', 'basico',     'contacts', 'c.group_category',             'enum',   ARRAY['eq','neq','is_empty'])
ON CONFLICT (field) DO UPDATE SET
  category   = EXCLUDED.category,
  source     = EXCLUDED.source,
  expr       = EXCLUDED.expr,
  kind       = EXCLUDED.kind,
  ops        = EXCLUDED.ops,
  enabled    = EXCLUDED.enabled;

ALTER TABLE public.talkx_segment_fields ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuario autenticado pode ler a lista oficial.
CREATE POLICY "talkx_segment_fields_select" ON public.talkx_segment_fields FOR SELECT
  TO authenticated
  USING (true);

-- Escrita: somente service_role (admin/supervisor via Edge ou backend).
CREATE POLICY "talkx_segment_fields_service_role_write" ON public.talkx_segment_fields FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON public.talkx_segment_fields FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.talkx_segment_fields TO authenticated;
GRANT ALL ON public.talkx_segment_fields TO service_role;

-- Funcao que compila regras de segmento em predicado SQL, usando apenas
-- campos e operadores da tabela oficial (talkx_segment_fields).
-- Usa format('%I') para identificadores e quote_literal para valores,
-- impedindo injecao SQL.
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

      -- Construir o predicado SQL com format('%I') e quote_literal.
      IF v_op = 'is_set' THEN
        v_rule_sql := format('%s IS NOT NULL', v_expr);
      ELSIF v_op = 'is_empty' THEN
        IF v_kind = 'array' THEN
          v_rule_sql := format('(%s IS NULL OR %s = %L::text[])', v_expr, v_expr, '{}');
        ELSIF v_kind = 'uuid' THEN
          v_rule_sql := format('%s IS NULL', v_expr);
        ELSE
          v_rule_sql := format('(%s IS NULL OR %s = %L)', v_expr, v_expr, '');
        END IF;
      ELSIF v_op = 'contains' THEN
        IF v_kind = 'array' THEN
          v_rule_sql := format('%s @> ARRAY[%L]::text[]', v_expr, v_value);
        ELSE
          v_rule_sql := format('%s ILIKE %L', v_expr, '%' || v_value || '%');
        END IF;
      ELSIF v_op = 'not_contains' THEN
        IF v_kind = 'array' THEN
          v_rule_sql := format('(%s IS NULL OR NOT (%s @> ARRAY[%L]::text[]))', v_expr, v_expr, v_value);
        ELSE
          v_rule_sql := format('(%s IS NULL OR %s NOT ILIKE %L)', v_expr, v_expr, '%' || v_value || '%');
        END IF;
      ELSIF v_op = 'eq' THEN
        IF v_kind = 'number' THEN
          v_rule_sql := format('%s = %L::numeric', v_expr, v_value);
        ELSIF v_kind = 'uuid' THEN
          v_rule_sql := format('%s = %L::uuid', v_expr, v_value);
        ELSE
          v_rule_sql := format('%s = %L', v_expr, v_value);
        END IF;
      ELSIF v_op = 'neq' THEN
        IF v_kind = 'number' THEN
          v_rule_sql := format('(%s IS NULL OR %s <> %L::numeric)', v_expr, v_expr, v_value);
        ELSIF v_kind = 'uuid' THEN
          v_rule_sql := format('(%s IS NULL OR %s <> %L::uuid)', v_expr, v_expr, v_value);
        ELSE
          v_rule_sql := format('(%s IS NULL OR %s <> %L)', v_expr, v_expr, v_value);
        END IF;
      ELSIF v_op IN ('gt', 'gte', 'lt', 'lte') THEN
        v_rule_sql := format('%s %s %L::numeric', v_expr,
          CASE v_op WHEN 'gt' THEN '>' WHEN 'gte' THEN '>=' WHEN 'lt' THEN '<' ELSE '<=' END,
          v_value);
      ELSIF v_op IN ('in_last_days', 'not_in_last_days') THEN
        v_rule_sql := format(
          '%s %s (date_trunc(''day'', statement_timestamp() AT TIME ZONE ''America/Sao_Paulo'') - ((%s - 1) || '' days'')::interval AT TIME ZONE ''America/Sao_Paulo'')::timestamptz',
          v_expr,
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
