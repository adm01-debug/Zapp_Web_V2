DO $block$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename, pol.polname AS policyname
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'conversation_snoozes',
        'favorite_contacts',
        'login_attempts',
        'pinned_conversations',
        'talkx_templates'
      )
      AND pol.polroles = ARRAY[0::oid]
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', r.policyname, r.tablename);
  END LOOP;
END;
$block$
