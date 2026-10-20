-- Migration: E49 — Variações A/B de templates

-- 1. Tabela de variantes
CREATE TABLE IF NOT EXISTS public.talkx_template_variants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   uuid NOT NULL REFERENCES public.talkx_templates(id) ON DELETE CASCADE,
  label         text NOT NULL CHECK (label IN ('A', 'B', 'C')),
  content       text NOT NULL,
  media_url     text,
  media_type    text,
  weight        integer NOT NULL DEFAULT 50 CHECK (weight > 0 AND weight <= 100),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, label)
);

-- 2. Coluna variant_id nos recipients (rastrear qual variante cada destinatário recebeu)
ALTER TABLE public.talkx_recipients
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.talkx_template_variants(id) ON DELETE SET NULL;

-- 3. Índice
CREATE INDEX IF NOT EXISTS idx_talkx_template_variants_template
  ON public.talkx_template_variants (template_id);

-- 4. RLS
ALTER TABLE public.talkx_template_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "talkx_template_variants_select"
  ON public.talkx_template_variants FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "talkx_template_variants_write"
  ON public.talkx_template_variants FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.talkx_templates tmpl
      JOIN public.profiles prof ON prof.id = auth.uid()
      WHERE tmpl.id = template_id
        AND (tmpl.created_by = auth.uid() OR prof.role IN ('admin', 'supervisor'))
    )
  );
