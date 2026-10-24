-- Recuperacao de DDL aplicado fora do Git (item F18 do plano do Multiplix / issue #1228).
-- Versao: 20260930142000 · nome no ledger: scope_public_policies_to_authenticated
--
-- Origem: o DDL abaixo foi aplicado diretamente no banco canonico do Zapp Web V2
-- (tnnnlkbymytvtqngbbqh) e registrado em supabase_migrations.schema_migrations SEM que o
-- arquivo correspondente fosse commitado. O DB Live Guard acusa exatamente isso:
-- "Registro no banco sem arquivo no repo (DDL fora do Git)".
--
-- Reconciliacao: reconstrucao fiel a partir do proprio ledger (os statements foram copiados
-- como estao, sem edicao), conforme docs/MIGRATIONS.md §2. Nada foi reaplicado no banco:
-- a versao ja consta no ledger, por isso o hermes-db-migrar NAO deve ser executado para
-- este arquivo. Os statements abaixo sao o registro historico do que ja esta aplicado.
--
-- Autor da recuperacao: Hermes (tarefa portao-a-f18-contrato-vivo), 30/09/2026.

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
