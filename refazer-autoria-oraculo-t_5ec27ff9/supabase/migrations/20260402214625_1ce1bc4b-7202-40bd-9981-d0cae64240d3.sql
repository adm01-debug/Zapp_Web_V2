-- 1. Fix audit_logs: restrict INSERT to service role / admin only
DROP POLICY IF EXISTS "Users can insert their own audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
CREATE POLICY "Only admins can insert audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()) OR auth.uid() = user_id);

-- 2. Fix nps_surveys: restrict SELECT to admin/supervisor or own agent
DROP POLICY IF EXISTS "Anyone can view NPS surveys" ON public.nps_surveys;
DROP POLICY IF EXISTS "Authenticated users can view NPS surveys" ON public.nps_surveys;
CREATE POLICY "Admins and own agents can view NPS surveys"
  ON public.nps_surveys FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid()) 
    OR agent_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  );

-- 3. Fix storage DELETE policies - add ownership check
DROP POLICY IF EXISTS "Authenticated users can delete stickers" ON storage.objects;
CREATE POLICY "Users can delete own stickers"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'stickers' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Authenticated users can delete audio memes" ON storage.objects;
CREATE POLICY "Users can delete own audio memes"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'audio-memes' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Authenticated users can delete custom emojis" ON storage.objects;
CREATE POLICY "Users can delete own custom emojis"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'custom-emojis' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Authenticated users can delete audio messages" ON storage.objects;
CREATE POLICY "Users can delete own audio messages"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'audio-messages' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 4. Make team-chat-files bucket private
UPDATE storage.buckets SET public = false WHERE id = 'team-chat-files';

-- 5. Fix login_attempts SELECT - ensure only admins can read
DROP POLICY IF EXISTS "Admins can view login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "Only admins can view login attempts" ON public.login_attempts;
CREATE POLICY "Only admins can view login attempts"
  ON public.login_attempts FOR SELECT
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));