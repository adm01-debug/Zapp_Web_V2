
-- FIX 3: profiles - Replace permissive SELECT with scoped policies
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Team members can view basic profiles" ON public.profiles;

CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admin supervisor can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (is_admin_or_supervisor(auth.uid()));

-- Agents need to see teammate names for assignment UI
-- Use security definer function to avoid recursion
CREATE OR REPLACE FUNCTION public.get_profile_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$$;

CREATE POLICY "Agents can view active team members"
ON public.profiles FOR SELECT TO authenticated
USING (is_active = true);

-- FIX 4: Recreate view as SECURITY INVOKER (safe)
DROP VIEW IF EXISTS public.whatsapp_connections_public;
CREATE VIEW public.whatsapp_connections_public
WITH (security_invoker = true) AS
SELECT id, name, phone_number, status, is_default
FROM public.whatsapp_connections;

-- FIX 5: Storage DELETE policies - Add ownership check
-- whatsapp-media: restrict to admin or file owner
DROP POLICY IF EXISTS "Users can delete their own media" ON storage.objects;
CREATE POLICY "Users can delete their own media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- stickers: restrict to admin or uploader
DROP POLICY IF EXISTS "Authenticated users can delete stickers" ON storage.objects;
CREATE POLICY "Users can delete own stickers"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'stickers'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- audio-memes: restrict to admin or uploader
DROP POLICY IF EXISTS "Auth delete own audio memes" ON storage.objects;
CREATE POLICY "Users can delete own audio memes"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'audio-memes'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- custom-emojis: restrict to admin or uploader
DROP POLICY IF EXISTS "Auth delete custom emojis" ON storage.objects;
CREATE POLICY "Users can delete own custom emojis"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'custom-emojis'
  AND (
    is_admin_or_supervisor(auth.uid())
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);
