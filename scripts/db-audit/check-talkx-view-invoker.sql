-- Guard fail-closed (V01): public.talkx_campaign_metrics precisa ser uma view
-- com security_invoker ativo.
--
-- Sem a opcao a view roda com os privilegios do dono (postgres, rolbypassrls)
-- e ignora a RLS de public.talkx_campaigns, expondo metrica e nome de campanha
-- de outros agentes a qualquer usuario autenticado. Foi exatamente o que
-- 20260922130000 reintroduziu com CREATE OR REPLACE VIEW (o CREATE OR REPLACE
-- zera reloptions), desfazendo 20260916170000.
--
-- Tambem verifica que authenticated segue com SELECT: o grant e o que mantem
-- useTalkXInsights funcionando para o proprio usuario. O guard cobre os dois
-- lados (nao vaza e nao quebra consumidor) para nao permitir "consertar"
-- revogando a leitura.
--
-- A grafia da reloption depende do DDL de origem: 'true' fica
-- security_invoker=true e 'on' fica security_invoker=on (o Postgres nao
-- normaliza uma na outra). As duas sao aceitas.

\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
SET search_path TO pg_catalog;

WITH target AS (
  SELECT c.oid, c.reloptions
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'talkx_campaign_metrics'
    AND c.relkind = 'v'
),
checks AS (
  SELECT
    count(*) = 1 AS view_exists,
    COALESCE(
      bool_and(EXISTS (
        SELECT 1
        FROM unnest(t.reloptions) AS option
        WHERE option ~ '^security_invoker=(on|true|yes|1)$'
      )),
      false
    ) AS security_invoker_on,
    COALESCE(
      bool_and(has_table_privilege('authenticated', t.oid, 'SELECT')),
      false
    ) AS authenticated_can_select
  FROM target t
),
result AS (
  SELECT
    view_exists AND security_invoker_on AND authenticated_can_select AS view_segura,
    jsonb_build_object(
      'view_exists', view_exists,
      'security_invoker_on', security_invoker_on,
      'authenticated_can_select', authenticated_can_select
    )::text AS resumo
  FROM checks
)
SELECT view_segura, resumo FROM result \gset

\echo :resumo
\if :view_segura
  \echo 'OK: talkx_campaign_metrics roda com security_invoker.'
\else
  \echo 'FALHA: a view talkx_campaign_metrics nao roda com security_invoker.'
  DO $talkx_metrics_view_invoker_guard$
  BEGIN
    RAISE EXCEPTION 'a view talkx_campaign_metrics nao roda com security_invoker';
  END
  $talkx_metrics_view_invoker_guard$;
\endif
