-- CV-121 a CV-150: 7 tabelas de suporte para as fases 13-15 do copiloto RADAR
--
-- Fase 13 (CV-121-130): supervisor — copilot_help_requests, copilot_learning_moments, copilot_conversation_scores
-- Fase 14 (CV-131-140): aprendizado — copilot_outcomes, copilot_objection_catalog
-- Fase 15 (CV-141-150): métricas — copilot_usage, copilot_seller_settings
--
-- Rollback:
--   DROP TABLE IF EXISTS public.copilot_outcomes;
--   DROP TABLE IF EXISTS public.copilot_objection_catalog;
--   DROP TABLE IF EXISTS public.copilot_usage;
--   DROP TABLE IF EXISTS public.copilot_seller_settings;
--   DROP TABLE IF EXISTS public.copilot_help_requests;
--   DROP TABLE IF EXISTS public.copilot_learning_moments;
--   DROP TABLE IF EXISTS public.copilot_conversation_scores;

-- Fase 14: resultado de venda
CREATE TABLE IF NOT EXISTS public.copilot_outcomes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID        NOT NULL,
  contact_id       UUID        NOT NULL,
  seller_id        UUID        NOT NULL,
  outcome          TEXT        NOT NULL CHECK (outcome IN ('closed', 'lost')),
  deal_value       NUMERIC,
  segment          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.copilot_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "copilot_outcomes_insert"
  ON public.copilot_outcomes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "copilot_outcomes_select"
  ON public.copilot_outcomes FOR SELECT TO authenticated USING (true);

-- Fase 14: catálogo de objeções enviadas pelo vendedor
CREATE TABLE IF NOT EXISTS public.copilot_objection_catalog (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID        NOT NULL,
  objection_type   TEXT        NOT NULL,
  treatment_text   TEXT        NOT NULL,
  submitted_by     UUID        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending_review',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.copilot_objection_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "copilot_objection_catalog_insert"
  ON public.copilot_objection_catalog FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "copilot_objection_catalog_select"
  ON public.copilot_objection_catalog FOR SELECT TO authenticated USING (true);

-- Fase 15: log de uso de tokens por chamada ao copiloto
CREATE TABLE IF NOT EXISTS public.copilot_usage (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID        NOT NULL,
  seller_id           UUID        NOT NULL,
  tokens              INTEGER     NOT NULL,
  estimated_cost_usd  NUMERIC     NOT NULL,
  endpoint            TEXT        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.copilot_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "copilot_usage_insert"
  ON public.copilot_usage FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "copilot_usage_select"
  ON public.copilot_usage FOR SELECT TO authenticated USING (true);

-- Fase 15: preferências do vendedor (opt-in/out do copiloto)
CREATE TABLE IF NOT EXISTS public.copilot_seller_settings (
  seller_id   UUID        PRIMARY KEY,
  opted_in    BOOLEAN     NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.copilot_seller_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "copilot_seller_settings_insert"
  ON public.copilot_seller_settings FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "copilot_seller_settings_select"
  ON public.copilot_seller_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "copilot_seller_settings_update"
  ON public.copilot_seller_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Fase 13: pedidos de ajuda ao supervisor
CREATE TABLE IF NOT EXISTS public.copilot_help_requests (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID        NOT NULL,
  contact_id       UUID        NOT NULL,
  seller_id        UUID        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.copilot_help_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "copilot_help_requests_insert"
  ON public.copilot_help_requests FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "copilot_help_requests_select"
  ON public.copilot_help_requests FOR SELECT TO authenticated USING (true);

-- Fase 13: momentos de aprendizado marcados pelo supervisor
CREATE TABLE IF NOT EXISTS public.copilot_learning_moments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID        NOT NULL,
  message_id       TEXT        NOT NULL,
  tag              TEXT        NOT NULL CHECK (tag IN ('exemplar', 'anti_pattern', 'objection_win', 'closing_technique')),
  notes            TEXT,
  tagged_by        UUID        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.copilot_learning_moments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "copilot_learning_moments_insert"
  ON public.copilot_learning_moments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "copilot_learning_moments_select"
  ON public.copilot_learning_moments FOR SELECT TO authenticated USING (true);

-- Fase 13: pontuação de conversa pelo supervisor (1-5)
CREATE TABLE IF NOT EXISTS public.copilot_conversation_scores (
  conversation_id  UUID        PRIMARY KEY,
  score            INTEGER     NOT NULL CHECK (score BETWEEN 1 AND 5),
  scored_by        UUID        NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.copilot_conversation_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "copilot_conversation_scores_insert"
  ON public.copilot_conversation_scores FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "copilot_conversation_scores_select"
  ON public.copilot_conversation_scores FOR SELECT TO authenticated USING (true);

CREATE POLICY "copilot_conversation_scores_update"
  ON public.copilot_conversation_scores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
