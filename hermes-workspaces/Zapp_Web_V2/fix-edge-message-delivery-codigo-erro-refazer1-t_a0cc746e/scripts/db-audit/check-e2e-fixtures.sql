-- Guard fail-closed (E85): os tres fixtures de E2E precisam continuar existindo no
-- banco de producao, com o conteudo minimo que os specs logados exigem.
--
-- Por que isso e' guard e nao zelo: os fixtures vivem no banco de PRODUCAO
-- (tnnnlkbymytvtqngbbqh), porque a suite logada roda contra producao -- e nao ha
-- staging. Se um deles for apagado num DELETE de limpeza, num reset de ambiente ou
-- por engano numa migration, o sintoma nao e' "fixture sumiu": e' um spec logado
-- falhando com erro que parece bug de aplicacao (dropdown vazio, contato que nao
-- aparece, segmento inexistente). O diagnostico custa muito mais que esta checagem.
--
-- Cada linha abaixo corresponde a uma constante do codigo, que e' a fonte do id:
--   e2e/fixtures/e2e-contact.ts  -> E2E_FIXTURE_CONTACT_ID  (public.contacts)
--   e2e/fixtures/e2e-talkx.ts    -> E2E_TALKX_CONNECTION_ID (public.whatsapp_connections)
--                                -> E2E_TALKX_SEGMENT_ID    (public.talkx_segments)
--
-- A conexao tem duas exigencias que NAO sao cosmeticas: useCampaignEditor filtra por
-- status='connected' E por instance_id preenchido -- conexao disconnected nao aparece
-- no dropdown e o spec do wizard falharia mesmo com a linha existindo.
--
-- Roda pelo db-live-guard agendado, via psql-safe.mjs. NAO e' um .test.sh: esse
-- caminho nao existe no workflow, e um teste que ninguem executa da' sensacao de
-- cobertura sem cobrir nada.

\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
SET search_path TO pg_catalog;

WITH alvo AS (
  SELECT
    to_regclass('public.contacts') AS contacts,
    to_regclass('public.whatsapp_connections') AS connections,
    to_regclass('public.talkx_segments') AS segments
),
checks AS (
  SELECT
    -- As tabelas existem? Sem elas o resto do check nem faz sentido -- e dizer isso
    -- e' melhor que estourar um erro de relacao inexistente, que confunde o leitor.
    (contacts IS NOT NULL) AS tabela_contacts,
    (connections IS NOT NULL) AS tabela_connections,
    (segments IS NOT NULL) AS tabela_segments
  FROM alvo
)
SELECT
  tabela_contacts AND tabela_connections AND tabela_segments AS tabelas_ok,
  jsonb_build_object(
    'contacts', tabela_contacts,
    'whatsapp_connections', tabela_connections,
    'talkx_segments', tabela_segments
  )::text AS resumo
FROM checks
\gset

\echo :resumo
\if :tabelas_ok
  \echo 'OK: as tres tabelas dos fixtures existem.'
\else
  \echo 'FALHA: tabela de fixture ausente no banco.'
  DO $e2e_fixtures_tabelas$
  BEGIN
    RAISE EXCEPTION 'tabela de fixture de E2E ausente no banco -- veja o resumo acima';
  END
  $e2e_fixtures_tabelas$;
\endif

-- Conteudo dos tres fixtures. Um SELECT so, com as tres linhas esperadas: assim o
-- resumo diz exatamente qual sumiu, em vez de um booleano sem contexto.
WITH esperado AS (
  SELECT 'contato' AS fixture, '04dff4dc-c6b1-4283-ac22-bd8639804759'::uuid AS id
  UNION ALL
  SELECT 'conexao', 'e2e0e2e0-0000-4000-a000-e2e000000001'::uuid
  UNION ALL
  SELECT 'segmento', '621521f3-e9c9-49c2-834e-cea07545d476'::uuid
),
presente AS (
  SELECT 'contato' AS fixture, count(*) AS n
  FROM public.contacts WHERE id = '04dff4dc-c6b1-4283-ac22-bd8639804759'::uuid
  UNION ALL
  SELECT 'conexao', count(*)
  FROM public.whatsapp_connections
  WHERE id = 'e2e0e2e0-0000-4000-a000-e2e000000001'::uuid
    AND status = 'connected'
    AND instance_id IS NOT NULL
  UNION ALL
  SELECT 'segmento', count(*)
  FROM public.talkx_segments WHERE id = '621521f3-e9c9-49c2-834e-cea07545d476'::uuid
),
resultado AS (
  SELECT
    bool_and(p.n = 1) AS todos_presentes,
    string_agg(
      CASE WHEN p.n = 1 THEN e.fixture || '=ok' ELSE e.fixture || '=FALTANDO' END,
      ', ' ORDER BY e.fixture
    ) AS resumo
  FROM esperado e
  JOIN presente p ON p.fixture = e.fixture
)
SELECT todos_presentes, resumo FROM resultado \gset

\echo :resumo
\if :todos_presentes
  \echo 'OK: os tres fixtures de E2E existem no banco.'
\else
  \echo 'FALHA: fixture de E2E ausente (ou conexao sem status connected/instance_id).'
  DO $e2e_fixtures_presenca$
  BEGIN
    RAISE EXCEPTION 'fixture de E2E ausente em producao -- os specs logados vao falhar de forma enganosa';
  END
  $e2e_fixtures_presenca$;
\endif
