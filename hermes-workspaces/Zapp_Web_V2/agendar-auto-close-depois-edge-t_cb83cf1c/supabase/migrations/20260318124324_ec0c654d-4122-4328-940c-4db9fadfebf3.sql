-- 1. Add WITH CHECK to profiles UPDATE to prevent privilege escalation
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
  );

-- 2. Clean up duplicate sticker policies
DROP POLICY IF EXISTS "Authenticated users can delete stickers" ON public.stickers;
DROP POLICY IF EXISTS "Authenticated users can update stickers" ON public.stickers;
DROP POLICY IF EXISTS "Authenticated users can insert stickers" ON public.stickers;

-- Recreate clean sticker policies (no duplicates)
CREATE POLICY "Sticker insert with ownership" ON public.stickers
  FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid()::text OR is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Sticker update with ownership" ON public.stickers
  FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid()::text OR is_admin_or_supervisor(auth.uid()))
  WITH CHECK (uploaded_by = auth.uid()::text OR is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Sticker delete with ownership" ON public.stickers
  FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid()::text OR is_admin_or_supervisor(auth.uid()));