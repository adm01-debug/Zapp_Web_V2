-- BLOCK 12: STORAGE BUCKETS + RLS POLICIES (idempotente)

-- Buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('audio-memes', 'audio-memes', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, name = EXCLUDED.name;
INSERT INTO storage.buckets (id, name, public) VALUES ('audio-messages', 'audio-messages', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, name = EXCLUDED.name;
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, name = EXCLUDED.name;
INSERT INTO storage.buckets (id, name, public) VALUES ('custom-emojis', 'custom-emojis', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, name = EXCLUDED.name;
INSERT INTO storage.buckets (id, name, public) VALUES ('stickers', 'stickers', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, name = EXCLUDED.name;
INSERT INTO storage.buckets (id, name, public) VALUES ('team-chat-files', 'team-chat-files', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, name = EXCLUDED.name;
INSERT INTO storage.buckets (id, name, public) VALUES ('whatsapp-media', 'whatsapp-media', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, name = EXCLUDED.name;

-- Policies
DROP POLICY IF EXISTS "Admins can delete team chat files" ON storage.objects;
CREATE POLICY "Admins can delete team chat files" ON storage.objects FOR DELETE TO authenticated
  USING (((bucket_id = 'team-chat-files'::text) AND is_admin_or_supervisor(auth.uid())));

DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
CREATE POLICY "Anyone can view avatars" ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'avatars'::text));

DROP POLICY IF EXISTS "Anyone can view stickers" ON storage.objects;
CREATE POLICY "Anyone can view stickers" ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'stickers'::text));

DROP POLICY IF EXISTS "Auth upload audio memes owned" ON storage.objects;
CREATE POLICY "Auth upload audio memes owned" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'audio-memes'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::text))));

DROP POLICY IF EXISTS "Auth upload custom emojis owned" ON storage.objects;
CREATE POLICY "Auth upload custom emojis owned" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'custom-emojis'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::text))));

DROP POLICY IF EXISTS "Auth upload stickers owned" ON storage.objects;
CREATE POLICY "Auth upload stickers owned" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'stickers'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::text))));

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'avatars'::text));

DROP POLICY IF EXISTS "Public read audio memes" ON storage.objects;
CREATE POLICY "Public read audio memes" ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'audio-memes'::text));

DROP POLICY IF EXISTS "Public read for custom emojis" ON storage.objects;
CREATE POLICY "Public read for custom emojis" ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'custom-emojis'::text));

DROP POLICY IF EXISTS "Team chat files readable by owner admin or conversation member" ON storage.objects;
CREATE POLICY "Team chat files readable by owner admin or conversation member" ON storage.objects FOR SELECT TO authenticated
  USING (((bucket_id = 'team-chat-files'::text) AND (((auth.uid())::text = (storage.foldername(name))[1]) OR is_admin_or_supervisor(auth.uid()) OR (EXISTS (
    SELECT 1 FROM (((team_conversation_members tcm1
      JOIN profiles p1 ON (((p1.id = tcm1.profile_id) AND (p1.user_id = auth.uid()))))
      JOIN team_conversation_members tcm2 ON ((tcm2.conversation_id = tcm1.conversation_id)))
      JOIN profiles p2 ON (((p2.id = tcm2.profile_id) AND ((p2.user_id)::text = (storage.foldername(objects.name))[1])))))))));

DROP POLICY IF EXISTS "Users can delete own audio memes" ON storage.objects;
CREATE POLICY "Users can delete own audio memes" ON storage.objects FOR DELETE TO authenticated
  USING (((bucket_id = 'audio-memes'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

DROP POLICY IF EXISTS "Users can delete own audio messages" ON storage.objects;
CREATE POLICY "Users can delete own audio messages" ON storage.objects FOR DELETE TO authenticated
  USING (((bucket_id = 'audio-messages'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

DROP POLICY IF EXISTS "Users can delete own custom emojis" ON storage.objects;
CREATE POLICY "Users can delete own custom emojis" ON storage.objects FOR DELETE TO authenticated
  USING (((bucket_id = 'custom-emojis'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

DROP POLICY IF EXISTS "Users can delete own stickers" ON storage.objects;
CREATE POLICY "Users can delete own stickers" ON storage.objects FOR DELETE TO authenticated
  USING (((bucket_id = 'stickers'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

DROP POLICY IF EXISTS "Users can delete own team chat files" ON storage.objects;
CREATE POLICY "Users can delete own team chat files" ON storage.objects FOR DELETE TO authenticated
  USING (((bucket_id = 'team-chat-files'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;
CREATE POLICY "Users can delete their own avatars" ON storage.objects FOR DELETE TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

DROP POLICY IF EXISTS "Users can delete their own or assigned media" ON storage.objects;
CREATE POLICY "Users can delete their own or assigned media" ON storage.objects FOR DELETE TO authenticated
  USING (((bucket_id = 'whatsapp-media'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN (
    SELECT (c.id)::text AS id FROM contacts c
    WHERE (c.assigned_to IN (SELECT p.id FROM profiles p WHERE (p.user_id = auth.uid())))
  )) OR ((storage.foldername(name))[1] = (auth.uid())::text))));

DROP POLICY IF EXISTS "Users can read assigned audio messages" ON storage.objects;
CREATE POLICY "Users can read assigned audio messages" ON storage.objects FOR SELECT TO authenticated
  USING (((bucket_id = 'audio-messages'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN (
    SELECT (c.id)::text AS id FROM contacts c
    WHERE (c.assigned_to IN (SELECT p.id FROM profiles p WHERE (p.user_id = auth.uid())))
  )))));

DROP POLICY IF EXISTS "Users can read assigned whatsapp media" ON storage.objects;
CREATE POLICY "Users can read assigned whatsapp media" ON storage.objects FOR SELECT TO authenticated
  USING (((bucket_id = 'whatsapp-media'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN (
    SELECT (c.id)::text AS id FROM contacts c
    WHERE (c.assigned_to IN (SELECT p.id FROM profiles p WHERE (p.user_id = auth.uid())))
  )) OR ((storage.foldername(name))[1] = (auth.uid())::text))));

DROP POLICY IF EXISTS "Users can update own audio memes" ON storage.objects;
CREATE POLICY "Users can update own audio memes" ON storage.objects FOR UPDATE TO authenticated
  USING (((bucket_id = 'audio-memes'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::text))));

DROP POLICY IF EXISTS "Users can update own audio messages" ON storage.objects;
CREATE POLICY "Users can update own audio messages" ON storage.objects FOR UPDATE TO authenticated
  USING (((bucket_id = 'audio-messages'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN (
    SELECT (c.id)::text AS id FROM contacts c
    WHERE (c.assigned_to IN (SELECT p.id FROM profiles p WHERE (p.user_id = auth.uid())))
  )))));

DROP POLICY IF EXISTS "Users can update own custom emojis" ON storage.objects;
CREATE POLICY "Users can update own custom emojis" ON storage.objects FOR UPDATE TO authenticated
  USING (((bucket_id = 'custom-emojis'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::text))));

DROP POLICY IF EXISTS "Users can update own stickers" ON storage.objects;
CREATE POLICY "Users can update own stickers" ON storage.objects FOR UPDATE TO authenticated
  USING (((bucket_id = 'stickers'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::text))));

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

DROP POLICY IF EXISTS "Users can upload assigned audio messages" ON storage.objects;
CREATE POLICY "Users can upload assigned audio messages" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'audio-messages'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN (
    SELECT (c.id)::text AS id FROM contacts c
    WHERE (c.assigned_to IN (SELECT p.id FROM profiles p WHERE (p.user_id = auth.uid())))
  )) OR ((storage.foldername(name))[1] = (auth.uid())::text))));

DROP POLICY IF EXISTS "Users can upload assigned whatsapp media" ON storage.objects;
CREATE POLICY "Users can upload assigned whatsapp media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'whatsapp-media'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN (
    SELECT (c.id)::text AS id FROM contacts c
    WHERE (c.assigned_to IN (SELECT p.id FROM profiles p WHERE (p.user_id = auth.uid())))
  )) OR ((storage.foldername(name))[1] = (auth.uid())::text))));

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

DROP POLICY IF EXISTS "Users can upload to own folder in team-chat-files" ON storage.objects;
CREATE POLICY "Users can upload to own folder in team-chat-files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'team-chat-files'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));