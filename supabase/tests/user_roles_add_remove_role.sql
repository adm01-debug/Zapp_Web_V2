-- user_roles_add_remove_role
-- N-018 — concessão e revogação de papel por RPC dedicada
-- (public.admin_add_role / public.admin_remove_role), com o mesmo padrão do
-- admin_set_role: exige sessão JWT real, só admin, nunca deixa a instalação sem
-- administrador, não remove o próprio papel de admin, e toda mudança fica em
-- audit_logs pelo gatilho vigente (audit_user_role_changes).
--
-- O QUE ESTE TESTE PROVA
--   1) ACL: EXECUTE existe para `authenticated` e `service_role`; NÃO existe
--      para `anon` (42501 na chamada real).
--   2) Definição: SECURITY DEFINER com search_path fixo (funcao-segura-no-banco).
--   3) Guardas: jwt_session_required (service_role sem JWT), admin_required
--      (agente autenticado não-admin), role_already_assigned, role_not_assigned,
--      cannot_remove_own_admin, cannot_demote_last_admin.
--   4) Efeito: a linha certa de public.user_roles entra/sai, o retorno tem o
--      user_id/role, e audit_logs ganha EXATAMENTE 1 evento com a autoria certa
--      (granted_by/revoked_by = admin chamador).
--   5) Operação negada não muda nada (atômico).
--
-- COMO RODA (banco LOCAL da tarefa — Supabase, papéis `anon`/`authenticated`/
-- `service_role` reais; nunca como postgres para o enforcement):
--   zapp-db-local psql . v2-2610130050c2ce \
--     < supabase/tests/user_roles_add_remove_role.sql
-- Tudo roda numa única transação que termina em ROLLBACK: idempotente, sem
-- efeito colateral. As asserções rodam com SET LOCAL ROLE + JWT sintético em
-- request.jwt.claims (o caminho do PostgREST); o helper confere que o papel
-- pegou (current_user) e falha se não pegou.
--
-- VERMELHO (o teste falha sem a correção): derrube as duas RPCs DENTRO da
-- transação — `\set sem_rpc 1` antes do arquivo. Nada persiste (ROLLBACK).

\set ON_ERROR_STOP on

BEGIN;

\if :{?sem_rpc}
  \echo '  [sem_rpc] derrubando admin_add_role/admin_remove_role dentro da transacao (prova do defeito)'
  DROP FUNCTION IF EXISTS public.admin_add_role(uuid, public.app_role);
  DROP FUNCTION IF EXISTS public.admin_remove_role(uuid, public.app_role);
\endif

-- ─── fixtures (só auth.users + user_roles; sem gatilho: replica) ─────────────
-- O piso de admin é sobre a INSTALAÇÃO INTEIRA, então o teste normaliza a
-- população de user_roles para os 4 usuários-fixura (a semente do banco local
-- não pode mudar o resultado). Tudo é desfeito no ROLLBACK final.
SET session_replication_role = replica;

DELETE FROM public.user_roles
 WHERE user_id NOT IN (
   '11111111-1111-1111-1111-111111111101',
   '22222222-2222-2222-2222-222222222202',
   '33333333-3333-3333-3333-333333333303',
   '44444444-4444-4444-4444-444444444404');

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-111111111101'),  -- ADMIN: chama as RPCs
  ('22222222-2222-2222-2222-222222222202'),  -- ADMIN: alvo do piso
  ('33333333-3333-3333-3333-333333333303'),  -- AGENTE: não-admin
  ('44444444-4444-4444-4444-444444444404')   -- ALVO comum
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111101', 'admin'),
  ('22222222-2222-2222-2222-222222222202', 'admin'),
  ('33333333-3333-3333-3333-333333333303', 'agent'),
  ('44444444-4444-4444-4444-444444444404', 'agent')
ON CONFLICT (user_id, role) DO NOTHING;

SET session_replication_role = origin;

-- ─── helpers ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION E'[FAIL] %\n  atual:    %\n  esperado: %', p_label, p_atual, p_esperado;
  END IF;
  RAISE NOTICE '[OK] % -> %', p_label, p_atual;
END $$;

-- Executa p_sql COMO o papel real p_role, com JWT sintético p_uid em
-- request.jwt.claims; devolve (state, msg, val). Reseta o papel sempre.
CREATE OR REPLACE FUNCTION pg_temp.como(p_role text, p_uid uuid, p_sql text,
  OUT r_state text, OUT r_msg text, OUT r_val text)
RETURNS record LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', p_role, true);
  IF current_user IS DISTINCT FROM p_role THEN
    RAISE EXCEPTION '[FAIL] SET ROLE % nao pegou (current_user=%)', p_role, current_user;
  END IF;
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_uid IS NULL THEN '' ELSE json_build_object('sub', p_uid::text)::text END, true);
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_uid::text, ''), true);
  BEGIN
    EXECUTE format('select to_json(t)::text from (%s) t', p_sql) INTO r_val;
    r_state := 'OK'; r_msg := '';
  EXCEPTION WHEN OTHERS THEN
    r_state := SQLSTATE; r_msg := SQLERRM; r_val := NULL;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.espera_ok(p_label text, p_role text, p_uid uuid, p_sql text,
                                             p_trecho_valor text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  r := pg_temp.como(p_role, p_uid, p_sql);
  IF r.r_state <> 'OK' THEN
    RAISE EXCEPTION '[FAIL] % — esperava OK, veio % / %', p_label, r.r_state, r.r_msg;
  END IF;
  IF p_trecho_valor IS NOT NULL AND position(p_trecho_valor in coalesce(r.r_val, '')) = 0 THEN
    RAISE EXCEPTION '[FAIL] % — retorno "%" nao contem "%"', p_label, r.r_val, p_trecho_valor;
  END IF;
  RAISE NOTICE '[OK] % -> OK %', p_label, coalesce(r.r_val, '');
END $$;

CREATE OR REPLACE FUNCTION pg_temp.espera_erro(p_label text, p_role text, p_uid uuid, p_sql text,
                                               p_state text, p_trecho text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  r := pg_temp.como(p_role, p_uid, p_sql);
  IF r.r_state IS DISTINCT FROM p_state THEN
    RAISE EXCEPTION '[FAIL] % — state=% (esperado %), msg=%', p_label, r.r_state, p_state, r.r_msg;
  END IF;
  IF position(p_trecho in coalesce(r.r_msg, '')) = 0 THEN
    RAISE EXCEPTION '[FAIL] % — msg="%" nao contem "%"', p_label, r.r_msg, p_trecho;
  END IF;
  RAISE NOTICE '[OK] % -> % / %', p_label, r.r_state, r.r_msg;
END $$;

-- ═══ 1) ACL e definição das duas RPCs ═══════════════════════════════════════
SELECT pg_temp.espera('EXECUTE authenticated admin_add_role',
  has_function_privilege('authenticated',
    'public.admin_add_role(uuid,public.app_role)', 'EXECUTE')::text, 'true');
SELECT pg_temp.espera('EXECUTE service_role admin_add_role',
  has_function_privilege('service_role',
    'public.admin_add_role(uuid,public.app_role)', 'EXECUTE')::text, 'true');
SELECT pg_temp.espera('EXECUTE anon admin_add_role (negado)',
  has_function_privilege('anon',
    'public.admin_add_role(uuid,public.app_role)', 'EXECUTE')::text, 'false');
SELECT pg_temp.espera('EXECUTE authenticated admin_remove_role',
  has_function_privilege('authenticated',
    'public.admin_remove_role(uuid,public.app_role)', 'EXECUTE')::text, 'true');
SELECT pg_temp.espera('EXECUTE service_role admin_remove_role',
  has_function_privilege('service_role',
    'public.admin_remove_role(uuid,public.app_role)', 'EXECUTE')::text, 'true');
SELECT pg_temp.espera('EXECUTE anon admin_remove_role (negado)',
  has_function_privilege('anon',
    'public.admin_remove_role(uuid,public.app_role)', 'EXECUTE')::text, 'false');

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, p.prosecdef,
           (p.proconfig @> ARRAY['search_path=public']) AS sp
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('admin_add_role','admin_remove_role')
  LOOP
    PERFORM pg_temp.espera('security definer ' || r.proname, r.prosecdef::text, 'true');
    PERFORM pg_temp.espera('search_path fixo ' || r.proname, r.sp::text, 'true');
  END LOOP;
END $$;

-- ═══ 2) anon não chama (enforcement real, não só a ACL) ═════════════════════
SELECT pg_temp.espera_erro('anon nao chama admin_add_role', 'anon',
  '11111111-1111-1111-1111-111111111101',
  $q$select public.admin_add_role('44444444-4444-4444-4444-444444444404','supervisor')$q$,
  '42501', 'permission denied');
SELECT pg_temp.espera_erro('anon nao chama admin_remove_role', 'anon',
  '11111111-1111-1111-1111-111111111101',
  $q$select public.admin_remove_role('44444444-4444-4444-4444-444444444404','agent')$q$,
  '42501', 'permission denied');

-- ═══ 3) guardas de identidade ══════════════════════════════════════════════
-- service_role sem JWT: auth.uid() nulo -> jwt_session_required
SELECT pg_temp.espera_erro('service_role sem JWT', 'service_role', NULL,
  $q$select public.admin_add_role('44444444-4444-4444-4444-444444444404','supervisor')$q$,
  'P0001', 'jwt_session_required');

-- agente autenticado (não-admin) -> admin_required
SELECT pg_temp.espera_erro('agente nao e admin (add)', 'authenticated',
  '33333333-3333-3333-3333-333333333303',
  $q$select public.admin_add_role('44444444-4444-4444-4444-444444444404','supervisor')$q$,
  'P0001', 'admin_required');
SELECT pg_temp.espera_erro('agente nao e admin (remove)', 'authenticated',
  '33333333-3333-3333-3333-333333333303',
  $q$select public.admin_remove_role('44444444-4444-4444-4444-444444444404','agent')$q$,
  'P0001', 'admin_required');

-- ═══ 4) admin ADICIONA papel: efeito + auditoria ═══════════════════════════
SELECT pg_temp.espera('alvo comeca com 1 papel',
  (SELECT count(*)::text FROM public.user_roles
    WHERE user_id = '44444444-4444-4444-4444-444444444404'), '1');

SELECT pg_temp.espera_ok('admin adiciona supervisor ao alvo', 'authenticated',
  '11111111-1111-1111-1111-111111111101',
  $q$select public.admin_add_role('44444444-4444-4444-4444-444444444404','supervisor')$q$,
  '"out_role":"supervisor"');

SELECT pg_temp.espera('alvo agora tem 2 papeis',
  (SELECT count(*)::text FROM public.user_roles
    WHERE user_id = '44444444-4444-4444-4444-444444444404'), '2');
SELECT pg_temp.espera('linha supervisor existe',
  (SELECT count(*)::text FROM public.user_roles
    WHERE user_id = '44444444-4444-4444-4444-444444444404' AND role = 'supervisor'), '1');
SELECT pg_temp.espera('audit_logs role_granted com autoria do admin',
  (SELECT count(*)::text FROM public.audit_logs
    WHERE entity_type = 'user_roles' AND action = 'role_granted'
      AND details->>'user_id' = '44444444-4444-4444-4444-444444444404'
      AND details->>'role' = 'supervisor'
      AND details->>'granted_by' = '11111111-1111-1111-1111-111111111101'), '1');

-- repetir a concessão é recusado e NÃO duplica evento
SELECT pg_temp.espera_erro('conceder papel ja atribuido', 'authenticated',
  '11111111-1111-1111-1111-111111111101',
  $q$select public.admin_add_role('44444444-4444-4444-4444-444444444404','supervisor')$q$,
  'P0001', 'role_already_assigned');
SELECT pg_temp.espera('recusa nao duplicou a auditoria',
  (SELECT count(*)::text FROM public.audit_logs
    WHERE entity_type = 'user_roles' AND action = 'role_granted'
      AND details->>'user_id' = '44444444-4444-4444-4444-444444444404'), '1');

-- ═══ 5) admin REMOVE papel: efeito + auditoria ═════════════════════════════
SELECT pg_temp.espera_ok('admin remove supervisor do alvo', 'authenticated',
  '11111111-1111-1111-1111-111111111101',
  $q$select public.admin_remove_role('44444444-4444-4444-4444-444444444404','supervisor')$q$,
  '"out_role":"supervisor"');

SELECT pg_temp.espera('alvo voltou a 1 papel',
  (SELECT count(*)::text FROM public.user_roles
    WHERE user_id = '44444444-4444-4444-4444-444444444404'), '1');
SELECT pg_temp.espera('audit_logs role_revoked com autoria do admin',
  (SELECT count(*)::text FROM public.audit_logs
    WHERE entity_type = 'user_roles' AND action = 'role_revoked'
      AND details->>'user_id' = '44444444-4444-4444-4444-444444444404'
      AND details->>'role' = 'supervisor'
      AND details->>'revoked_by' = '11111111-1111-1111-1111-111111111101'), '1');

-- remover papel que não existe é recusado e não muda nada
SELECT pg_temp.espera_erro('remover papel nao atribuido', 'authenticated',
  '11111111-1111-1111-1111-111111111101',
  $q$select public.admin_remove_role('44444444-4444-4444-4444-444444444404','supervisor')$q$,
  'P0001', 'role_not_assigned');
SELECT pg_temp.espera('recusa nao removeu nada',
  (SELECT count(*)::text FROM public.user_roles
    WHERE user_id = '44444444-4444-4444-4444-444444444404'), '1');

-- ═══ 6) travas de admin: o próprio e o último ══════════════════════════════
-- 2 admins: remover o próprio admin é proibido (cannot_remove_own_admin)
SELECT pg_temp.espera_erro('admin nao remove o proprio admin', 'authenticated',
  '11111111-1111-1111-1111-111111111101',
  $q$select public.admin_remove_role('11111111-1111-1111-1111-111111111101','admin')$q$,
  'P0001', 'cannot_remove_own_admin');
SELECT pg_temp.espera('tentativa propria nao mudou nada',
  (SELECT count(*)::text FROM public.user_roles
    WHERE user_id = '11111111-1111-1111-1111-111111111101' AND role = 'admin'), '1');

-- admin remove o admin do OUTRO (ainda há 2) -> permitido, sobra 1
SELECT pg_temp.espera_ok('admin remove admin do outro (havia 2)', 'authenticated',
  '11111111-1111-1111-1111-111111111101',
  $q$select public.admin_remove_role('22222222-2222-2222-2222-222222222202','admin')$q$,
  '"out_role":"admin"');
SELECT pg_temp.espera('sobrou 1 admin na instalacao',
  (SELECT count(*)::text FROM public.user_roles WHERE role = 'admin'), '1');

-- agora remover esse último admin (o próprio chamador) -> piso de admin
SELECT pg_temp.espera_erro('nao remove o ultimo admin', 'authenticated',
  '11111111-1111-1111-1111-111111111101',
  $q$select public.admin_remove_role('11111111-1111-1111-1111-111111111101','admin')$q$,
  'P0001', 'cannot_demote_last_admin');
SELECT pg_temp.espera('ultimo admin preservado',
  (SELECT count(*)::text FROM public.user_roles WHERE role = 'admin'), '1');
SELECT pg_temp.espera('auditoria: 1 role_revoked de admin (a do outro admin)',
  (SELECT count(*)::text FROM public.audit_logs
    WHERE entity_type = 'user_roles' AND action = 'role_revoked'
      AND details->>'role' = 'admin'
      AND details->>'user_id' = '22222222-2222-2222-2222-222222222202'
      AND details->>'revoked_by' = '11111111-1111-1111-1111-111111111101'), '1');

ROLLBACK;

\echo 'TODOS OS CASOS PASSARAM'
