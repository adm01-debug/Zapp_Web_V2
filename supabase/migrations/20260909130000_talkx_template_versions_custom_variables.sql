-- Migration: talkx_template_versions + custom_variables em talkx_templates
-- Gerado em 2026-09-09

-- 1. custom_variables no talkx_templates
ALTER TABLE public.talkx_templates
  ADD COLUMN IF NOT EXISTS custom_variables text[] NOT NULL DEFAULT '{}';

-- 2. Tabela de historico de versoes
CREATE TABLE IF NOT EXISTS public.talkx_template_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   uuid NOT NULL REFERENCES public.talkx_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  name          text NOT NULL,
  content       text NOT NULL,
  category      text NOT NULL DEFAULT 'geral',
  status        text NOT NULL DEFAULT 'approved',
  media_url     text,
  media_type    text,
  tags          text[] NOT NULL DEFAULT '{}',
  custom_variables text[] NOT NULL DEFAULT '{}',
  saved_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT version_positive CHECK (version_number > 0)
);

-- 3. Indice composto para busca por template + ordem
CREATE INDEX IF NOT EXISTS idx_talkx_template_versions_template_version
  ON public.talkx_template_versions (template_id, version_number DESC);

-- 4. RLS
ALTER TABLE public.talkx_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "talkx_template_versions_select"
  ON public.talkx_template_versions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "talkx_template_versions_insert"
  ON public.talkx_template_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.talkx_templates tmpl
      JOIN public.profiles prof ON prof.id = auth.uid()
      WHERE tmpl.id = template_id
        AND (tmpl.created_by = auth.uid() OR prof.role IN ('admin', 'supervisor'))
    )
  );
