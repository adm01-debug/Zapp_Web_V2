
-- Fix profiles_public view: it's a VIEW not a table, RLS doesn't apply to views
-- The view already has security_invoker = true, so the underlying profiles RLS applies
-- This is safe - no action needed for the view itself

-- Fix warroom_alerts conflicting policies
DROP POLICY IF EXISTS "Authenticated can view alerts" ON public.warroom_alerts;
