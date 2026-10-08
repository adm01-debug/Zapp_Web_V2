-- slo_inbound_latency_daily — view do SLO "Mensagem inbound visível" (docs/runbooks/slo.md, passo 4)
-- Rollback: DROP VIEW IF EXISTS public.slo_inbound_latency_daily; ALTER TABLE public.messages DROP COLUMN IF EXISTS received_at;
--
-- SL-045 (P2, passo 4 do runbook de SLO): a view slo_inbound_latency_daily nao existia
-- (grep slo_inbound em supabase/ = 0). Ela existe para dar HISTORICO ao SLO "Mensagem
-- inbound visivel", cujo alvo e p95 < 5 s entre o created_at do provedor (WhatsApp) e o
-- instante em que a mensagem ficou visivel no banco.
--
-- Por que a migration mexe em messages alem de criar a view: a segunda ponta da medida
-- nao existia. O inbound grava created_at = timestamp do provedor (ingest_inbound_message
-- recebe p_created_at), e nada guardava o relogio do INSERT: updated_at e reescrito por
-- qualquer UPDATE posterior (marcar lida, legenda, transcricao, media), e status_updated_at
-- pertence aos caminhos de ENVIO. Sem a ponta do INSERT uma view so poderia medir "idade da
-- mensagem" (horas), nunca a latencia do pipeline (o que o SLO promete).
--
-- Correcao minima, em duas partes dentro desta migration:
--   1. messages.received_at timestamptz = o relogio do INSERT, gravado pelo BANCO pelo
--      DEFAULT now() (nenhuma edge muda; o ingest nao passa a coluna). A coluna entra SEM
--      default na primeira linha e recebe SET DEFAULT depois, de proposito: ADD COLUMN com
--      default volatil (now()) reescreveria a tabela inteira sob ACCESS EXCLUSIVE e carimba-
--      ria TODO o historico com a hora da migration. Assim o legado fica NULL — honesto,
--      "desconhecido" — e passa a ser preenchido no proximo INSERT.
--   2. a view pedida: p50/p95 em ms, por dia (America/Sao_Paulo), apenas sender = 'contact'
--      e apenas linhas com as duas pontas conhecidas.
--
-- Decisoes de desenho:
--   * security_invoker = true — sem a opcao a view rodaria com os privilegios do dono e
--     atravessaria a RLS de messages. Com ela, admin/supervisor enxergam o SLO global e um
--     agente ve a propria carteira, que e o mesmo contrato das outras views de metrica do
--     projeto (searchbox_usage_daily). Nada de conteudo de mensagem sai daqui: so contagem
--     e percentis.
--   * atraso negativo (relogio do provedor adiantado em relacao ao nosso) vira 0: latencia
--     negativa nao significa nada, e descartar a linha esconderia o problema.
--   * mensagem removida depois (is_deleted) continua contando: o ingest aconteceu, e o SLO
--     mede o ingest. Filtrar por is_deleted distorceria a serie para baixo.
--   * % de mensagens acima do alvo: o p95 do dia responde a pergunta do SLO; nao criamos
--     coluna extra para nao inventar contrato que o runbook nao pede.

SET LOCAL lock_timeout = '5s';

-- 1. a ponta do INSERT (metadado puro: sem reescrita de tabela e sem dado falso no historico)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS received_at timestamptz;

ALTER TABLE public.messages
  ALTER COLUMN received_at SET DEFAULT now();

COMMENT ON COLUMN public.messages.received_at IS
  'SL-045: relogio do INSERT da linha (default now(), gravado pelo banco). Com created_at (timestamp do provedor) alimenta a view public.slo_inbound_latency_daily — a latencia do pipeline inbound. NULL nas linhas anteriores a esta migration: desconhecido, nao zero.';

-- 2. a view
CREATE OR REPLACE VIEW public.slo_inbound_latency_daily
WITH (security_invoker = true)
AS
WITH inbound AS (
  SELECT
    (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
    greatest(0, extract(epoch FROM (m.received_at - m.created_at)) * 1000) AS latencia_ms
  FROM public.messages m
  WHERE m.sender = 'contact'
    AND m.received_at IS NOT NULL
)
SELECT
  dia,
  count(*)::integer AS mensagens,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY latencia_ms))::integer AS latencia_p50_ms,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY latencia_ms))::integer AS latencia_p95_ms
FROM inbound
GROUP BY dia
ORDER BY dia DESC;

COMMENT ON VIEW public.slo_inbound_latency_daily IS
  'SL-045 (docs/runbooks/slo.md, passo 4): latencia do inbound visivel por dia — p50/p95 em ms entre created_at (timestamp do provedor) e received_at (relogio do INSERT). Sender = contact, fuso America/Sao_Paulo, dias com as duas pontas conhecidas. security_invoker: respeita a RLS de messages de quem consulta.';

-- Mesmo contrato de acesso das outras views de metrica: nada para PUBLIC/anon, leitura para autenticado.
REVOKE ALL ON public.slo_inbound_latency_daily FROM PUBLIC, anon;
GRANT SELECT ON public.slo_inbound_latency_daily TO authenticated;
