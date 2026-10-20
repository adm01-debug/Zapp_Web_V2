-- rollback: DROP VIEW IF EXISTS public.searchbox_usage_daily;
--
-- E52 (Fase 4 · custo e observabilidade) — uso DIÁRIO do Searchbox.
--
-- Por que existe: o teto mensal é protegido por `count_searchbox_sessions_this_month()`, que devolve
-- UM número — dá para saber que o mês estourou, mas não QUANDO nem com que velocidade o consumo
-- subiu. Sem isso, uma semana de pico come o mês inteiro e a decisão (subir o teto em E48 ou parar
-- de disparar `/suggest`) chega depois do dinheiro gasto. Esta view mostra o consumo por dia no
-- mesmo fuso e sobre a mesma fonte da RPC do contador (`audit_logs`, `America/Sao_Paulo`) — espelha,
-- não interpreta.
--
-- `security_invoker = true` é essencial: sem isso a view roda com os privilégios do DONO e
-- atravessaria a RLS de `audit_logs`, expondo linhas de auditoria de terceiros para quem só pode
-- ver as próprias. Com a opção, a RLS do usuário que consulta continua valendo.
CREATE OR REPLACE VIEW public.searchbox_usage_daily
WITH (security_invoker = true)
AS
SELECT
  (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
  count(*) FILTER (WHERE a.action = 'searchbox_session')::integer AS sessoes,
  count(*) FILTER (WHERE a.action = 'searchbox_cost_guard')::integer AS degradacoes,
  max(a.created_at) AS ultimo_evento_em
FROM public.audit_logs a
WHERE a.action IN ('searchbox_session', 'searchbox_cost_guard')
GROUP BY 1
ORDER BY 1 DESC;

COMMENT ON VIEW public.searchbox_usage_daily IS
  'E52: consumo diario do Searchbox (sessoes) e avisos de teto (degradacoes), no fuso America/Sao_Paulo. Fonte: audit_logs, a mesma da RPC count_searchbox_sessions_this_month.';

-- Mesmo contrato de acesso da RPC do contador: nada para PUBLIC/anon, leitura para autenticado.
REVOKE ALL ON public.searchbox_usage_daily FROM PUBLIC, anon;
GRANT SELECT ON public.searchbox_usage_daily TO authenticated;
