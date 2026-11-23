-- X076 / IA-161 — a trilha de banco da IA do Talk X e os dois tetos de gasto.
--
-- POR QUE EXISTE: a edge `talkx-ai` foi escrita (e testada) contra a tabela
-- `talkx_ai_requests` e as chaves `ai_monthly_budget_usd` /
-- `ai_daily_requests_per_user` de `talkx_settings`, mas NENHUMA migration criou
-- essas tres coisas. Conferido no banco ao vivo em 22/11/2026:
--
--   select to_regclass('public.talkx_ai_requests');  -> (nulo)
--   select key from talkx_settings where key like 'ai_%';
--     -> ai_insights   (so a flag)
--
-- Consequencia medida: `lerAjustes` devolve orcamento 0 (padrao do item,
-- "desligado"), entao a edge recusa TODA chamada com `ai_disabled` (403) antes
-- de sair para a rede. E, mesmo se o orcamento existisse, a primeira gravacao
-- da trilha estouraria com `trail_write_failed`. O item X076 do plano do Talk X
-- v4 (Fase 6) e o IA-161 do plano de IA ("rascunho de campanha por IA") estavam
-- ambos travados nesta mesma DDL — nenhum dos dois podia ser ligado sem ela.
--
-- POR QUE UMA TABELA PROPRIA E NAO `ai_usage_logs`: a trilha do Talk X serve a
-- TRES perguntas que `ai_usage_logs` nao responde: (1) teto mensal de gasto por
-- ser somado com paginacao barata, (2) limite diario por usuario, (3) cache de
-- 24 h por `input_hash` da mesma entrada. `ai_usage_logs` e o livro-caixa de
-- TODA a IA do sistema (com tarifa versionada e conciliacao), nao o rascunho de
-- uma feature. Misturar as duas faria o teto do Talk X contar gasto de outras
-- features e vice-versa.
--
-- GARANTIAS
--   - RLS ligada e SEM `using (true)`: le so admin/supervisor (mesmo predicado
--     que a edge ja exige para o chamador), nada de leitura por usuario comum.
--     A escrita e exclusiva do service role (a edge), sem policy de INSERT.
--   - `input_hash` indexado junto com `created_at` DESC: e exatamente a consulta
--     do cache (mesmo hash, mais recente primeiro).
--   - indice parcial em `(created_at)` por `created_by`: e a consulta do limite
--     diario, e so as linhas do dia importam.
--   - `cost_usd` aceita NULO de proposito: custo nulo significa "sem tarifa
--     cadastrada", nunca zero. Zero faria o gasto sumir do teto.
--   - as duas chaves de teto nascem com o padrao do item: orcamento 0 (desligado)
--     e 20 pedidos/usuario/dia. Nada de IA paga ligada por default.
--
-- Rollback:
--   DELETE FROM public.talkx_settings WHERE key IN ('ai_monthly_budget_usd','ai_daily_requests_per_user');
--   DROP TABLE IF EXISTS public.talkx_ai_requests;

CREATE TABLE IF NOT EXISTS public.talkx_ai_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text        NOT NULL
               CHECK (kind IN ('insight_text', 'message_variation', 'segment_suggestion')),
  entity_type  text,
  entity_id    text,
  input_hash   text        NOT NULL,
  output       jsonb,
  model        text,
  tokens_in    integer     NOT NULL DEFAULT 0 CHECK (tokens_in  >= 0),
  tokens_out   integer     NOT NULL DEFAULT 0 CHECK (tokens_out >= 0),
  cost_usd     numeric(18, 8) CHECK (cost_usd IS NULL OR cost_usd >= 0),
  status       text        NOT NULL CHECK (status IN ('ok', 'error')),
  created_by   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.talkx_ai_requests IS
  'X076 — trilha de toda chamada de IA do Talk X: teto mensal, limite diario e cache de 24 h. cost_usd NULO = sem tarifa em ai_model_prices, nunca zero.';

COMMENT ON COLUMN public.talkx_ai_requests.input_hash IS
  'SHA-256 do kind + entrada canonica. Mesmo hash dentro de 24 h devolve o output do cache sem pagar de novo.';
COMMENT ON COLUMN public.talkx_ai_requests.cost_usd IS
  'Custo medido pela tarifa vigente (ai_model_prices). NULO quando o modelo nao tem tarifa — nao somar como zero.';

-- Cache: mesmo hash, mais recente primeiro, dentro da janela de 24 h.
CREATE INDEX IF NOT EXISTS talkx_ai_requests_cache_idx
  ON public.talkx_ai_requests (input_hash, created_at DESC);

-- Limite diario por usuario e soma do mes (paginada, ordenada por created_at).
CREATE INDEX IF NOT EXISTS talkx_ai_requests_usuario_dia_idx
  ON public.talkx_ai_requests (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS talkx_ai_requests_mes_idx
  ON public.talkx_ai_requests (created_at);

ALTER TABLE public.talkx_ai_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talkx_ai_requests_admin_read ON public.talkx_ai_requests;
CREATE POLICY talkx_ai_requests_admin_read
  ON public.talkx_ai_requests
  FOR SELECT TO authenticated
  USING (COALESCE(public.is_admin_or_supervisor(auth.uid()), false));

-- A escrita e do service role (a edge). Nenhuma policy de INSERT/UPDATE/DELETE:
-- sem policy, o role `authenticated` nao escreve nem apaga a propria trilha,
-- o que impediria o teto de ser burlavel pelo cliente.

REVOKE ALL ON public.talkx_ai_requests FROM anon;
GRANT SELECT ON public.talkx_ai_requests TO authenticated;

INSERT INTO public.talkx_settings (key, value, description) VALUES
  ('ai_monthly_budget_usd',       '0'::jsonb, 'Teto de gasto mensal de IA do Talk X em USD. 0 = IA desligada (padrao do item X076).'),
  ('ai_daily_requests_per_user',  '20'::jsonb, 'Limite de pedidos de IA por usuario por dia no Talk X.')
ON CONFLICT (key) DO NOTHING;
