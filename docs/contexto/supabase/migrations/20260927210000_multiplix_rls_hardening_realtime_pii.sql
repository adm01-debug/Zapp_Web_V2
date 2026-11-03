DROP POLICY IF EXISTS "Users can create dispatches" ON public.multiplix_dispatches

CREATE POLICY "Users can create dispatches" ON public.multiplix_dispatches
  FOR INSERT WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  )

DROP POLICY IF EXISTS "Users can update own dispatches" ON public.multiplix_dispatches

CREATE POLICY "Users can update own dispatches" ON public.multiplix_dispatches
  FOR UPDATE USING (
    public.is_admin_or_supervisor(auth.uid())
    AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  )
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  )

DROP POLICY IF EXISTS "Users can delete own draft dispatches" ON public.multiplix_dispatches

CREATE POLICY "Users can delete own draft dispatches" ON public.multiplix_dispatches
  FOR DELETE USING (
    public.is_admin_or_supervisor(auth.uid())
    AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    AND status = 'draft'
  )

DROP POLICY IF EXISTS "Users can insert recipients into own dispatches" ON public.multiplix_recipients

CREATE POLICY "Users can insert recipients into own dispatches" ON public.multiplix_recipients
  FOR INSERT WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    )
  )

DROP POLICY IF EXISTS "Users can update recipients of own dispatches" ON public.multiplix_recipients

CREATE POLICY "Users can update recipients of own dispatches" ON public.multiplix_recipients
  FOR UPDATE USING (
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
  FOR DELETE USING (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  )

ALTER PUBLICATION supabase_realtime DROP TABLE public.multiplix_recipients

ALTER PUBLICATION supabase_realtime ADD TABLE public.multiplix_recipients (
  id, dispatch_id, company_id, company_name_snapshot, destino_origem,
  status, sent_at, delivered_at, error_message,
  delivery_claimed_at, delivery_claim_expires_at, delivery_claimed_by, delivery_attempt_count,
  created_at, updated_at, attempt_count, retry_after, provider_dispatch_started_at, external_id
)
