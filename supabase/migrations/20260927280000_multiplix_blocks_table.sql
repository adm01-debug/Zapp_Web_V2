-- 20260927280000_multiplix_blocks_table
-- Tabela de blocos de conteudo para dispatches Multiplix multi-bloco.
-- Cada dispatch pode ter N blocos (texto, voz, imagem, arquivo) ordenados
-- por block_order; o motor de envio usa message_template do dispatch quando
-- nao ha blocos (compatibilidade retroativa total).

CREATE TABLE public.multiplix_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.multiplix_dispatches(id) ON DELETE CASCADE,
  block_order smallint NOT NULL DEFAULT 0,
  block_type text NOT NULL CHECK (block_type IN ('text', 'voice', 'image', 'file')),
  template_text text,
  voice_script text,
  voice_id text,
  media_url text,
  media_caption text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multiplix_blocks_dispatch_order UNIQUE (dispatch_id, block_order)
);

CREATE INDEX idx_multiplix_blocks_dispatch_id ON public.multiplix_blocks(dispatch_id);

CREATE TRIGGER update_multiplix_blocks_updated_at
  BEFORE UPDATE ON public.multiplix_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.multiplix_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view blocks of accessible dispatches" ON public.multiplix_blocks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND (
          md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
          OR public.is_admin_or_supervisor(auth.uid())
        )
    )
  );

CREATE POLICY "Users can insert blocks into own draft dispatches" ON public.multiplix_blocks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  );

CREATE POLICY "Users can update blocks of own draft dispatches" ON public.multiplix_blocks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  );

CREATE POLICY "Users can delete blocks of own draft dispatches" ON public.multiplix_blocks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  );
