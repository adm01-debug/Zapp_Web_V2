DROP POLICY IF EXISTS "Admins can view all dispatches" ON public.multiplix_dispatches

CREATE POLICY "Admins can view all dispatches" ON public.multiplix_dispatches
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))

DROP POLICY IF EXISTS "Users can view own dispatches" ON public.multiplix_dispatches

CREATE POLICY "Users can view own dispatches" ON public.multiplix_dispatches
  FOR SELECT
  TO authenticated
  USING (
    created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  )

DROP POLICY IF EXISTS "Users can create dispatches" ON public.multiplix_dispatches

CREATE POLICY "Users can create dispatches" ON public.multiplix_dispatches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  )

DROP POLICY IF EXISTS "Users can update own dispatches" ON public.multiplix_dispatches

CREATE POLICY "Users can update own dispatches" ON public.multiplix_dispatches
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  )
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  )

DROP POLICY IF EXISTS "Users can delete own draft dispatches" ON public.multiplix_dispatches

CREATE POLICY "Users can delete own draft dispatches" ON public.multiplix_dispatches
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    AND status = 'draft'
  )

DROP POLICY IF EXISTS "Users can view recipients of accessible dispatches" ON public.multiplix_recipients

CREATE POLICY "Users can view recipients of accessible dispatches" ON public.multiplix_recipients
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND (
          md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
          OR public.is_admin_or_supervisor(auth.uid())
        )
    )
  )

DROP POLICY IF EXISTS "Users can insert recipients into own dispatches" ON public.multiplix_recipients

CREATE POLICY "Users can insert recipients into own dispatches" ON public.multiplix_recipients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  )

DROP POLICY IF EXISTS "Users can update recipients of own dispatches" ON public.multiplix_recipients

CREATE POLICY "Users can update recipients of own dispatches" ON public.multiplix_recipients
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    )
  )
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    )
  )

DROP POLICY IF EXISTS "Users can delete recipients of own draft dispatches" ON public.multiplix_recipients

CREATE POLICY "Users can delete recipients of own draft dispatches" ON public.multiplix_recipients
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  )
