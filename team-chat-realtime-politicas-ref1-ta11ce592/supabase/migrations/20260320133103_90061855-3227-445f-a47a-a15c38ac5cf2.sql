-- Fix sicoob_contact_mapping: replace anon ALL policy with service_role
DROP POLICY IF EXISTS "Service can manage sicoob mappings" ON public.sicoob_contact_mapping;

CREATE POLICY "Service role can manage sicoob mappings"
ON public.sicoob_contact_mapping
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Tighten audio_memes INSERT: set uploaded_by = auth.uid()
DROP POLICY IF EXISTS "Authenticated users can insert audio memes" ON public.audio_memes;
CREATE POLICY "Authenticated users can insert audio memes"
ON public.audio_memes
FOR INSERT
TO authenticated
WITH CHECK (uploaded_by = auth.uid());

-- Tighten audio_memes UPDATE: owner or admin only  
DROP POLICY IF EXISTS "Authenticated users can update audio memes" ON public.audio_memes;
CREATE POLICY "Authenticated users can update audio memes"
ON public.audio_memes
FOR UPDATE
TO authenticated
USING ((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid()))
WITH CHECK ((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid()));

-- Tighten custom_emojis INSERT: set uploaded_by = auth.uid()
DROP POLICY IF EXISTS "Authenticated users can insert custom emojis" ON public.custom_emojis;
CREATE POLICY "Authenticated users can insert custom emojis"
ON public.custom_emojis
FOR INSERT
TO authenticated
WITH CHECK (uploaded_by = auth.uid());

-- Tighten custom_emojis UPDATE: owner or admin only
DROP POLICY IF EXISTS "Authenticated users can update custom emojis" ON public.custom_emojis;
CREATE POLICY "Authenticated users can update custom emojis"
ON public.custom_emojis
FOR UPDATE
TO authenticated
USING ((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid()))
WITH CHECK ((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid()));

-- Also tighten sicoob INSERT for authenticated
DROP POLICY IF EXISTS "Authenticated users can insert sicoob mappings" ON public.sicoob_contact_mapping;
CREATE POLICY "Authenticated users can insert sicoob mappings"
ON public.sicoob_contact_mapping
FOR INSERT
TO authenticated
WITH CHECK (is_admin_or_supervisor(auth.uid()));