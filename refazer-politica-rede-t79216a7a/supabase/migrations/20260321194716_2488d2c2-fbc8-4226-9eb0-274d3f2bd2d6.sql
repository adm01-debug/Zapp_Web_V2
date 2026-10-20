
-- Fix 1: Restrict profiles SELECT to own profile + admins/supervisors
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- Fix 2: Restrict channel_connections SELECT to admins/supervisors only
DROP POLICY IF EXISTS "Authenticated users can view connections" ON public.channel_connections;
DROP POLICY IF EXISTS "Users can view channel connections" ON public.channel_connections;
CREATE POLICY "Only admins can view channel connections"
  ON public.channel_connections FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- Fix 3: Enable RLS on profiles_public view if it's a table
-- profiles_public is likely a view, but ensure it has proper access
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'profiles_public' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles_public ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Authenticated can view public profiles" ON public.profiles_public FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;

-- Fix 4: Restrict sicoob_contact_mapping to admins
DROP POLICY IF EXISTS "Authenticated users can view mappings" ON public.sicoob_contact_mapping;
DROP POLICY IF EXISTS "Users can view sicoob mappings" ON public.sicoob_contact_mapping;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'sicoob_contact_mapping' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'CREATE POLICY "Only admins can view sicoob mappings" ON public.sicoob_contact_mapping FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()))';
  END IF;
END $$;
