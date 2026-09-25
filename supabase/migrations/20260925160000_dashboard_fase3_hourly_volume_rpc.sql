-- Dashboard 50 etapas — Fase 3 (E22): RPC dashboard_hourly_volume
-- Ref: claude/PLANO_DASHBOARD_50_ETAPAS.md
--
-- Corrige achado A6: useTodayHourlyVolume buscava TODAS as messages de 8 dias no
-- cliente (.select('created_at').gte(...), sem limit/range) — o cap silencioso de
-- 1000 linhas do PostgREST truncava a amostra (45k+ mensagens na tabela hoje),
-- corrompendo o gráfico de volume por hora e a "previsão" (média de 7 dias).
--
-- Fix: agregação por (dia local, hora) feita no servidor. Validado em 25/09/2026
-- via SELECT equivalente direto (db_query): 8 dias reais = 84 linhas agregadas
-- (bem abaixo do cap de 1000), contra 45k+ linhas cruas que o cliente buscava antes.
--
-- Fuso: America/Sao_Paulo hardcoded (equipe opera só em SP hoje; client-side usava
-- Date.getHours() do browser, que já assume o fuso local do usuário — mesma premissa).
--
-- SECURITY INVOKER: RLS de messages já restringe por fila/atribuição
-- (messages_select_policy usa is_admin_or_supervisor/get_visible_agent_ids/
-- queue_members, igual contacts) — a RPC herda esse escopo automaticamente,
-- sem precisar reimplementar a régua de visibilidade aqui.

CREATE OR REPLACE FUNCTION public.dashboard_hourly_volume(p_days int DEFAULT 8)
RETURNS TABLE (day date, hour integer, message_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
    extract(hour FROM created_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
    count(*) AS message_count
  FROM public.messages
  WHERE created_at >= (
    date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
    - (make_interval(days => greatest(least(coalesce(p_days, 8), 31), 1) - 1))
  ) AT TIME ZONE 'America/Sao_Paulo'
  GROUP BY 1, 2;
$$;

COMMENT ON FUNCTION public.dashboard_hourly_volume(int) IS
  'Dashboard E22 (2026-09-25): agrega messages por (dia local America/Sao_Paulo, hora) '
  'para os ultimos p_days dias (default 8, clamp 1-31). SECURITY INVOKER — respeita RLS '
  'de messages. Substitui fetch cru de linhas no cliente (achado A6: cap silencioso de '
  '1000 linhas do PostgREST truncava a amostra em useTodayHourlyVolume).';

GRANT EXECUTE ON FUNCTION public.dashboard_hourly_volume(int) TO authenticated;
