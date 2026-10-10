-- Fix: 9 multiplix policies had roles=['public'] — must be TO authenticated
-- to enforce RLS against authenticated users only.
-- Strategy: DROP all, recreate with TO authenticated (preserving exact USING/WITH CHECK).

-- ── multiplix_dispatches ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can view all dispatches" ON public.multiplix_dispatches;
DROP POLICY IF EXISTS "Users can create dispatches" ON public.multiplix_dispatches;
DROP POLICY IF EXISTS "Users can delete own draft dispatches" ON public.multiplix_dispatches;
DROP POLICY IF EXISTS "Users can update own dispatches" ON public.multiplix_dispatches;
DROP POLICY IF EXISTS "Users can view own dispatches" ON public.multiplix_dispatches;

CREATE POLICY "Admins can view all dispatches"
  ON public.multiplix_dispatches
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Users can create dispatches"
  ON public.multiplix_dispatches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin_or_supervisor(auth.uid())
    AND created_by = (
      SELECT profiles.id FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "Users can delete own draft dispatches"
  ON public.multiplix_dispatches
  FOR DELETE
  TO authenticated
  USING (
    is_admin_or_supervisor(auth.uid())
    AND created_by = (
      SELECT profiles.id FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      LIMIT 1
    )
    AND status = 'draft'::text
  );

CREATE POLICY "Users can update own dispatches"
  ON public.multiplix_dispatches
  FOR UPDATE
  TO authenticated
  USING (
    is_admin_or_supervisor(auth.uid())
    AND created_by = (
      SELECT profiles.id FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      LIMIT 1
    )
  )
  WITH CHECK (
    is_admin_or_supervisor(auth.uid())
    AND created_by = (
      SELECT profiles.id FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "Users can view own dispatches"
  ON public.multiplix_dispatches
  FOR SELECT
  TO authenticated
  USING (
    created_by = (
      SELECT profiles.id FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      LIMIT 1
    )
  );

-- ── multiplix_recipients ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can delete recipients of own draft dispatches" ON public.multiplix_recipients;
DROP POLICY IF EXISTS "Users can insert recipients into own dispatches" ON public.multiplix_recipients;
DROP POLICY IF EXISTS "Users can update recipients of own dispatches" ON public.multiplix_recipients;
DROP POLICY IF EXISTS "Users can view recipients of accessible dispatches" ON public.multiplix_recipients;

CREATE POLICY "Users can delete recipients of own draft dispatches"
  ON public.multiplix_recipients
  FOR DELETE
  TO authenticated
  USING (
    is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND md.created_by = (
          SELECT profiles.id FROM public.profiles
          WHERE profiles.user_id = auth.uid()
          LIMIT 1
        )
        AND md.status = 'draft'::text
    )
  );

CREATE POLICY "Users can insert recipients into own dispatches"
  ON public.multiplix_recipients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND md.created_by = (
          SELECT profiles.id FROM public.profiles
          WHERE profiles.user_id = auth.uid()
          LIMIT 1
        )
    )
  );

CREATE POLICY "Users can update recipients of own dispatches"
  ON public.multiplix_recipients
  FOR UPDATE
  TO authenticated
  USING (
    is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND md.created_by = (
          SELECT profiles.id FROM public.profiles
          WHERE profiles.user_id = auth.uid()
          LIMIT 1
        )
    )
  )
  WITH CHECK (
    is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND md.created_by = (
          SELECT profiles.id FROM public.profiles
          WHERE profiles.user_id = auth.uid()
          LIMIT 1
        )
    )
  );

CREATE POLICY "Users can view recipients of accessible dispatches"
  ON public.multiplix_recipients
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND (
          md.created_by = (
            SELECT profiles.id FROM public.profiles
            WHERE profiles.user_id = auth.uid()
            LIMIT 1
          )
          OR is_admin_or_supervisor(auth.uid())
        )
    )
  );
