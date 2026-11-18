ALTER TABLE public.talkx_templates
  ADD COLUMN IF NOT EXISTS custom_variables text[] NOT NULL DEFAULT '{}'

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
)

CREATE INDEX IF NOT EXISTS idx_talkx_template_versions_template_version
  ON public.talkx_template_versions (template_id, version_number DESC)

ALTER TABLE public.talkx_template_versions ENABLE ROW LEVEL SECURITY

CREATE POLICY "talkx_template_versions_select"
  ON public.talkx_template_versions FOR SELECT
  TO authenticated
  USING (true)

CREATE POLICY "talkx_template_versions_insert"
  ON public.talkx_template_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.talkx_templates tmpl
      WHERE tmpl.id = template_id
        AND (
          tmpl.created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
          OR public.is_admin_or_supervisor(auth.uid())
        )
    )
  )
