-- Teste SQL das permissões de escopo da inbox e da auditoria da tentativa indevida.
-- Cartão t_7b157a81 (V3 chat UI / paridade de escopo Meus-Departamento-Todos).
--
-- O que prova (o contrato que a tela V3 passa a consumir):
--   T1  o catálogo ganha as DUAS permissões nomeadas, na categoria `inbox`;
--   T2  admin e supervisor recebem os dois escopos; o agente comum NÃO recebe nenhum;
--   T3  a função de auditoria só é executável por `authenticated` (anon, service_role e
--       PUBLIC ficam sem EXECUTE — conferido no ACL real da função, não no texto);
--   T4  um `authenticated` grava 1 linha de auditoria com o escopo pedido e o autor (user_id);
--   T5  chamada repetida do MESMO escopo na MESMA hora deduplica (1 linha, chave usuario:escopo:hora);
--   T6  escopo diferente gera nova linha (o dedupe é por escopo);
--   T7  entrada inválida (NULL / texto longo) não quebra o chamador: vira `unknown` e deduplica;
--   T8  `anon` é barrado pela permissão (insufficient_privilege) e nada é gravado;
--   T9  `authenticated` sem claim de identidade (auth.uid() nulo) não grava e não levanta erro;
--   T10 `authenticated` NÃO consegue gravar direto em audit_logs (RLS/política nega);
--   T11 o `-- Rollback:` do cabeçalho da migration EXECUTA: remove atribuições, permissões e a função.
--
-- COMO RODAR (banco LOCAL da tarefa, que já tem todas as migrations aplicadas; nunca produção):
--   zapp-db-local psql . <conjunto> -v ON_ERROR_STOP=1 < supabase/tests/inbox_scope_permissions.sql
--
-- Cria dados SINTÉTICOS e desfaz TUDO no ROLLBACK final (inclusive o DROP/DELETE de T11, que são
-- transacionais): não sobra linha nem objeto alterado. Sem EXCEPTION = suíte verde.
BEGIN;

DO $inbox_scope_perm$
DECLARE
  v_user     uuid := '77777777-7777-7777-7777-777777777701';
  v_uid      uuid;
  v_perms    int;
  v_agent    int;
  v_rows     int;
  v_scope    text;
  v_acl      text;
  v_barrado  boolean;
  v_erro     boolean;
BEGIN
  -- ---------------------------------------------------------------- fixtures
  INSERT INTO auth.users (id, email) VALUES (v_user, 'inbox-scope@local.test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (user_id, name) VALUES (v_user, 'Agente escopo (sintetico)')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;

  -- ---------------------------------------------------------------- T1 catálogo
  SELECT count(*) INTO v_perms FROM public.permissions
   WHERE name IN ('inbox.view_department','inbox.view_all') AND category = 'inbox';
  IF v_perms <> 2 THEN
    RAISE EXCEPTION 'T1 FALHOU: esperava 2 permissoes na categoria inbox e achei %', v_perms;
  END IF;

  -- ---------------------------------------------------------------- T2 atribuição
  SELECT count(*) INTO v_perms
    FROM public.role_permissions rp
    JOIN public.permissions p ON p.id = rp.permission_id
   WHERE rp.role IN ('admin'::public.app_role, 'supervisor'::public.app_role)
     AND p.name IN ('inbox.view_department','inbox.view_all');
  IF v_perms <> 4 THEN
    RAISE EXCEPTION 'T2 FALHOU: esperava 4 atribuicoes (admin+supervisor x 2) e achei %', v_perms;
  END IF;
  SELECT count(*) INTO v_agent
    FROM public.role_permissions rp
    JOIN public.permissions p ON p.id = rp.permission_id
   WHERE rp.role = 'agent'::public.app_role
     AND p.name IN ('inbox.view_department','inbox.view_all');
  IF v_agent <> 0 THEN
    RAISE EXCEPTION 'T2 FALHOU: agente comum recebeu escopo (%)', v_agent;
  END IF;

  -- ---------------------------------------------------------------- T3 ACL da função
  IF has_function_privilege('authenticated', 'public.log_unauthorized_inbox_scope(text)', 'EXECUTE') = false THEN
    RAISE EXCEPTION 'T3 FALHOU: authenticated SEM EXECUTE na funcao';
  END IF;
  IF has_function_privilege('anon', 'public.log_unauthorized_inbox_scope(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T3 FALHOU: anon com EXECUTE na funcao';
  END IF;
  IF has_function_privilege('service_role', 'public.log_unauthorized_inbox_scope(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T3 FALHOU: service_role com EXECUTE na funcao';
  END IF;
  -- PUBLIC: no ACL do Postgres o EXECUTE a PUBLIC aparece como o item `=X/<owner>` (sem grantee
  -- antes do `=`, no comeco ou apos uma virgula); o `postgres=X/postgres` do dono nao conta.
  SELECT coalesce(p.proacl::text, '') INTO v_acl
    FROM pg_proc p WHERE p.oid = 'public.log_unauthorized_inbox_scope(text)'::regprocedure;
  IF v_acl ~ '(^|,)=X/' THEN
    RAISE EXCEPTION 'T3 FALHOU: PUBLIC ainda tem EXECUTE na funcao (acl=%)', v_acl;
  END IF;

  -- ---------------------------------------------------------------- T4 grava 1 linha
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.log_unauthorized_inbox_scope('all');
  PERFORM set_config('role', 'none', true);

  SELECT count(*) INTO v_rows FROM public.audit_logs
   WHERE action = 'unauthorized_inbox_scope_access' AND user_id = v_user;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'T4 FALHOU: esperava 1 linha de auditoria e achei %', v_rows;
  END IF;
  SELECT details->>'scope' INTO v_scope FROM public.audit_logs
   WHERE action = 'unauthorized_inbox_scope_access' AND user_id = v_user;
  IF v_scope <> 'all' THEN
    RAISE EXCEPTION 'T4 FALHOU: escopo gravado errado (%)', v_scope;
  END IF;

  -- ---------------------------------------------------------------- T5 dedupe mesmo escopo/hora
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.log_unauthorized_inbox_scope('all');
  PERFORM set_config('role', 'none', true);
  SELECT count(*) INTO v_rows FROM public.audit_logs
   WHERE action = 'unauthorized_inbox_scope_access' AND user_id = v_user;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'T5 FALHOU: dedupe nao segurou (esperava 1, achei %)', v_rows;
  END IF;

  -- ---------------------------------------------------------------- T6 escopo diferente
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.log_unauthorized_inbox_scope('department');
  PERFORM set_config('role', 'none', true);
  SELECT count(*) INTO v_rows FROM public.audit_logs
   WHERE action = 'unauthorized_inbox_scope_access' AND user_id = v_user;
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'T6 FALHOU: escopo diferente nao gerou nova linha (esperava 2, achei %)', v_rows;
  END IF;

  -- ---------------------------------------------------------------- T7 entrada inválida
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.log_unauthorized_inbox_scope(NULL);
  PERFORM public.log_unauthorized_inbox_scope(repeat('x', 200));  -- mesmo 'unknown' -> deduplica
  PERFORM set_config('role', 'none', true);
  SELECT count(*) INTO v_rows FROM public.audit_logs
   WHERE action = 'unauthorized_inbox_scope_access' AND user_id = v_user AND details->>'scope' = 'unknown';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'T7 FALHOU: entrada invalida deveria virar 1 linha unknown e veio %', v_rows;
  END IF;

  -- ---------------------------------------------------------------- T8 anon barrado
  PERFORM set_config('role', 'anon', true);
  v_barrado := false;
  BEGIN
    PERFORM public.log_unauthorized_inbox_scope('all');
  EXCEPTION WHEN insufficient_privilege THEN
    v_barrado := true;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_barrado = false THEN
    RAISE EXCEPTION 'T8 FALHOU: anon conseguiu chamar a funcao';
  END IF;
  SELECT count(*) INTO v_rows FROM public.audit_logs
   WHERE action = 'unauthorized_inbox_scope_access' AND user_id = v_user;
  IF v_rows <> 3 THEN
    RAISE EXCEPTION 'T8 FALHOU: anon gravou algo (esperava 3 linhas, achei %)', v_rows;
  END IF;

  -- ---------------------------------------------------------------- T9 authenticated sem identidade
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM set_config('role', 'authenticated', true);
  v_erro := false;
  BEGIN
    PERFORM public.log_unauthorized_inbox_scope('all');
  EXCEPTION WHEN OTHERS THEN
    v_erro := true;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_erro THEN
    RAISE EXCEPTION 'T9 FALHOU: uid nulo levantou erro em vez de nao gravar';
  END IF;
  SELECT count(*) INTO v_rows FROM public.audit_logs
   WHERE action = 'unauthorized_inbox_scope_access' AND user_id = v_user;
  IF v_rows <> 3 THEN
    RAISE EXCEPTION 'T9 FALHOU: uid nulo gravou (esperava 3, achei %)', v_rows;
  END IF;

  -- ---------------------------------------------------------------- T10 escrita direta barrada
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_barrado := false;
  BEGIN
    INSERT INTO public.audit_logs (user_id, action) VALUES (v_user, 'bypass_direto_teste');
  EXCEPTION WHEN OTHERS THEN
    v_barrado := true;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_barrado = false THEN
    RAISE EXCEPTION 'T10 FALHOU: authenticated gravou direto em audit_logs';
  END IF;
  SELECT count(*) INTO v_rows FROM public.audit_logs WHERE action = 'bypass_direto_teste';
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'T10 FALHOU: linha de bypass sobrou (%)', v_rows;
  END IF;

  -- ---------------------------------------------------------------- T11 rollback do cabeçalho EXECUTA
  -- As 3 linhas abaixo são, literalmente, o `-- Rollback (SQL executável, na ordem):` da migration.
  -- Rodam dentro da transação: ao final o ROLLBACK desfaz o DROP/DELETE e o banco volta ao estado.
  DROP FUNCTION IF EXISTS public.log_unauthorized_inbox_scope(text);
  DELETE FROM public.role_permissions
   WHERE permission_id IN (SELECT id FROM public.permissions
                            WHERE name IN ('inbox.view_department', 'inbox.view_all'));
  DELETE FROM public.permissions
   WHERE name IN ('inbox.view_department', 'inbox.view_all');

  IF to_regprocedure('public.log_unauthorized_inbox_scope(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'T11 FALHOU: rollback nao removeu a funcao';
  END IF;
  SELECT count(*) INTO v_perms FROM public.permissions
   WHERE name IN ('inbox.view_department','inbox.view_all');
  IF v_perms <> 0 THEN
    RAISE EXCEPTION 'T11 FALHOU: rollback nao removeu as permissoes (%)', v_perms;
  END IF;

  RAISE NOTICE 'inbox_scope_permissions: suite OK (T1 catalogo, T2 papeis, T3 ACL, T4 gravacao, T5 dedupe, T6 escopo, T7 invalido, T8 anon, T9 sem identidade, T10 escrita direta, T11 rollback)';
END $inbox_scope_perm$;

ROLLBACK;
