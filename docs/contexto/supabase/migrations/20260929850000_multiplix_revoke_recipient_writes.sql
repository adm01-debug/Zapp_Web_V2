DROP POLICY IF EXISTS "Users can insert recipients into own dispatches" ON public.multiplix_recipients

DROP POLICY IF EXISTS "Users can update recipients of own dispatches" ON public.multiplix_recipients

REVOKE INSERT, UPDATE ON TABLE public.multiplix_recipients FROM authenticated

GRANT DELETE ON TABLE public.multiplix_recipients TO authenticated
