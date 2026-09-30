-- As policies destas tabelas estão declaradas TO public, embora todas já exijam
-- auth.uid() ou is_admin_or_supervisor(auth.uid()) no qual/check. O public é
-- inócuo hoje (anon recebe 0 linhas), mas a segurança passa a depender de
-- auth.uid() ser NULL — reduzir para TO authenticated deixa a intenção explícita.
--
-- Sem efeito funcional: nenhuma das 14 tem caminho para anon. A iteração é por
-- TABELA + papel (não por nome de policy), então é replay-safe e não quebra se o
-- nome mudar. ALTER POLICY é idempotente (reapontar para authenticated de novo é
-- no-op). Sem BEGIN/COMMIT (o gateway aplica em transação).

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
$block$;
