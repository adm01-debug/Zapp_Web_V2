-- ai_replace_tags_preserva_humana — prova do R2-DB-012 (item 297) sobre a RPC REAL
-- public.replace_ai_conversation_tags (cartão t_de4c995a; parte 3 da migration
-- 20260930110000_ai_block03_analysis_persistence.sql, linhas 169-221, corrigida por
-- 20261006203249_ai_replace_tags_preserva_humana.sql).
--
-- O QUE PROVA. A reclassificação de IA não pode transformar uma etiqueta HUMANA homônima em
-- etiqueta de IA (a reclassificação seguinte, que apaga source='ai', acabava apagando uma decisão
-- do humano que a IA nunca criou). A superfície mínima do Supabase é criada à mão aqui (roles
-- anon/authenticated/service_role, public.contacts e public.ai_conversation_tags com a UNIQUE
-- (contact_id, tag_name) e o CHECK de origem reais, ACL fechada como as migrations
-- 20260930130000/20260930490000 deixam) e o CORPO ANTERIOR da RPC é aplicado como estado inicial:
--   A  estrutura e ACL (RPC (uuid,jsonb)->jsonb, UNIQUE, CHECK, só service_role executa);
--   B  comportamento com a correção: etiqueta humana e manual homônimas sobrevivem intactas, a
--      etiqueta da IA continua sendo substituída, reclassificação vazia limpa SÓ a IA, uma linha
--      por (contato, nome), e p_contact_id nulo levanta 22023;
--   C  mutação e rollback: o corpo anterior do fixture — o mesmo que o SQL do cabeçalho
--      `-- Rollback:` da migration restaura — adota a etiqueta humana e a apaga na reclassificação
--      seguinte (o teste pega o defeito), e reaplicar a migration devolve o verde.
--
-- COMO RODA. Em Postgres descartável; fixtures e asserções numa transação que termina em ROLLBACK
-- — zero efeito colateral e idempotente:
--   docker run --rm -d --name zapp-v2-r2db012-$$ -v "$PWD:/repo:ro" \
--     -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--   docker exec -i zapp-v2-r2db012-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig=/repo/supabase/migrations/20261006203249_ai_replace_tags_preserva_humana.sql \
--     < supabase/tests/ai_replace_tags_preserva_humana.sql
-- O arquivo cria roles, tabelas e o corpo ANTERIOR à mão: só roda em Postgres descartável (no banco
-- da tarefa as roles, a FK e a tabela já existem).
-- VERMELHO esperado no estado anterior: o MESMO comando com -v sem_migration=1 falha já em B1,
-- porque sem a migration a etiqueta humana homônima é adotada pela IA (source='ai').

\set ON_ERROR_STOP on

-- Caminho do arquivo da migration sob teste: -v mig=<caminho> vence o padrão.
\if :{?mig}
\else
  \set mig 'supabase/migrations/20261006203249_ai_replace_tags_preserva_humana.sql'
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- Superfície mínima à mão (formas REAIS: UNIQUE, CHECK de origem e ACL das
-- migrations do bloco 03; corpo ANTERIOR da RPC como estado inicial)
-- ---------------------------------------------------------------------------
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE TABLE public.contacts (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name  text NOT NULL,
  phone text NOT NULL
);

CREATE TABLE public.ai_conversation_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_name   text NOT NULL,
  confidence numeric DEFAULT 0.0,
  source     text DEFAULT 'ai',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_conversation_tags_contact_tag_uidx UNIQUE (contact_id, tag_name),
  CONSTRAINT ai_conversation_tags_source_known CHECK (source IS NULL OR source IN ('ai', 'human', 'manual'))
);
CREATE INDEX idx_ai_conversation_tags_contact_id ON public.ai_conversation_tags (contact_id);

-- Corpo ANTERIOR (20260930110000_ai_block03_analysis_persistence.sql, linhas 169-221), guardado
-- aqui uma única vez: é o estado inicial e é o que o bloco C executa no lugar do rollback.
CREATE TEMP TABLE prova_anterior (nome text PRIMARY KEY, sql text);
INSERT INTO prova_anterior (nome, sql) VALUES ('replace_ai_conversation_tags', $corpo$
create function public.replace_ai_conversation_tags(
  p_contact_id uuid,
  p_tags jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_contact_id is null then
    raise exception 'p_contact_id é obrigatório' using errcode = '22023';
  end if;

  delete from public.ai_conversation_tags
   where contact_id = p_contact_id
     and source = 'ai';

  insert into public.ai_conversation_tags (contact_id, tag_name, confidence, source)
  select p_contact_id, t.tag_name, max(t.confidence), 'ai'
    from (
      select
        btrim(coalesce(e ->> 'name', '')) as tag_name,
        case
          when nullif(btrim(coalesce(e ->> 'confidence', '')), '') is null then null
          else least(greatest(nullif(btrim(coalesce(e ->> 'confidence', '')), '')::numeric, 0), 1)
        end as confidence
      from jsonb_array_elements(
        case when jsonb_typeof(p_tags) = 'array' then p_tags else '[]'::jsonb end
      ) as e
    ) t
   where t.tag_name <> ''
   group by t.tag_name
  on conflict (contact_id, tag_name) do update
     set confidence = greatest(
           coalesce(excluded.confidence, public.ai_conversation_tags.confidence),
           coalesce(public.ai_conversation_tags.confidence, excluded.confidence)
         ),
         source = 'ai';

  select count(*) into v_count
    from public.ai_conversation_tags
   where contact_id = p_contact_id and source = 'ai';

  return jsonb_build_object('contact_id', p_contact_id, 'replaced', true, 'count', v_count);
end;
$$;
$corpo$);

DO $$
BEGIN
  EXECUTE (SELECT sql FROM prova_anterior WHERE nome = 'replace_ai_conversation_tags');
END $$;

-- ACL: o que as migrations 20260930130000 (REVOKE de PUBLIC/anon) e 20260930490000 (RPC de escrita
-- só para service_role) deixam. O CREATE OR REPLACE da correção NÃO pode reabrir nada disto.
REVOKE EXECUTE ON FUNCTION public.replace_ai_conversation_tags(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_ai_conversation_tags(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.replace_ai_conversation_tags(uuid, jsonb) TO service_role;

INSERT INTO public.contacts (id, name, phone)
VALUES ('a1c0f00d-2650-4d0e-9b12-00000000db12', 'Fixt R2-DB-012', '+5500000000012');

-- ---------------------------------------------------------------------------
-- BLOCO A — estrutura e ACL
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.replace_ai_conversation_tags(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION '[FALHA] A1: não existe public.replace_ai_conversation_tags(uuid, jsonb)';
  END IF;

  IF pg_get_function_result('public.replace_ai_conversation_tags(uuid,jsonb)'::regprocedure) <> 'jsonb' THEN
    RAISE EXCEPTION '[FALHA] A1: a RPC não devolve jsonb';
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1 FROM pg_constraint c
       WHERE c.conrelid = 'public.ai_conversation_tags'::regclass
         AND c.contype = 'u'
         AND pg_get_constraintdef(c.oid) LIKE '%(contact_id, tag_name)%'
    )
    OR EXISTS (
      SELECT 1 FROM pg_index i
       WHERE i.indrelid = 'public.ai_conversation_tags'::regclass
         AND i.indisunique
         AND pg_get_indexdef(i.indexrelid) LIKE '%(contact_id, tag_name)%'
    )
  ) THEN
    RAISE EXCEPTION '[FALHA] A2: falta a UNIQUE (contact_id, tag_name) (o UPSERT depende dela)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.ai_conversation_tags'::regclass
       AND c.conname = 'ai_conversation_tags_source_known'
  ) THEN
    RAISE EXCEPTION '[FALHA] A3: falta o CHECK ai_conversation_tags_source_known (origem da etiqueta)';
  END IF;

  IF has_function_privilege('anon', 'public.replace_ai_conversation_tags(uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.replace_ai_conversation_tags(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '[FALHA] A4: anon/authenticated executam a RPC';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.replace_ai_conversation_tags(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '[FALHA] A4: service_role não executa a RPC';
  END IF;

  RAISE NOTICE 'A ok: estrutura e ACL (só service_role executa)';
END $$;

-- ---------------------------------------------------------------------------
-- Migration sob prova (sem ela, o bloco B falha — é o VERMELHO do teste)
-- ---------------------------------------------------------------------------
\if :{?sem_migration}
  -- estado ANTERIOR: o bloco B abaixo TEM de falhar aqui
\else
  \i :mig
\endif

-- ---------------------------------------------------------------------------
-- BLOCO B — comportamento (com a guarda)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cid constant uuid := 'a1c0f00d-2650-4d0e-9b12-00000000db12';
  v_ret jsonb;
  v_linha record;
BEGIN
  DELETE FROM public.ai_conversation_tags WHERE contact_id = v_cid;

  INSERT INTO public.ai_conversation_tags (contact_id, tag_name, confidence, source) VALUES
    (v_cid, 'vip',         0.40, 'human'),
    (v_cid, 'manual-flag', 0.10, 'manual'),
    (v_cid, 'ia-antiga',   0.30, 'ai');

  v_ret := public.replace_ai_conversation_tags(
    v_cid,
    '[{"name":"vip","confidence":0.95},{"name":"ia-nova","confidence":0.80}]'::jsonb
  );

  -- B1 — a etiqueta HUMANA homônima não é adotada nem tem a confiança reescrita.
  SELECT source, confidence INTO v_linha
    FROM public.ai_conversation_tags WHERE contact_id = v_cid AND tag_name = 'vip';
  IF v_linha.source IS DISTINCT FROM 'human' OR v_linha.confidence IS DISTINCT FROM 0.40 THEN
    RAISE EXCEPTION '[FALHA] B1: etiqueta humana homônima foi alterada pela IA (source=%, confiança=%)',
      coalesce(v_linha.source, 'NULL'), coalesce(v_linha.confidence::text, 'NULL');
  END IF;

  -- B2 — etiqueta manual idem.
  SELECT source, confidence INTO v_linha
    FROM public.ai_conversation_tags WHERE contact_id = v_cid AND tag_name = 'manual-flag';
  IF v_linha.source IS DISTINCT FROM 'manual' OR v_linha.confidence IS DISTINCT FROM 0.10 THEN
    RAISE EXCEPTION '[FALHA] B2: etiqueta manual foi alterada pela IA (source=%, confiança=%)',
      coalesce(v_linha.source, 'NULL'), coalesce(v_linha.confidence::text, 'NULL');
  END IF;

  -- B3 — a IA continua substituindo o que é dela.
  IF EXISTS (SELECT 1 FROM public.ai_conversation_tags WHERE contact_id = v_cid AND tag_name = 'ia-antiga') THEN
    RAISE EXCEPTION '[FALHA] B3: a reclassificação não removeu a etiqueta de IA anterior (ia-antiga)';
  END IF;
  SELECT source, confidence INTO v_linha
    FROM public.ai_conversation_tags WHERE contact_id = v_cid AND tag_name = 'ia-nova';
  IF v_linha.source IS DISTINCT FROM 'ai' OR v_linha.confidence IS DISTINCT FROM 0.80 THEN
    RAISE EXCEPTION '[FALHA] B3: etiqueta nova da IA ficou source=% confiança=% (esperado ai/0.80)',
      coalesce(v_linha.source, 'NULL'), coalesce(v_linha.confidence::text, 'NULL');
  END IF;

  -- B4 — uma linha por (contato, nome) e o retorno conta só as etiquetas de IA.
  IF (SELECT count(*) FROM public.ai_conversation_tags WHERE contact_id = v_cid AND tag_name = 'vip') <> 1 THEN
    RAISE EXCEPTION '[FALHA] B4: mais de uma linha para (contato, vip)';
  END IF;
  IF (v_ret ->> 'count')::int <> 1 THEN
    RAISE EXCEPTION '[FALHA] B4: o retorno contou % etiqueta(s) de IA (esperado 1 — só ia-nova)', v_ret ->> 'count';
  END IF;

  -- B5 — reclassificação VAZIA limpa só a IA.
  v_ret := public.replace_ai_conversation_tags(v_cid, '[]'::jsonb);
  IF (v_ret ->> 'count')::int <> 0
     OR EXISTS (SELECT 1 FROM public.ai_conversation_tags WHERE contact_id = v_cid AND source = 'ai') THEN
    RAISE EXCEPTION '[FALHA] B5: a limpeza vazia não zerou as etiquetas de IA (retorno=%)', v_ret::text;
  END IF;
  IF (SELECT count(*) FROM public.ai_conversation_tags WHERE contact_id = v_cid) <> 2 THEN
    RAISE EXCEPTION '[FALHA] B5: a limpeza vazia apagou etiqueta que não era da IA (sobraram % de 2)',
      (SELECT count(*) FROM public.ai_conversation_tags WHERE contact_id = v_cid);
  END IF;

  -- B6 — a IA atualiza a PRÓPRIA etiqueta na reclassificação seguinte.
  INSERT INTO public.ai_conversation_tags (contact_id, tag_name, confidence, source)
    VALUES (v_cid, 'ia-nova', 0.20, 'ai');
  PERFORM public.replace_ai_conversation_tags(v_cid, '[{"name":"ia-nova","confidence":0.90}]'::jsonb);
  SELECT source, confidence INTO v_linha
    FROM public.ai_conversation_tags WHERE contact_id = v_cid AND tag_name = 'ia-nova';
  IF v_linha.source IS DISTINCT FROM 'ai' OR v_linha.confidence IS DISTINCT FROM 0.90 THEN
    RAISE EXCEPTION '[FALHA] B6: a IA não atualizou a própria etiqueta (source=%, confiança=%)',
      coalesce(v_linha.source, 'NULL'), coalesce(v_linha.confidence::text, 'NULL');
  END IF;

  DELETE FROM public.ai_conversation_tags WHERE contact_id = v_cid;
  RAISE NOTICE 'B ok: etiqueta humana/manual preservada, a da IA substituída, limpeza vazia só na IA';
END $$;

-- B7 — p_contact_id nulo
DO $$
DECLARE
  v_levantou boolean := false;
  v_sqlstate text;
BEGIN
  BEGIN
    PERFORM public.replace_ai_conversation_tags(null::uuid, '[]'::jsonb);
  EXCEPTION WHEN others THEN
    v_levantou := true;
    v_sqlstate := sqlstate;
  END;

  IF NOT v_levantou THEN
    RAISE EXCEPTION '[FALHA] B7: chamada com p_contact_id nulo passou sem erro';
  END IF;
  IF v_sqlstate <> '22023' THEN
    RAISE EXCEPTION '[FALHA] B7: p_contact_id nulo levantou % (esperado 22023)', v_sqlstate;
  END IF;

  RAISE NOTICE 'B7 ok: p_contact_id nulo levanta 22023';
END $$;

-- ---------------------------------------------------------------------------
-- BLOCO C — com o corpo ANTERIOR (o mesmo que o `-- Rollback:` restaura) o
-- defeito volta; reaplicar a migration devolve o verde
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cid constant uuid := 'a1c0f00d-2650-4d0e-9b12-00000000db12';
  v_def text;
  v_source text;
BEGIN
  v_def := pg_get_functiondef('public.replace_ai_conversation_tags(uuid,jsonb)'::regprocedure);

  IF strpos(v_def, 'where public.ai_conversation_tags.source = ''ai'';') = 0 THEN
    RAISE EXCEPTION '[FALHA] C1: a definição entregue não tem a guarda (where ... source = ''ai'';)';
  END IF;

  DELETE FROM public.ai_conversation_tags WHERE contact_id = v_cid;
  INSERT INTO public.ai_conversation_tags (contact_id, tag_name, confidence, source)
    VALUES (v_cid, 'vip', 0.40, 'human');
  -- A RPC é removida antes: o corpo anterior do repo é um `create function`.
  DROP FUNCTION public.replace_ai_conversation_tags(uuid, jsonb);
  EXECUTE (SELECT sql FROM prova_anterior WHERE nome = 'replace_ai_conversation_tags');

  PERFORM public.replace_ai_conversation_tags(v_cid, '[{"name":"vip","confidence":0.95}]'::jsonb);
  SELECT source INTO v_source
    FROM public.ai_conversation_tags WHERE contact_id = v_cid AND tag_name = 'vip';
  IF v_source IS DISTINCT FROM 'ai' THEN
    RAISE EXCEPTION '[FALHA] C2: com o corpo anterior a etiqueta humana NÃO virou de IA (source=%)', coalesce(v_source, 'NULL');
  END IF;
  RAISE NOTICE 'C2 ok: com o corpo anterior a etiqueta humana é adotada pela IA (source=ai) — defeito R2-DB-012';

  PERFORM public.replace_ai_conversation_tags(v_cid, '[]'::jsonb);
  IF EXISTS (SELECT 1 FROM public.ai_conversation_tags WHERE contact_id = v_cid AND tag_name = 'vip') THEN
    RAISE EXCEPTION '[FALHA] C3: com o corpo anterior a limpeza vazia NÃO apagou a etiqueta humana';
  END IF;
  RAISE NOTICE 'C3 ok: a reclassificação seguinte apaga a etiqueta que era humana';

  DELETE FROM public.ai_conversation_tags WHERE contact_id = v_cid;
END $$;

-- Reaplica a migration sob teste (é o próprio arquivo, não uma cópia): o verde volta.
\i :mig

DO $$
DECLARE
  v_cid constant uuid := 'a1c0f00d-2650-4d0e-9b12-00000000db12';
  v_source text;
BEGIN
  INSERT INTO public.ai_conversation_tags (contact_id, tag_name, confidence, source)
    VALUES (v_cid, 'vip', 0.40, 'human');
  PERFORM public.replace_ai_conversation_tags(v_cid, '[{"name":"vip","confidence":0.95}]'::jsonb);
  SELECT source INTO v_source
    FROM public.ai_conversation_tags WHERE contact_id = v_cid AND tag_name = 'vip';
  IF v_source IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION '[FALHA] C4: reaplicar a migration não devolveu o comportamento correto (source=%)',
      coalesce(v_source, 'NULL');
  END IF;

  DELETE FROM public.ai_conversation_tags WHERE contact_id = v_cid;
  RAISE NOTICE 'C4 ok: reaplicada a migration, a etiqueta humana volta a ser preservada';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'ai_replace_tags_preserva_humana: SUITE VERDE — estrutura/ACL, comportamento com a guarda, defeito com o corpo anterior e volta do comportamento correto provados';
END $$;

-- Nada fica no banco: a transação devolve o estado anterior (tabelas, roles e fixture inclusive).
ROLLBACK;
