DROP POLICY IF EXISTS "Users can create dispatches" ON public.multiplix_dispatches

DROP POLICY IF EXISTS "Users can update own dispatches" ON public.multiplix_dispatches

REVOKE INSERT, UPDATE ON TABLE public.multiplix_dispatches FROM authenticated
