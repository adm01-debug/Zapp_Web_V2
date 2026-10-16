-- r2_auth_006_pedido_reset_anonimo — R2-AUTH-006 (item 72 / #72c):
-- "Recuperação anônima consulta profiles protegido e não cria solicitação".
-- (consumidor: src/pages/ForgotPassword.tsx). Porte fiel da prova que vivia em
-- scripts/db-audit/recuperacao-anonima-pedido-reset.test.sh (retirado pelo limpador:
-- .test.sh em scripts/db-audit/ só entra no CI citado nominalmente num workflow — ver
-- scripts/ci/check-test-inventory.mjs — e o cartão não pode editar workflow nem scripts/ci/).
--
-- O QUE PROVA. A superfície mínima é criada à mão aqui (roles anon/authenticated/service_role,
-- schema auth com auth.uid()/auth.role(), auth.users, public.profiles com as policies reais,
-- public.password_reset_requests com os DOIS gatilhos reais e os GRANTs reais). Papel de usuário
-- sempre por SET LOCAL ROLE dentro de DO $$ ... $$, nunca superusuário/dono.
--   BLOCO A — estado ANTERIOR (o defeito), fiel ao canônico:
--      * `profiles` esconde a conta de quem não tem sessão: o SELECT do /forgot-password
--        devolve 0 linhas como anon -> a tela mostra sucesso genérico e nem tenta o INSERT;
--      * a policy de INSERT é TO authenticated com `user_id = auth.uid()`: o anon não tem
--        caminho nenhum para registrar o pedido;
--      * o gatilho public.sanitize_reset_request() escreve em NEW.reset_token, coluna REMOVIDA
--        em 20260827170000_drop_dead_reset_token_subsystem: até o caminho authenticated morre
--        em `record "new" has no field "reset_token"`.
--      Resultado: NENHUMA solicitação é persistida (o pedido nunca chega ao admin).
--   BLOCO B — migration real aplicada: identidade resolvida no servidor (auth.users) para quem
--      não tem sessão, conta inexistente não grava e não revela, o cliente não forja
--      status/revisão/token nem atribui o pedido a outra conta, e o revisor (service_role) vê a
--      solicitação pendente. Caminho authenticated ainda usa o rate limit com erro; no caminho
--      anônimo o mesmo limite é silencioso (B.12/B.13).
--
-- COMO RODA. Em Postgres descartável; fixtures e asserções numa transação que termina em
-- ROLLBACK — zero efeito colateral e idempotente:
--   docker run --rm -d --name zapp-v2-reset-anon-$$ -e POSTGRES_PASSWORD=test_only postgres:17
--   docker exec -i zapp-v2-reset-anon-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig=/repo/supabase/migrations/20261006221242_recuperacao_anonima_pedido_reset.sql \
--     < supabase/tests/r2_auth_006_pedido_reset_anonimo.sql
-- O arquivo cria as roles, o schema auth e as tabelas À MÃO: só roda em Postgres descartável
-- (no banco da tarefa as roles, as FKs e as tabelas já existem).
-- VERMELHO esperado sem a migration: o mesmo comando com -v sem_migration=1 passa o BLOCO A
-- (que documenta o defeito) e falha já no BLOCO B.

\set ON_ERROR_STOP on

-- Caminho do arquivo da migration sob teste: -v mig=<caminho> vence o padrão.
\if :{?sem_migration}
\else
  \if :{?mig}
  \else
    \set mig 'supabase/migrations/20261006221242_recuperacao_anonima_pedido_reset.sql'
  \endif
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- Asserção: falha com a mensagem exata quando o valor não bate.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.t_eq(p_label text, p_actual text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FALHOU % — esperado [%], obtido [%]', p_label, p_expected, p_actual;
  END IF;
  RAISE NOTICE 'ok - %', p_label;
END $fn$;

-- ---------------------------------------------------------------------------
-- Estado ANTERIOR canônico: papéis da API, auth.users/auth.uid(), profiles com as
-- policies TO authenticated, password_reset_requests com a policy de INSERT TO
-- authenticated, os DOIS gatilhos reais e os grants reais (anon já tem INSERT de
-- TABELA — o que falta é a policy).
-- ---------------------------------------------------------------------------
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.sub', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
     )::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  role text DEFAULT 'agent',
  is_active boolean DEFAULT true
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE public.password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  token_expires_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT password_reset_requests_status_check CHECK (status IN ('pending','approved','rejected'))
);
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view reset requests" ON public.password_reset_requests FOR SELECT TO authenticated
  USING (false);  -- no teste só existe o ramo admin canônico; o foco é o caminho anônimo
CREATE POLICY "Users can request own password reset" ON public.password_reset_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Gatilhos REAIS, com o corpo vigente (a referência a reset_token É o defeito)
CREATE OR REPLACE FUNCTION public.sanitize_reset_request()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.reset_token := NULL;
    NEW.token_expires_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER sanitize_reset_request_trigger BEFORE INSERT ON public.password_reset_requests
  FOR EACH ROW EXECUTE FUNCTION public.sanitize_reset_request();

CREATE OR REPLACE FUNCTION public.rate_limit_reset_requests()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_pending_count integer;
BEGIN
  SELECT COUNT(*) INTO v_pending_count
  FROM public.password_reset_requests
  WHERE user_id = NEW.user_id
    AND status = 'pending'
    AND created_at > now() - interval '1 hour';

  IF v_pending_count >= 3 THEN
    RAISE EXCEPTION 'Too many pending reset requests. Please wait before trying again.';
  END IF;

  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_rate_limit_reset BEFORE INSERT ON public.password_reset_requests
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_reset_requests();

-- Grants REAIS da tabela (anon já tem INSERT de tabela na produção)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_requests TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_requests TO service_role;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- U_EXISTE: conta real. O profiles dela tem email NULO (o caso que o cliente lia e não achava).
-- U_CASE: conta real com email em caixa mista no auth.users.
-- U_OUTRO: conta real, usada para provar que o cliente não atribui o pedido a outra conta.
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'ti.existente@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'Outro.Usuario@Example.COM'),
  ('33333333-3333-3333-3333-333333333333', 'terceiro@example.com');

INSERT INTO public.profiles (id, user_id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', NULL),
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'divergente@example.com'),
  ('a0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'terceiro@example.com');

-- ---------------------------------------------------------------------------
-- BLOCO A — estado ANTERIOR (defeito)
-- ---------------------------------------------------------------------------
\echo '============ BLOCO A — estado ANTERIOR (defeito) ============'

-- A.1 (DEFEITO) sem sessão a conta fica invisível para o SELECT do /forgot-password.
DO $$
DECLARE v_linhas bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
  SELECT count(*) INTO v_linhas FROM public.profiles WHERE email = 'ti.existente@example.com';
  RESET ROLE;
  PERFORM public.t_eq('A.1 (DEFEITO) sem sessão a conta fica invisível: o SELECT do /forgot-password devolve 0 linhas', v_linhas::text, '0');
END $$;

-- A.2 (DEFEITO) anon não tem policy de INSERT: o pedido é recusado pela RLS.
DO $$
DECLARE v_msg text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
  BEGIN
    INSERT INTO public.password_reset_requests (email, reason, user_agent)
    VALUES ('ti.existente@example.com','esqueci','probe');
    RESET ROLE;
    RAISE EXCEPTION 'A.2 FALHOU: o INSERT anônimo passou, mas não existe policy de INSERT para anon';
  EXCEPTION WHEN others THEN
    v_msg := SQLERRM;
    RESET ROLE;
    IF position('row-level security' in v_msg) = 0 THEN
      RAISE EXCEPTION 'A.2 FALHOU: erro inesperado [%] (SQLSTATE %)', v_msg, SQLSTATE;
    END IF;
    RAISE NOTICE 'ok - A.2 (DEFEITO) anon não tem policy de INSERT: o pedido é recusado pela RLS [%]', v_msg;
  END;
END $$;

-- A.3 (DEFEITO) nem logado grava: o gatilho cita a coluna morta reset_token.
DO $$
DECLARE v_msg text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','11111111-1111-1111-1111-111111111111','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.password_reset_requests (user_id, email)
    VALUES ('11111111-1111-1111-1111-111111111111','ti.existente@example.com');
    RESET ROLE;
    RAISE EXCEPTION 'A.3 FALHOU: o INSERT do logado passou, mas o gatilho cita a coluna morta reset_token';
  EXCEPTION WHEN others THEN
    v_msg := SQLERRM;
    RESET ROLE;
    IF position('has no field "reset_token"' in v_msg) = 0 THEN
      RAISE EXCEPTION 'A.3 FALHOU: erro inesperado [%] (SQLSTATE %)', v_msg, SQLSTATE;
    END IF;
    RAISE NOTICE 'ok - A.3 (DEFEITO) nem logado grava: o gatilho cita a coluna morta reset_token [%]', v_msg;
  END;
END $$;

-- A.4 (DEFEITO) nenhuma solicitação foi persistida — o admin nunca recebe o pedido.
DO $$
DECLARE v_linhas bigint;
BEGIN
  SELECT count(*) INTO v_linhas FROM public.password_reset_requests;
  PERFORM public.t_eq('A.4 (DEFEITO) nenhuma solicitação foi persistida — o admin nunca recebe o pedido', v_linhas::text, '0');
END $$;

-- ---------------------------------------------------------------------------
-- Migration sob teste (o arquivo real do repositório)
-- ---------------------------------------------------------------------------
\if :{?sem_migration}
\else
\i :mig
\endif

-- ---------------------------------------------------------------------------
-- Fixtures de volta ao estado inicial (a migration não grava dado nenhum)
-- ---------------------------------------------------------------------------
DELETE FROM public.password_reset_requests;
DELETE FROM public.profiles;
DELETE FROM auth.users;

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'ti.existente@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'Outro.Usuario@Example.COM'),
  ('33333333-3333-3333-3333-333333333333', 'terceiro@example.com');

INSERT INTO public.profiles (id, user_id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', NULL),
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'divergente@example.com'),
  ('a0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'terceiro@example.com');

-- ---------------------------------------------------------------------------
-- BLOCO B — migration aplicada
-- ---------------------------------------------------------------------------
\echo '============ BLOCO B — migration aplicada ============'

-- B.1/B.2 caminho feliz do anon: só email/reason/user_agent (sem user_id e sem RETURNING —
-- o PostgREST do supabase-js .insert() sem .select() manda return=minimal, ou seja, sem RETURNING)
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
  INSERT INTO public.password_reset_requests (email, reason, user_agent)
  VALUES ('ti.existente@example.com','esqueci','probe');
  RESET ROLE;
  RAISE NOTICE 'ok - B.1 anon registra o pedido enviando só o email (user_id resolvido no servidor)';
END $$;

DO $$
DECLARE v_estado text;
BEGIN
  SELECT count(*)::text||'|'||coalesce(min(status),'-')||'|'||coalesce(min(email),'-')||'|'
         ||(coalesce(bool_or(reviewed_by IS NOT NULL),false))::int||'|'
         ||(coalesce(bool_or(reason IS NOT NULL),false))::int
    INTO v_estado
    FROM public.password_reset_requests
   WHERE user_id = '11111111-1111-1111-1111-111111111111';
  PERFORM public.t_eq('B.2 o pedido nasceu pendente, sem revisão, com o email canônico — e o profiles.email dessa conta é NULL', v_estado, '1|pending|ti.existente@example.com|0|1');
END $$;

-- B.3/B.4 conta inexistente: mesma resposta pública, nada gravado (não enumera emails)
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
  INSERT INTO public.password_reset_requests (email) VALUES ('ninguem@example.com');
  RESET ROLE;
  RAISE NOTICE 'ok - B.3 anon pedindo por conta inexistente não recebe erro (não enumera emails)';
END $$;

DO $$
DECLARE v_linhas bigint;
BEGIN
  SELECT count(*) INTO v_linhas FROM public.password_reset_requests WHERE email = 'ninguem@example.com';
  PERFORM public.t_eq('B.4 ...e nada foi gravado para o email inexistente', v_linhas::text, '0');
END $$;

-- B.5/B.6/B.7 o cliente não forja status/revisão/token nem atribui o pedido a outra conta
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
  INSERT INTO public.password_reset_requests
    (user_id, email, status, reviewed_by, reviewed_at, rejection_reason, token_expires_at)
  VALUES
    ('33333333-3333-3333-3333-333333333333','Outro.Usuario@Example.COM','approved',
     '33333333-3333-3333-3333-333333333333', now(), 'aprovado por mim', now());
  RESET ROLE;
  RAISE NOTICE 'ok - B.5 anon tenta forjar status/revisão/token e apontar o pedido para outra conta';
END $$;

DO $$
DECLARE v_linhas bigint;
BEGIN
  SELECT count(*) INTO v_linhas FROM public.password_reset_requests
   WHERE user_id = '22222222-2222-2222-2222-222222222222'
     AND status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL
     AND rejection_reason IS NULL AND token_expires_at IS NULL;
  PERFORM public.t_eq('B.6 ...e a linha nasceu pendente e limpa (o gatilho é a fronteira)', v_linhas::text, '1');
END $$;

DO $$
DECLARE v_linhas bigint;
BEGIN
  SELECT count(*) INTO v_linhas FROM public.password_reset_requests
   WHERE user_id = '33333333-3333-3333-3333-333333333333';
  PERFORM public.t_eq('B.7 ...e o user_id informado pelo cliente foi ignorado (vale o dono do email)', v_linhas::text, '0');
END $$;

-- B.8/B.9 a fronteira não vira leitura: nem anon nem logado comum veem a fila
DO $$
DECLARE v_linhas bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
  SELECT count(*) INTO v_linhas FROM public.password_reset_requests;
  RESET ROLE;
  PERFORM public.t_eq('B.8 anon não lê a fila de solicitações (0 linhas)', v_linhas::text, '0');
END $$;

DO $$
DECLARE v_linhas bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','11111111-1111-1111-1111-111111111111','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_linhas FROM public.password_reset_requests;
  RESET ROLE;
  PERFORM public.t_eq('B.9 usuário logado comum (não admin) também não lê a fila', v_linhas::text, '0');
END $$;

-- B.10/B.11 normalização: caixa diferente e espaços casam com a conta e gravam o email do auth.users
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
  INSERT INTO public.password_reset_requests (email, reason)
  VALUES ('  outro.usuario@EXAMPLE.com  ','caixa');
  RESET ROLE;
  RAISE NOTICE 'ok - B.10 email com caixa diferente e espaços casa com a conta (auth.users)';
END $$;

DO $$
DECLARE v_linhas bigint;
BEGIN
  SELECT count(*) INTO v_linhas FROM public.password_reset_requests
   WHERE user_id = '22222222-2222-2222-2222-222222222222'
     AND email = 'Outro.Usuario@Example.COM' AND reason = 'caixa';
  PERFORM public.t_eq('B.11 ...e o email gravado é o canônico do auth.users', v_linhas::text, '1');
END $$;

-- B.12/B.13/B.13b/B.13c rate limit anônimo: 3 pendentes por hora; o 4º não enumera, não erra e não grava.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
  INSERT INTO public.password_reset_requests (email) VALUES ('outro.usuario@example.com');
  RESET ROLE;
  RAISE NOTICE 'ok - B.12 terceiro pedido pendente do mesmo usuário ainda passa';
END $$;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
  -- referência (email inexistente) e caso limitado (4º pendente): as duas respostas públicas
  -- são silenciosas e idênticas — nenhuma das duas levanta erro nem grava linha.
  INSERT INTO public.password_reset_requests (email) VALUES ('ninguem-rate-limit@example.com');
  INSERT INTO public.password_reset_requests (email) VALUES ('outro.usuario@example.com');
  RESET ROLE;
  RAISE NOTICE 'ok - B.13 quarto pedido anônimo limitado tem a mesma resposta pública de email inexistente';
END $$;

DO $$
DECLARE v_linhas bigint;
BEGIN
  SELECT count(*) INTO v_linhas FROM public.password_reset_requests
   WHERE user_id = '22222222-2222-2222-2222-222222222222' AND status = 'pending';
  PERFORM public.t_eq('B.13b o quarto pedido anônimo limitado não grava linha', v_linhas::text, '3');
END $$;

DO $$
DECLARE v_linhas bigint;
BEGIN
  SELECT count(*) INTO v_linhas FROM public.password_reset_requests
   WHERE email = 'ninguem-rate-limit@example.com';
  PERFORM public.t_eq('B.13c a referência inexistente também não grava linha', v_linhas::text, '0');
END $$;

-- B.14/B.15 caminho authenticated segue funcionando (dono do próprio pedido)
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','11111111-1111-1111-1111-111111111111','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.password_reset_requests (user_id, email, reason)
  VALUES ('11111111-1111-1111-1111-111111111111','ti.existente@example.com','logado');
  RESET ROLE;
  RAISE NOTICE 'ok - B.14 logado ainda registra o próprio pedido (user_id = auth.uid())';
END $$;

DO $$
DECLARE v_linhas bigint;
BEGIN
  SELECT count(*) INTO v_linhas FROM public.password_reset_requests
   WHERE user_id = '11111111-1111-1111-1111-111111111111'
     AND reason = 'logado' AND status = 'pending';
  PERFORM public.t_eq('B.15 o pedido do logado foi gravado como pendente e do próprio usuário', v_linhas::text, '1');
END $$;

-- B.16/B.17/B.18 anon não apaga nem altera pedido
DO $$
DECLARE v_linhas bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
  WITH up AS (UPDATE public.password_reset_requests SET status = 'approved' RETURNING 1)
  SELECT count(*) INTO v_linhas FROM up;
  RESET ROLE;
  PERFORM public.t_eq('B.16 anon não consegue UPDATE na fila (RLS não dá linhas)', v_linhas::text, '0');
END $$;

DO $$
DECLARE v_linhas bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
  WITH del AS (DELETE FROM public.password_reset_requests RETURNING 1)
  SELECT count(*) INTO v_linhas FROM del;
  RESET ROLE;
  PERFORM public.t_eq('B.17 anon não consegue DELETE na fila', v_linhas::text, '0');
END $$;

DO $$
DECLARE v_linhas bigint;
BEGIN
  SELECT count(*) INTO v_linhas FROM public.password_reset_requests WHERE status = 'pending';
  PERFORM public.t_eq('B.18 os 5 pedidos seguem pendentes depois das tentativas do anon', v_linhas::text, '5');
END $$;

-- B.19 o revisor (service_role, o caminho da edge approve-password-reset) vê a solicitação
DO $$
DECLARE v_linhas bigint;
BEGIN
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_linhas FROM public.password_reset_requests
   WHERE reason = 'esqueci' AND status = 'pending';
  RESET ROLE;
  PERFORM public.t_eq('B.19 service_role (revisor) vê a solicitação pendente do pedido anônimo', v_linhas::text, '1');
END $$;

-- B.20 regra do repo (20261001191230): função de gatilho sem EXECUTE para os papéis da API.
-- anon e authenticated são membros de PUBLIC, então EXECUTE para PUBLIC apareceria como true aqui.
DO $$
DECLARE v_acl text;
BEGIN
  SELECT (has_function_privilege('anon','public.sanitize_reset_request()','EXECUTE'))::int||'|'
       ||(has_function_privilege('authenticated','public.sanitize_reset_request()','EXECUTE'))::int
    INTO v_acl;
  PERFORM public.t_eq('B.20 gatilho sem EXECUTE para anon nem authenticated (e portanto nem via PUBLIC)', v_acl, '0|0');
END $$;

ROLLBACK;

\echo 'PASS: R2-AUTH-006 — o pedido anônimo de recuperação persiste como solicitação pendente (identidade resolvida no servidor), conta inexistente e conta limitada não gravam nem enumeram, o cliente não forja status/revisão/token, a fila não vaza para anon/logado e o revisor vê o pedido.'
