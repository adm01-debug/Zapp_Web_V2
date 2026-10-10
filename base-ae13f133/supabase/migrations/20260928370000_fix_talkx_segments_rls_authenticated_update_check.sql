-- Fix talkx_segments RLS:
-- 1. All 4 policies were granted to "public" (unauthenticated role) — changed to "authenticated"
-- 2. UPDATE policy had no WITH CHECK — ownership escalation: attacker could change created_by to any value

DROP POLICY IF EXISTS talkx_segments_select ON public.talkx_segments;
DROP POLICY IF EXISTS talkx_segments_insert ON public.talkx_segments;
DROP POLICY IF EXISTS talkx_segments_update ON public.talkx_segments;
DROP POLICY IF EXISTS talkx_segments_delete ON public.talkx_segments;

CREATE POLICY talkx_segments_select ON public.talkx_segments
  FOR SELECT TO authenticated
  USING (
    (created_by = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1))
    OR is_admin_or_supervisor(auth.uid())
  );

CREATE POLICY talkx_segments_insert ON public.talkx_segments
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY talkx_segments_update ON public.talkx_segments
  FOR UPDATE TO authenticated
  USING (
    (created_by = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1))
    OR is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    (created_by = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1))
    OR is_admin_or_supervisor(auth.uid())
  );

CREATE POLICY talkx_segments_delete ON public.talkx_segments
  FOR DELETE TO authenticated
  USING (
    (created_by = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1))
    OR is_admin_or_supervisor(auth.uid())
  );
