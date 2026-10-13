-- revoke_truncate_trigger_references — prova, no banco LOCAL, da migration
-- supabase/migrations/20261013000031_revoke_truncate_trigger_references.sql (cartão t_9ad2f3a0).
--
-- O QUE PROVA (critério de pronto do cartão):
--   T1  nenhuma relação de public tem TRUNCATE, TRIGGER ou REFERENCES para anon ou
--       authenticated (leitura de pg_class + aclexplode: cobre tabela, view, matview e
--       foreign table — não só information_schema.role_table_grants);
--   T2  como o PAPEL real (SET LOCAL ROLE anon), TRUNCATE é NEGADO (42501) — em RED,
--       antes da migration, o TRUNCATE de anon passa e o teste falha aqui;
--   T3  o mesmo para authenticated;
--   T4  service_role segue INTACTO (os 3 privilégios continuam, nada foi apertado além do pedido);
--   T5  anon perdeu INSERT, UPDATE e DELETE em public.contact_custom_fields;
--   T6  como anon, INSERT nessa tabela é NEGADO (42501);
--   T7  o fluxo LEGÍTIMO do authenticated continua: com um admin real (user_roles +
--       request.jwt.claims), SELECT e INSERT em contact_custom_fields passam pela RLS;
--   T8  o ALTER DEFAULT PRIVILEGES pegou: uma tabela NOVA criada em public pelo dono atual
--       não herda os 3 privilégios para anon/authenticated.
--
-- COMO RODAR (banco LOCAL da tarefa, nunca produção):
--   zapp-db-local psql . <conjunto> -v ON_ERROR_STOP=1 < supabase/tests/revoke_truncate_trigger_references.sql
-- Tudo numa transação que termina em ROLLBACK: dados sintéticos, zero efeito colateral.
-- Sem EXCEPTION = suíte verde.
BEGIN;

DO $acl$
DECLARE
  v_ddl integer;
BEGIN
  SELECT count(*) INTO v_ddl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    JOIN pg_roles r ON r.oid = a.grantee
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'v', 'm', 'p', 'f')
     AND r.rolname IN ('anon', 'authenticated')
     AND a.privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES');
  IF v_ddl <> 0 THEN
    RAISE EXCEPTION 'T1 FALHOU: % concessoes de TRUNCATE/TRIGGER/REFERENCES ainda vivas para anon/authenticated', v_ddl;
  END IF;
  RAISE NOTICE 'T1 ok: 0 concessoes de TRUNCATE/TRIGGER/REFERENCES para anon/authenticated em public';
END $acl$;

DO $neg$
DECLARE
  v_anon boolean := false;
  v_auth boolean := false;
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    EXECUTE 'TRUNCATE public.contact_custom_fields';
    v_anon := true;
  EXCEPTION WHEN insufficient_privilege THEN
    v_anon := false;
  END;
  EXECUTE 'RESET ROLE';

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'TRUNCATE public.contact_custom_fields';
    v_auth := true;
  EXCEPTION WHEN insufficient_privilege THEN
    v_auth := false;
  END;
  EXECUTE 'RESET ROLE';

  IF v_anon THEN RAISE EXCEPTION 'T2 FALHOU: anon conseguiu TRUNCATE'; END IF;
  IF v_auth THEN RAISE EXCEPTION 'T3 FALHOU: authenticated conseguiu TRUNCATE'; END IF;
  RAISE NOTICE 'T2/T3 ok: anon e authenticated recebem 42501 ao tentar TRUNCATE (papel real)';
END $neg$;

DO $svc$
DECLARE
  v_ok boolean;
BEGIN
  SELECT bool_and(has_table_privilege('service_role', 'public.contact_custom_fields', p))
    INTO v_ok
    FROM unnest(ARRAY['TRUNCATE', 'TRIGGER', 'REFERENCES', 'SELECT', 'INSERT', 'UPDATE', 'DELETE']) p;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'T4 FALHOU: service_role perdeu privilegio em contact_custom_fields';
  END IF;
  RAISE NOTICE 'T4 ok: service_role intacto em contact_custom_fields';
END $svc$;

DO $w$
DECLARE
  v_resto text;
BEGIN
  SELECT string_agg(p, ',' ORDER BY p) INTO v_resto
    FROM unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) p
   WHERE has_table_privilege('anon', 'public.contact_custom_fields', p);
  IF v_resto IS NOT NULL THEN
    RAISE EXCEPTION 'T5 FALHOU: anon ainda tem % em contact_custom_fields', v_resto;
  END IF;
  RAISE NOTICE 'T5 ok: anon sem INSERT/UPDATE/DELETE em contact_custom_fields';

  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    EXECUTE 'INSERT INTO public.contact_custom_fields (contact_id, field_name) VALUES (gen_random_uuid(), ''zz_acl_probe'')';
    RAISE EXCEPTION 'T6 FALHOU: anon inseriu em contact_custom_fields';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'T6 ok: anon recebe 42501 ao tentar INSERT em contact_custom_fields (papel real)';
END $w$;

DO $fixture$
DECLARE
  v_user uuid := '9ad2f3a0-0000-4000-8000-0000000000a1';
  v_prof uuid;
  v_cont uuid := '9ad2f3a0-0000-4000-8000-0000000000a3';
BEGIN
  -- auth.users tem gatilho handle_new_user() que cria a linha de profiles (id proprio,
  -- user_id = novo usuario); por isso leio o profiles.id de volta antes de amarrar o contato.
  INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES (v_user, 'acl-probe@example.test', '{"name":"ACL Probe Admin"}'::jsonb);
  SELECT id INTO v_prof FROM public.profiles WHERE user_id = v_user;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user, 'admin'::public.app_role);
  INSERT INTO public.contacts (id, name, phone, assigned_to) VALUES (v_cont, 'ACL Probe', '+5500000000000', v_prof);
  INSERT INTO public.contact_custom_fields (contact_id, field_name, field_value) VALUES (v_cont, 'probe', 'ok');
END $fixture$;

DO $legit$
DECLARE
  v_n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
                     '{"sub":"9ad2f3a0-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE 'SELECT count(*) FROM public.contact_custom_fields' INTO v_n;
  IF v_n < 1 THEN
    RAISE EXCEPTION 'T7 FALHOU: admin autenticado nao leu os campos (n=%)', v_n;
  END IF;
  EXECUTE 'INSERT INTO public.contact_custom_fields (contact_id, field_name, field_value) '
       || 'VALUES (''9ad2f3a0-0000-4000-8000-0000000000a3'', ''probe2'', ''ok'')';
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'T7 ok: leitura e escrita legitimas do authenticated seguem via RLS (n=%)', v_n;
END $legit$;

DO $def$
DECLARE
  v_falta text;
BEGIN
  EXECUTE 'CREATE TABLE public.zz_acl_default_probe (id integer)';
  SELECT string_agg(r || ':' || p, ',' ORDER BY r, p) INTO v_falta
    FROM unnest(ARRAY['anon', 'authenticated']) r,
         unnest(ARRAY['TRUNCATE', 'TRIGGER', 'REFERENCES']) p
   WHERE has_table_privilege(r, 'public.zz_acl_default_probe', p);
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'T8 FALHOU: tabela nova herdou privilegio(s) %', v_falta;
  END IF;
  RAISE NOTICE 'T8 ok: tabela nova em public nao herda TRUNCATE/TRIGGER/REFERENCES';
END $def$;

ROLLBACK;

-- Todos os T passaram: a suite é verde.
