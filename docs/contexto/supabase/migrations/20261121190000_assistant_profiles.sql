-- Fase 1 do assistente pessoal: identidade.
-- O sistema passa a saber quem está do outro lado: atuação, foco, como a
-- pessoa quer ser ajudada e tom de comunicação. O motor do copiloto lê este
-- perfil antes de escolher o que dizer (copilot-live).
--
-- RLS segue o padrão da auditoria 20261107133000: escopo por auth.uid(),
-- nada de USING(true).

CREATE TABLE IF NOT EXISTS public.assistant_profiles (
  user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  atividade  TEXT        NOT NULL DEFAULT 'atendimento'
             CHECK (atividade IN ('venda', 'compra', 'atendimento', 'supervisao')),
  foco       TEXT        NOT NULL DEFAULT '',
  ajuda      TEXT        NOT NULL DEFAULT 'relevante'
             CHECK (ajuda IN ('sempre', 'relevante', 'sob_demanda')),
  tom        TEXT        NOT NULL DEFAULT 'consultivo'
             CHECK (tom IN ('direto', 'consultivo', 'formal')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)

ALTER TABLE public.assistant_profiles ENABLE ROW LEVEL SECURITY

DROP POLICY IF EXISTS assistant_profiles_select ON public.assistant_profiles

DROP POLICY IF EXISTS assistant_profiles_insert ON public.assistant_profiles

DROP POLICY IF EXISTS assistant_profiles_update ON public.assistant_profiles

CREATE POLICY assistant_profiles_select
  ON public.assistant_profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid())

CREATE POLICY assistant_profiles_insert
  ON public.assistant_profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid())

CREATE POLICY assistant_profiles_update
  ON public.assistant_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())

-- updated_at mantido pela aplicação (mesma convenção do restante).
