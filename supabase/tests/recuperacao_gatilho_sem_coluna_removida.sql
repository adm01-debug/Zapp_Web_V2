-- recuperacao_gatilho_sem_coluna_removida — prova de banco do cartão "fix(recuperacao):
-- remove ramo anonimo do gatilho de reset" (achado R2-DB-023, item 304 / #304).
--
-- O QUE PROVA. A superfície mínima do Supabase é criada À MÃO aqui (roles
-- anon/authenticated/service_role, schema auth com auth.uid(), auth.users e
-- public.password_reset_requests JÁ SEM a coluna reset_token — removida em
-- 20260411111454), com o corpo VIGENTE de public.sanitize_reset_request()
-- (20260410103156) que cita `NEW.reset_token := NULL`, o gatilho BEFORE INSERT
-- sanitize_reset_request_trigger, o gatilho de rate limit (20260410105209) e a policy
-- de INSERT TO authenticated (user_id = auth.uid()). Papel de usuário sempre por
-- SET LOCAL ROLE dentro de DO $$ ... $$, nunca superusuário/dono; fixture e asserção
-- numa transação que termina em ROLLBACK — zero efeito colateral e idempotente:
--   T-A (estado ANTERIOR, o defeito): o usuário LOGADO manda o próprio pedido (payload
--      que a RLS permite) e o gatilho aborta o INSERT inteiro citando a coluna removida
--      (`record "new" has no field "reset_token"`); nada é persistido;
--   T-B1/T-B2: aplicada a migration, o pedido do usuário logado persiste como 'pending';
--   T-B3/T-B4: o cliente NÃO forja status/revisão/token — o gatilho segue saneando;
--   T-B5/T-B6: o rate limit canônico (3 pendentes por hora) continua valendo;
--   T-B7/T-B8: sem sessão a função devolve NEW como antes, sem lookup em auth.users;
--   T-B9: a função de gatilho segue sem EXECUTE para anon/authenticated;
--   T-R1/T-R2 (opcional, -v rollback=<arquivo>): o bloco `-- Rollback:` do cabeçalho da
--      migration executa, restaura o corpo anterior e preserva o REVOKE;
--   T-B12: reaplicar a migration é idempotente e volta a permitir o pedido autenticado.
--
-- COMO RODA. Em Postgres descartável; fixtures e asserções numa transação que termina em
-- ROLLBACK. O arquivo cria roles, schema auth, auth.users e a tabela À MÃO: só roda em
-- Postgres descartável (no banco da tarefa as roles, as FKs e a tabela já existem). O
-- psql roda DENTRO do container, então o repositório é montado em /repo e -v mig aponta
-- para o caminho de dentro do container:
--   docker run --rm -d --name zapp-v2-reset-gatilho -e POSTGRES_PASSWORD=test_only \
--     -v "$PWD:/repo:ro" postgres:17-alpine
--   docker exec -i zapp-v2-reset-gatilho psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig=/repo/supabase/migrations/20261006231105_recuperacao_gatilho_sem_coluna_removida.sql \
--     < supabase/tests/recuperacao_gatilho_sem_coluna_removida.sql
--
-- VERMELHO esperado sem a migration: o mesmo comando com -v sem_migration=1 falha já em T-B1
-- (o INSERT autenticado morre no gatilho que cita a coluna removida).
--
-- FORA DO ALCANCE DESTE ARQUIVO (registrado para o dono do workflow): o bloco executável do
-- `-- Rollback:` mora em COMENTÁRIO no cabeçalho da migration; extraí-lo por psql não é
-- possível. Por isso T-R1/T-R2 só rodam quando o chamador passa -v rollback=<arquivo com o SQL
-- do cabeçalho já extraído>; sem essa variável o arquivo pula o bloco e emite NOTICE.
-- Concorrência real entre duas sessões (duas requisições simultâneas do mesmo usuário contra o
-- rate limit) também não é exercitada aqui — é prova de duas conexões, não de um script.

\set ON_ERROR_STOP on

-- Caminho do arquivo da migration sob teste: -v mig=<caminho> vence o padrão.
\if :{?sem_migration}
\else
  \if :{?mig}
  \else
    \set mig 'supabase/migrations/20261006231105_recuperacao_gatilho_sem_coluna_removida.sql'
  \endif
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- Superfície mínima à mão — forma CORRENTE: coluna reset_token já removida, gatilho de
-- sanitização VIVO com o corpo que cita a coluna morta (o defeito), rate limit canônico.
-- ---------------------------------------------------------------------------
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text
);

-- Tabela no estado ATUAL (sem reset_token). Colunas reais da tabela.
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

-- Policy de SELECT do admin (no teste só existe o ramo autenticado comum; o corpo real usa
-- has_role(auth.uid(),'admin'), que não é o objeto deste cartão).
CREATE POLICY "Admins can view reset requests" ON public.password_reset_requests FOR SELECT TO authenticated
  USING (false);
-- Policy de INSERT vigente para o caminho autenticado.
CREATE POLICY "Users can request own password reset" ON public.password_reset_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Corpo VIGENTE (20260410103156): cita NEW.reset_token, coluna já removida -> ESTE é o defeito.
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

-- Gatilho canônico de rate limit (20260410105209).
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

-- Grants REAIS da tabela para os papéis da API.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_requests TO authenticated, anon, service_role;

-- Regra do repo (20261001191230): funções de gatilho sem EXECUTE para os papéis da API.
REVOKE EXECUTE ON FUNCTION public.sanitize_reset_request() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rate_limit_reset_requests() FROM PUBLIC, anon, authenticated, service_role;

-- Fixtures (inseridas como postgres, antes da migration existir).
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'ti.existente@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'Outro.Usuario@Example.COM');

-- ---------------------------------------------------------------------------
-- T-A — estado ANTERIOR (o defeito): o pedido autenticado do próprio usuário é
--       abortado pelo gatilho que cita a coluna removida; nada é persistido.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','11111111-1111-1111-1111-111111111111','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    INSERT INTO public.password_reset_requests (user_id, email, reason)
    VALUES ('11111111-1111-1111-1111-111111111111','ti.existente@example.com','auto');
    RAISE EXCEPTION 'T-A FALHOU: o defeito NAO apareceu — o INSERT autenticado passou (esperado: erro na coluna removida reset_token)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%has no field "reset_token"%' THEN
      RAISE EXCEPTION 'T-A FALHOU: erro inesperado do gatilho (% / SQLSTATE %)', SQLERRM, SQLSTATE;
    END IF;
  END;

  RESET ROLE;
  RAISE NOTICE 'T-A OK: o estado anterior E defeituoso — o gatilho cita a coluna removida e aborta o pedido autenticado';
END $$;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.password_reset_requests;
  IF n <> 0 THEN
    RAISE EXCEPTION 'T-A FALHOU: nenhuma solicitacao deveria persistir no estado anterior, mas ha %', n;
  END IF;
  RAISE NOTICE 'T-A OK: nenhuma solicitacao foi persistida — o admin nunca recebe o pedido';
END $$;

-- ---------------------------------------------------------------------------
-- Migration sob teste (o arquivo real do repositório)
-- ---------------------------------------------------------------------------
\if :{?sem_migration}
\else
  \i :mig
\endif

-- ---------------------------------------------------------------------------
-- T-B1/T-B2 — o pedido do usuário LOGADO (o caminho do cartão) passa a persistir, saneado.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','11111111-1111-1111-1111-111111111111','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.password_reset_requests (user_id, email, reason)
  VALUES ('11111111-1111-1111-1111-111111111111','ti.existente@example.com','auto');
  RESET ROLE;
  RAISE NOTICE 'T-B1 OK: logado registra o proprio pedido (user_id = auth.uid())';
END $$;

DO $$
DECLARE r text;
BEGIN
  SELECT count(*)::text||'|'||coalesce(min(status),'-')||'|'||coalesce(min(reason),'-') INTO r
    FROM public.password_reset_requests WHERE user_id='11111111-1111-1111-1111-111111111111';
  IF r <> '1|pending|auto' THEN
    RAISE EXCEPTION 'T-B2 FALHOU: esperado ''1|pending|auto'', obtido %', r;
  END IF;
  RAISE NOTICE 'T-B2 OK: o pedido nasceu pending, do proprio usuario, com o motivo';
END $$;

-- ---------------------------------------------------------------------------
-- T-B3/T-B4 — o cliente NÃO forja status/revisão/token: o gatilho segue sendo a fronteira.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','11111111-1111-1111-1111-111111111111','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.password_reset_requests
    (user_id, email, reason, status, reviewed_by, reviewed_at, rejection_reason, token_expires_at)
  VALUES ('11111111-1111-1111-1111-111111111111','ti.existente@example.com','forja','approved',
          '11111111-1111-1111-1111-111111111111', now(), 'aprovado por mim', now());
  RESET ROLE;
  RAISE NOTICE 'T-B3 OK: logado tenta forjar status/revisao/token no proprio pedido';
END $$;

DO $$
DECLARE r text;
BEGIN
  SELECT count(*)::text||'|'||(count(*) FILTER (WHERE status='pending'))::text
       ||'|'||(count(*) FILTER (WHERE reviewed_by IS NULL))::text
       ||'|'||(count(*) FILTER (WHERE reviewed_at IS NULL AND rejection_reason IS NULL))::text
       ||'|'||(count(*) FILTER (WHERE token_expires_at IS NULL))::text
    INTO r
    FROM public.password_reset_requests
   WHERE user_id='11111111-1111-1111-1111-111111111111' AND reason='forja';
  IF r <> '1|1|1|1|1' THEN
    RAISE EXCEPTION 'T-B4 FALHOU: a linha forjada nao nasceu pending e limpa (obtido %)', r;
  END IF;
  RAISE NOTICE 'T-B4 OK: a linha nasceu pending e limpa (sanitizacao preservada)';
END $$;

-- ---------------------------------------------------------------------------
-- T-B5/T-B6 — rate limit canônico preservado (3 pendentes por hora).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','11111111-1111-1111-1111-111111111111','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.password_reset_requests (user_id, email, reason)
  VALUES ('11111111-1111-1111-1111-111111111111','ti.existente@example.com','terceiro');
  RESET ROLE;
  RAISE NOTICE 'T-B5 OK: terceiro pedido pendente do mesmo usuario ainda passa';
END $$;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','11111111-1111-1111-1111-111111111111','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.password_reset_requests (user_id, email, reason)
    VALUES ('11111111-1111-1111-1111-111111111111','ti.existente@example.com','quarto');
    RAISE EXCEPTION 'T-B6 FALHOU: o quarto pedido pendente na hora NAO foi barrado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Too many pending reset requests%' THEN
      RAISE EXCEPTION 'T-B6 FALHOU: erro inesperado do rate limit (%)', SQLERRM;
    END IF;
  END;
  RESET ROLE;
  RAISE NOTICE 'T-B6 OK: o quarto pedido pendente na hora e barrado pelo rate limit do banco';
END $$;

-- ---------------------------------------------------------------------------
-- T-B7/T-B8 — caminho SEM sessão segue o comportamento anterior deste cartão: a função devolve
--             NEW. Usa service_role apenas para atravessar RLS e exercitar o gatilho sem
--             auth.uid(); se houvesse lookup/canonicalização em auth.users, email e status
--             seriam sobrescritos.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE service_role;
  INSERT INTO public.password_reset_requests (user_id, email, reason, status, token_expires_at)
  VALUES ('22222222-2222-2222-2222-222222222222','  outro.usuario@EXAMPLE.com  ',
          'sem sessao inalterado','approved', now() + interval '30 minutes');
  RESET ROLE;
  RAISE NOTICE 'T-B7 OK: sem sessao o gatilho devolve NEW sem lookup em auth.users';
END $$;

DO $$
DECLARE r text;
BEGIN
  SELECT count(*)::text||'|'||coalesce(min(email),'-')||'|'||coalesce(min(status),'-')
       ||'|'||(count(*) FILTER (WHERE token_expires_at IS NOT NULL))::text
    INTO r
    FROM public.password_reset_requests WHERE reason='sem sessao inalterado';
  IF r <> '1|  outro.usuario@EXAMPLE.com  |approved|1' THEN
    RAISE EXCEPTION 'T-B8 FALHOU: email/status/token_expires_at nao permaneceram como enviados (%)', r;
  END IF;
  RAISE NOTICE 'T-B8 OK: email/status/token_expires_at permanecem como enviados';
END $$;

-- ---------------------------------------------------------------------------
-- T-B9 — regra do repo: função de gatilho sem EXECUTE para os papéis da API.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r text;
BEGIN
  SELECT (has_function_privilege('anon','public.sanitize_reset_request()','EXECUTE'))::int::text
       ||'|'||(has_function_privilege('authenticated','public.sanitize_reset_request()','EXECUTE'))::int::text
    INTO r;
  IF r <> '0|0' THEN
    RAISE EXCEPTION 'T-B9 FALHOU: o gatilho concede EXECUTE a anon/authenticated (%)', r;
  END IF;
  RAISE NOTICE 'T-B9 OK: gatilho sem EXECUTE para anon nem authenticated (e portanto nem via PUBLIC)';
END $$;

-- ---------------------------------------------------------------------------
-- T-R1/T-R2 — o Rollback declarado no cabeçalho executa (só com -v rollback=<arquivo>).
-- ---------------------------------------------------------------------------
\if :{?rollback}
  \i :rollback
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','11111111-1111-1111-1111-111111111111','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.password_reset_requests (user_id, email, reason)
    VALUES ('11111111-1111-1111-1111-111111111111','ti.existente@example.com','rollback');
    RAISE EXCEPTION 'T-R1 FALHOU: o rollback NAO restaurou o corpo anterior que cita reset_token';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%has no field "reset_token"%' THEN
      RAISE EXCEPTION 'T-R1 FALHOU: erro inesperado apos o rollback (%)', SQLERRM;
    END IF;
  END;
  RESET ROLE;
  RAISE NOTICE 'T-R1 OK: rollback restaura o corpo anterior que ainda cita reset_token';
END $$;

DO $$
DECLARE r text;
BEGIN
  SELECT (has_function_privilege('anon','public.sanitize_reset_request()','EXECUTE'))::int::text
       ||'|'||(has_function_privilege('authenticated','public.sanitize_reset_request()','EXECUTE'))::int::text
    INTO r;
  IF r <> '0|0' THEN
    RAISE EXCEPTION 'T-R2 FALHOU: o rollback reabriu EXECUTE a anon/authenticated (%)', r;
  END IF;
  RAISE NOTICE 'T-R2 OK: rollback preserva REVOKE para anon/authenticated';
END $$;
\else
DO $$ BEGIN
  RAISE NOTICE 'T-R1/T-R2 PULADOS: bloco Rollback fora do alcance deste arquivo — passe -v rollback=<sql extraido do cabecalho da migration> para exercita-lo';
END $$;
\endif

-- ---------------------------------------------------------------------------
-- T-B12 — reaplicação idempotente da migration volta ao estado corrigido.
-- ---------------------------------------------------------------------------
DELETE FROM public.password_reset_requests;
\if :{?sem_migration}
\else
  \i :mig
\endif
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','11111111-1111-1111-1111-111111111111','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.password_reset_requests (user_id, email, reason)
  VALUES ('11111111-1111-1111-1111-111111111111','ti.existente@example.com','reaplicado');
  RESET ROLE;
  RAISE NOTICE 'T-B12 OK: reaplicar a migration volta a permitir o pedido autenticado';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'recuperacao_gatilho_sem_coluna_removida: TODAS as assercoes passaram';
END $$;

ROLLBACK;
