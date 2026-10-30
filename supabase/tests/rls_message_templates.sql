-- Paridade V3 -> V2 (doc 06) — RLS de public.message_templates.
--
-- ESCOPO E LIMITAÇÃO (ler antes de confiar): rodando pela wrapper `db_query`/`mcp_exec`
-- a sessão é service_role (BYPASSRLS), então SELECTs aqui NÃO passam pelo enforcement
-- real das policies. O que este arquivo prova é ESTRUTURA da definição viva (pg_class /
-- pg_policies): que a tabela continua com RLS ligado e que as 4 policies continuam
-- exigindo o dono (user_id = auth.uid()) — com o SELECT liberando também o global
-- (is_global = true). Isso trava a regressão que mais importa: um "gap" que deixasse a
-- policy de escrita sem o filtro do dono (vazamento entre usuários).
--
-- O ENFORCEMENT com papel real (authenticated recusando ler template alheio) é o item
-- PK-15 / scripts/db-audit (worker sql) — não coberto aqui.
--
-- Sem EXCEPTION = verde. Read-only, sem side effects.

DO $$
DECLARE
  v_n    int;
  v_qual text;
  v_chk  text;
BEGIN
  -- T0: tabela existe e continua com RLS ligado
  IF NOT EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'message_templates' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'rls_message_templates T0 FALHOU: tabela ausente ou RLS desligado';
  END IF;

  -- T1: exatamente as 4 policies conhecidas, todas para o papel authenticated
  SELECT count(*) INTO v_n
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'message_templates';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'rls_message_templates T1 FALHOU: esperava 4 policies, achei %', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'message_templates'
     AND 'authenticated' = ANY (roles);
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'rls_message_templates T1 FALHOU: % policy(s) sem TO authenticated', 4 - v_n;
  END IF;

  -- T2: SELECT = dono OU global (não pode ter virado "true" nem perdido o dono)
  SELECT qual INTO v_qual
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'message_templates'
     AND policyname = 'Users can view their templates and global ones';
  IF v_qual IS NULL
     OR position('user_id = auth.uid()' IN v_qual) = 0
     OR position('is_global = true' IN v_qual) = 0 THEN
    RAISE EXCEPTION 'rls_message_templates T2 FALHOU: SELECT não exige (dono OU global): %', v_qual;
  END IF;

  -- T3: INSERT com WITH CHECK do dono
  SELECT with_check INTO v_chk
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'message_templates'
     AND policyname = 'Users can create their own templates';
  IF v_chk IS NULL OR position('user_id = auth.uid()' IN v_chk) = 0 THEN
    RAISE EXCEPTION 'rls_message_templates T3 FALHOU: INSERT sem WITH CHECK do dono: %', v_chk;
  END IF;

  -- T4: UPDATE e DELETE com USING do dono
  SELECT qual INTO v_qual
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'message_templates'
     AND policyname = 'Users can update their own templates';
  IF v_qual IS NULL OR position('user_id = auth.uid()' IN v_qual) = 0 THEN
    RAISE EXCEPTION 'rls_message_templates T4 FALHOU: UPDATE sem USING do dono: %', v_qual;
  END IF;

  SELECT qual INTO v_qual
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'message_templates'
     AND policyname = 'Users can delete their own templates';
  IF v_qual IS NULL OR position('user_id = auth.uid()' IN v_qual) = 0 THEN
    RAISE EXCEPTION 'rls_message_templates T4 FALHOU: DELETE sem USING do dono: %', v_qual;
  END IF;

  RAISE NOTICE 'rls_message_templates: 4 policies ok (SELECT dono/global; escrita so o dono)';
END $$;
