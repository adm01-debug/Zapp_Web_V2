REVOKE ALL ON TABLE public.multiplix_dispatches FROM anon

REVOKE ALL ON TABLE public.multiplix_recipients FROM anon

REVOKE ALL ON TABLE public.multiplix_blocks FROM anon

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.multiplix_dispatches FROM authenticated

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.multiplix_recipients FROM authenticated

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.multiplix_blocks FROM authenticated

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.multiplix_dispatches TO authenticated

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.multiplix_recipients TO authenticated

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.multiplix_blocks TO authenticated

ALTER TABLE public.multiplix_dispatches FORCE ROW LEVEL SECURITY

ALTER TABLE public.multiplix_recipients FORCE ROW LEVEL SECURITY

ALTER TABLE public.multiplix_blocks FORCE ROW LEVEL SECURITY

DROP POLICY IF EXISTS "Users can view blocks of accessible dispatches" ON public.multiplix_blocks

CREATE POLICY "Users can view blocks of accessible dispatches" ON public.multiplix_blocks
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND (
          md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
          OR public.is_admin_or_supervisor(auth.uid())
        )
    )
  )

DROP POLICY IF EXISTS "Users can insert blocks into own draft dispatches" ON public.multiplix_blocks

CREATE POLICY "Users can insert blocks into own draft dispatches" ON public.multiplix_blocks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  )

DROP POLICY IF EXISTS "Users can update blocks of own draft dispatches" ON public.multiplix_blocks

CREATE POLICY "Users can update blocks of own draft dispatches" ON public.multiplix_blocks
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  )
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  )

DROP POLICY IF EXISTS "Users can delete blocks of own draft dispatches" ON public.multiplix_blocks

CREATE POLICY "Users can delete blocks of own draft dispatches" ON public.multiplix_blocks
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  )
