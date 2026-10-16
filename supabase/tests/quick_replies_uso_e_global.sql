-- Paridade V3 -> V2 do doc 06-features-inbox-hooks — respostas rapidas (PH-10):
-- uso contado para todos + resposta global so por papel.
-- ============================================================================
-- PROVA DE ENFORCEMENT COM PAPEL REAL (agent / supervisor / admin / anon /
-- service_role), em PostgreSQL 17 DESCARTÁVEL (local, nunca producao).
--
-- O QUE ESTE ARQUIVO PROVA (o contrato de supabase/migrations/
-- 20261013235906_quick_replies_uso_e_global.sql):
--   * increment_quick_reply_use soma o uso de resposta GLOBAL de outro usuario
--     (antes o UPDATE direto alcancava 0 linhas SEM erro);
--   * so conta linha VISIVEL ao chamador (dono OU is_global);
--   * atendente comum NAO cria/torna global (is_global so por admin/supervisor);
--   * anon e service_role NAO executam a RPC (EXECUTE so authenticated);
--   * contar uso NAO mexe em updated_at; editar de verdade mexe.
--
-- COMO RODA (o repo e montado somente-leitura; o banco nasce do zero):
--   docker run --rm -d --name zapp-ph10-qr-$$ -e POSTGRES_PASSWORD=test_only \
--     -v "$PWD:/repo:ro" postgres:17-alpine
--   docker exec -i zapp-ph10-qr-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig_dir=/repo/supabase/migrations \
--     < supabase/tests/quick_replies_uso_e_global.sql
--   docker rm -f zapp-ph10-qr-$$
--
-- VERMELHO (prova que a correcao e o que faz passar): acrescente `-v sem_guarda=1`.
--   Com sem_guarda a migration NAO e aplicada — as asserções de comportamento
--   falham (a RPC nao existe). Tudo roda numa transacao que termina em ROLLBACK:
--   idempotente e sem efeito colateral.
--
-- A superficie minima (roles, schema auth, user_roles, helpers e o ESTADO VIVO de
-- message_templates) e criada a mao — e ambiente/fixture, reproduzido fiel ao
-- banco de 13/10/2026. A PROTECAO testada vem VERBATIM do arquivo de migration
-- real, via `\i` (mesmo padrao de user_roles_troca_de_papel_autorizacao_e_auditoria.sql).
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?mig_dir}
\else
  \set mig_dir supabase/migrations
\endif

BEGIN;

-- ── Superficie minima (ambiente; o contrato vem da migration logo abaixo) ────
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO anon, authenticated, service_role;

CREATE TABLE auth.users (id uuid PRIMARY KEY);

-- user_roles + is_admin_or_supervisor: byte a byte de
-- 20251215025014_fcc5bc79 (linhas 1-42) — o mesmo helper das demais policies.
CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'agent',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;

-- update_updated_at_column: byte a byte de 20251215024517 (linhas 188-194).
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- message_templates: colunas de 20251215160224 e as 4 policies do ESTADO VIVO
-- (20260317222728, TO authenticated). Reproduzido aqui como fixture fiel.
CREATE TABLE public.message_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  shortcut TEXT,
  category TEXT DEFAULT 'general',
  is_global BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their templates and global ones" ON public.message_templates
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_global = true);
CREATE POLICY "Users can create their own templates" ON public.message_templates
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own templates" ON public.message_templates
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can delete their own templates" ON public.message_templates
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_message_templates_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- GRANT de tabela do PostgREST: e ele que faz a RLS ser a UNICA barreira.
-- O anon TEM os grants de tabela no banco real (relation_grants do schema-manifest.json:
-- SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN para anon). Sem esse GRANT
-- aqui o B10b mediria "permission denied" (defeito de fixture) em vez do enforcement real da
-- RLS: com as 4 policies TO authenticated, o anon AUTENTICADO como anon ve 0 linhas.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO service_role;
GRANT SELECT ON public.user_roles TO authenticated, service_role;

-- ── Usuarios e papeis (fixtures) ────────────────────────────────────────────
CREATE FUNCTION pg_temp.seed() RETURNS void LANGUAGE plpgsql AS $h$
BEGIN
  DELETE FROM public.message_templates;
  DELETE FROM public.user_roles;
  DELETE FROM auth.users;

  INSERT INTO auth.users (id) VALUES
    ('11111111-1111-1111-1111-11111111111a'),  -- ADMIN
    ('44444444-4444-4444-4444-44444444444d'),  -- SUPERVISOR
    ('22222222-2222-2222-2222-22222222222b'),  -- AGENTE
    ('99999999-9999-9999-9999-99999999999e');  -- SEM PAPEL (so anon/sem role)

  INSERT INTO public.user_roles (user_id, role) VALUES
    ('11111111-1111-1111-1111-11111111111a', 'admin'),
    ('44444444-4444-4444-4444-44444444444d', 'supervisor'),
    ('22222222-2222-2222-2222-22222222222b', 'agent');

  INSERT INTO public.message_templates (id, user_id, title, content, is_global, use_count, updated_at) VALUES
    ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-11111111111a', 'Global do admin',  'oi',  true,  5, now() - interval '1 hour'),  -- GLOBAL de OUTRO
    ('a2000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-22222222222b', 'Global do agente', 'oi2', true,  2, now() - interval '1 hour'),  -- GLOBAL do proprio agente (legado)
    ('b1000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-22222222222b', 'Minha resposta',   'oi3', false, 0, now() - interval '1 hour'),  -- PROPRIA do agente
    ('b2000000-0000-0000-0000-000000000004', '44444444-4444-4444-4444-44444444444d', 'Do supervisor',    'oi4', false, 1, now() - interval '1 hour');  -- ALHEIA nao-global
END $h$;

-- ── Helpers do proprio teste ────────────────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'PH-10 FALHOU [%]: esperado %, obtido %', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

CREATE FUNCTION pg_temp.espera_erro(p_label text, p_atual text, p_sqlstate text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS NULL OR p_atual NOT LIKE 'ERRO ' || p_sqlstate || ' %' THEN
    RAISE EXCEPTION 'PH-10 FALHOU [%]: esperava erro SQLSTATE %, veio: %', p_label, p_sqlstate, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

-- Roda p_sql sob o PAPEL REAL (SET LOCAL ROLE) com o JWT do p_uid.
CREATE FUNCTION pg_temp.operacao(p_papel text, p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v_ret text; v_n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_papel)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  IF current_user <> p_papel THEN
    RAISE EXCEPTION 'PH-10 FALHOU: papel real nao aplicado (current_user=%)', current_user;
  END IF;
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_ret := 'OK ' || v_n;
  EXCEPTION WHEN OTHERS THEN
    v_ret := 'ERRO ' || SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  RETURN v_ret;
END $h$;

-- Um unico valor, lido sob o PAPEL REAL (controles de leitura e o retorno da RPC).
CREATE FUNCTION pg_temp.valor(p_papel text, p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_papel)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := 'ERRO ' || SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  RETURN v;
END $h$;

SELECT pg_temp.seed();

-- ============================================================================
-- BLOCO A — ESTADO VIVO (antes da migration): o defeito existe
-- ============================================================================
\echo
\echo '── BLOCO A: estado vivo antes da migration (o defeito) ────────────────'

-- A1 — atendente comum CRIA uma resposta global (defeito b)
SELECT pg_temp.espera('A1 atendente comun cria resposta GLOBAL (defeito)',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$INSERT INTO public.message_templates (user_id, title, content, is_global)
         VALUES ('22222222-2222-2222-2222-22222222222b', 'global indevida', 'x', true)$sql$),
  'OK 1');

-- A2 — incrementar o uso de uma GLOBAL de OUTRO: 0 linhas, sem erro (defeito a)
SELECT pg_temp.espera('A2 incrementar GLOBAL de outro alcanca 0 linhas (defeito)',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$UPDATE public.message_templates SET use_count = use_count + 1
         WHERE id = 'a1000000-0000-0000-0000-000000000001'$sql$),
  'OK 0');
SELECT pg_temp.espera('A2b o uso da global de outro NAO subiu',
  (SELECT use_count::text FROM public.message_templates WHERE id = 'a1000000-0000-0000-0000-000000000001'), '5');

-- ── A correcao: a migration REAL, verbatim ─────────────────────────────────
\if :{?sem_guarda}
  \echo '  [sem_guarda] a migration NAO e aplicada (modo vermelho)'
\else
  \echo '── aplicando a migration real (20261013235906) ────────────────────────'
  \i :mig_dir/20261013235906_quick_replies_uso_e_global.sql
\endif

SELECT pg_temp.seed();   -- reseta as fixtures antes do bloco verde

-- ============================================================================
-- BLOCO B — DEPOIS da migration: uso contado e global so por papel
-- ============================================================================
\echo
\echo '── BLOCO B: uso contado para todos e is_global so por papel ───────────'

\if :{?sem_guarda}
\else
  -- Estrutura da funcao: SECURITY DEFINER, search_path fixo, EXECUTE so authenticated.
  SELECT pg_temp.espera('E1 RPC e SECURITY DEFINER',
    (SELECT (pg_get_functiondef('public.increment_quick_reply_use(uuid)'::regprocedure) LIKE '%SECURITY DEFINER%')::text), 'true');
  SELECT pg_temp.espera('E2 RPC fixa search_path',
    (SELECT (pg_get_functiondef('public.increment_quick_reply_use(uuid)'::regprocedure) LIKE '%SET search_path%')::text), 'true');
  SELECT pg_temp.espera('E3 authenticated executa a RPC',
    has_function_privilege('authenticated', 'public.increment_quick_reply_use(uuid)', 'EXECUTE')::text, 'true');
  SELECT pg_temp.espera('E4 anon NAO executa a RPC',
    has_function_privilege('anon', 'public.increment_quick_reply_use(uuid)', 'EXECUTE')::text, 'false');
  SELECT pg_temp.espera('E5 service_role NAO executa a RPC (nada exposto)',
    has_function_privilege('service_role', 'public.increment_quick_reply_use(uuid)', 'EXECUTE')::text, 'false');
  SELECT pg_temp.espera('E6 gatilho de preservacao de updated_at existe',
    (SELECT count(*)::text FROM pg_trigger
      WHERE tgrelid = 'public.message_templates'::regclass
        AND tgname = 'zz_message_templates_preserve_updated_at' AND NOT tgisinternal), '1');
\endif

-- B1 — GLOBAL de outro CONTA o uso (o defeito a), via RPC atomica
SELECT pg_temp.espera('B1 agente conta uso da GLOBAL de outro (retorno true)',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.increment_quick_reply_use('a1000000-0000-0000-0000-000000000001')::text$sql$),
  'true');
SELECT pg_temp.espera('B1b uso da global de outro subiu 5 -> 6',
  (SELECT use_count::text FROM public.message_templates WHERE id = 'a1000000-0000-0000-0000-000000000001'), '6');

-- B2 — a PROPRIA resposta continua contando (caso legitimo preservado)
SELECT pg_temp.espera('B2 agente conta uso da propria resposta (retorno true)',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.increment_quick_reply_use('b1000000-0000-0000-0000-000000000003')::text$sql$),
  'true');
SELECT pg_temp.espera('B2b uso da propria subiu 0 -> 1',
  (SELECT use_count::text FROM public.message_templates WHERE id = 'b1000000-0000-0000-0000-000000000003'), '1');

-- B3 — resumo atomico: 3 chamadas = +3 exato (server-side, sem ler-e-somar)
SELECT pg_temp.espera('B3 chamada extra 1', pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
  $sql$SELECT public.increment_quick_reply_use('b1000000-0000-0000-0000-000000000003')::text$sql$), 'true');
SELECT pg_temp.espera('B3b chamada extra 2', pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
  $sql$SELECT public.increment_quick_reply_use('b1000000-0000-0000-0000-000000000003')::text$sql$), 'true');
SELECT pg_temp.espera('B3c uso subiu exatamente para 3 (soma no banco)',
  (SELECT use_count::text FROM public.message_templates WHERE id = 'b1000000-0000-0000-0000-000000000003'), '3');

-- B4 — resposta de OUTRO nao-global: nao visivel -> nao conta, retorno false
SELECT pg_temp.espera('B4 agente NAO conta a resposta alheia nao-global (false)',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.increment_quick_reply_use('b2000000-0000-0000-0000-000000000004')::text$sql$),
  'false');
SELECT pg_temp.espera('B4b uso da alheia intacto',
  (SELECT use_count::text FROM public.message_templates WHERE id = 'b2000000-0000-0000-0000-000000000004'), '1');

-- B5 — atendente comum NAO cria global
SELECT pg_temp.espera_erro('B5 atendente comum nao cria resposta GLOBAL',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$INSERT INTO public.message_templates (user_id, title, content, is_global)
         VALUES ('22222222-2222-2222-2222-22222222222b', 'global indevida', 'x', true)$sql$),
  '42501');
SELECT pg_temp.espera('B5b a global indevida nao nasceu',
  (SELECT count(*)::text FROM public.message_templates WHERE title = 'global indevida'), '0');

-- B6 — atendente cria a PROPRIA resposta (nao-global) normalmente
SELECT pg_temp.espera('B6 atendente cria a propria resposta nao-global',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$INSERT INTO public.message_templates (user_id, title, content, is_global)
         VALUES ('22222222-2222-2222-2222-22222222222b', 'minha nova', 'y', false)$sql$),
  'OK 1');

-- B7 — admin e supervisor PODEM criar global
SELECT pg_temp.espera('B7 admin cria global',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$INSERT INTO public.message_templates (user_id, title, content, is_global)
         VALUES ('11111111-1111-1111-1111-11111111111a', 'global do admin', 'z', true)$sql$),
  'OK 1');
SELECT pg_temp.espera('B7b supervisor cria global',
  pg_temp.operacao('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$INSERT INTO public.message_templates (user_id, title, content, is_global)
         VALUES ('44444444-4444-4444-4444-44444444444d', 'global do supervisor', 'w', true)$sql$),
  'OK 1');

-- B8 — atendente NAO transforma a propria resposta em global
SELECT pg_temp.espera_erro('B8 atendente nao torna a propria resposta GLOBAL',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$UPDATE public.message_templates SET is_global = true
         WHERE id = 'b1000000-0000-0000-0000-000000000003'$sql$),
  '42501');
SELECT pg_temp.espera('B8b a resposta propria continua nao-global',
  (SELECT is_global::text FROM public.message_templates WHERE id = 'b1000000-0000-0000-0000-000000000003'), 'false');

-- B9 — atendente edita a propria resposta (titulo/conteudo) sem tocar em is_global
SELECT pg_temp.espera('B9 atendente edita o proprio conteudo',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$UPDATE public.message_templates SET content = 'conteudo novo'
         WHERE id = 'b1000000-0000-0000-0000-000000000003'$sql$),
  'OK 1');

-- B10 — anon: sem EXECUTE e sem ver nada
SELECT pg_temp.espera_erro('B10 anon nao executa a RPC',
  pg_temp.operacao('anon', '99999999-9999-9999-9999-99999999999e',
    $sql$SELECT public.increment_quick_reply_use('a1000000-0000-0000-0000-000000000001')$sql$),
  '42501');
SELECT pg_temp.espera('B10b anon nao ve nenhuma resposta',
  pg_temp.valor('anon', '99999999-9999-9999-9999-99999999999e',
    $sql$SELECT count(*)::text FROM public.message_templates$sql$),
  '0');

-- B11 — contar uso NAO mexe no updated_at; editar de verdade mexe.
-- As duas funcoes leem updated_at COMO O PAPEL REAL, executam a operacao, releem
-- e comparam antes/depois (nada de comparar um valor com ele mesmo).
CREATE FUNCTION pg_temp.conta_e_compara(p_id uuid) RETURNS text LANGUAGE plpgsql AS $h$
DECLARE v_before timestamptz; v_after timestamptz;
BEGIN
  -- O relogio da transacao congela now(): sem zerar o carimbo para um valor conhecidamente
  -- antigo (sem gatilho), antes=depois mesmo se a preservacao NAO existisse. Com o carimbo
  -- antigo, 'igual' so acontece porque o gatilho restaurou old.updated_at.
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.message_templates SET updated_at = now() - interval '1 hour' WHERE id = p_id;
  PERFORM set_config('session_replication_role', 'origin', true);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '22222222-2222-2222-2222-22222222222b', 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT updated_at INTO v_before FROM public.message_templates WHERE id = p_id;
  PERFORM public.increment_quick_reply_use(p_id);
  SELECT updated_at INTO v_after FROM public.message_templates WHERE id = p_id;
  RESET ROLE;
  RETURN CASE WHEN v_before = v_after THEN 'igual' ELSE 'diferente' END;
END $h$;

CREATE FUNCTION pg_temp.edita_e_compara(p_id uuid) RETURNS text LANGUAGE plpgsql AS $h$
DECLARE v_before timestamptz; v_after timestamptz;
BEGIN
  -- Mesmo preparo do conta_e_compara: carimbo antigo sem gatilho, para que 'diferente'
  -- prove que editar conteudo realmente recarimba (e nao apenas o relogio congelado).
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.message_templates SET updated_at = now() - interval '1 hour' WHERE id = p_id;
  PERFORM set_config('session_replication_role', 'origin', true);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '22222222-2222-2222-2222-22222222222b', 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT updated_at INTO v_before FROM public.message_templates WHERE id = p_id;
  UPDATE public.message_templates SET content = content || '!' WHERE id = p_id;
  SELECT updated_at INTO v_after FROM public.message_templates WHERE id = p_id;
  RESET ROLE;
  RETURN CASE WHEN v_before = v_after THEN 'igual' ELSE 'diferente' END;
END $h$;

SELECT pg_temp.espera('B11 contar uso preserva updated_at (antes = depois)',
  pg_temp.conta_e_compara('b1000000-0000-0000-0000-000000000003'), 'igual');
SELECT pg_temp.espera('B11b editar de verdade carimba updated_at (antes <> depois)',
  pg_temp.edita_e_compara('b1000000-0000-0000-0000-000000000003'), 'diferente');

-- B12 — chamada invalida: id nulo recusado
SELECT pg_temp.espera_erro('B12 id nulo recusado',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.increment_quick_reply_use(NULL)$sql$),
  '22023');

-- B13 — id inexistente: false, sem erro
SELECT pg_temp.espera('B13 id inexistente retorna false',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT public.increment_quick_reply_use('c0000000-0000-0000-0000-00000000000f')::text$sql$),
  'false');

-- ============================================================================
-- BLOCO C — cobertura por comando de message_templates (o ponto da recusa).
-- A recusa temia que o OR do WITH CHECK ("... or is_admin_or_supervisor(...)")
-- reabrisse brecha igual a original ("qualquer usuario atualiza o de qualquer
-- outro"). Estes testes provam, com o PAPEL REAL e sobre a migration aplicada
-- verbatim, que o acesso EFETIVO de cada comando continua restrito. A prova e
-- comportamental de proposito: policies permissivas se SOMAM por OR, entao
-- qualquer policy FOR ALL permissiva que existisse (ou chegasse no empilhamento)
-- apareceria aqui como linha alcancada por quem nao deveria.
-- C1-C5 passam antes e depois da migration (o invariante nunca quebrou); a prova
-- de que eles pegam o padrao temido esta na passada de mutacao do relato
-- (USING com OR aberto -> C1/C2 ficam vermelhos). C6 le o schema real aplicado.
-- ============================================================================
\echo
\echo '── BLOCO C: acesso efetivo por comando (FOR ALL incluso) ───────────────'

-- C1 — agente NAO atualiza resposta ALHEIA nao-global (0 linhas, sem erro)
SELECT pg_temp.espera('C1 agente nao atualiza resposta alheia (OK 0)',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$UPDATE public.message_templates SET content = 'invadido'
         WHERE id = 'b2000000-0000-0000-0000-000000000004'$sql$),
  'OK 0');
SELECT pg_temp.espera('C1b conteudo alheio intacto',
  (SELECT content FROM public.message_templates WHERE id = 'b2000000-0000-0000-0000-000000000004'), 'oi4');

-- C2 — agente NAO apaga resposta ALHEIA
SELECT pg_temp.espera('C2 agente nao apaga resposta alheia (OK 0)',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$DELETE FROM public.message_templates
         WHERE id = 'b2000000-0000-0000-0000-000000000004'$sql$),
  'OK 0');
SELECT pg_temp.espera('C2b linha alheia intacta',
  (SELECT count(*)::text FROM public.message_templates WHERE id = 'b2000000-0000-0000-0000-000000000004'), '1');

-- C3 — agente NAO le resposta ALHEIA nao-global
SELECT pg_temp.espera('C3 agente nao le resposta alheia nao-global',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT count(*)::text FROM public.message_templates
         WHERE id = 'b2000000-0000-0000-0000-000000000004'$sql$),
  '0');

-- C4 — agente NAO cria resposta com user_id DE OUTRO
SELECT pg_temp.espera_erro('C4 agente nao cria resposta como outro usuario',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$INSERT INTO public.message_templates (user_id, title, content, is_global)
         VALUES ('44444444-4444-4444-4444-44444444444d', 'falsa', 'x', false)$sql$),
  '42501');

-- C5 — fluxos legitimos preservados: supervisor le global de outro; admin edita a propria
SELECT pg_temp.espera('C5 supervisor le a global de outro',
  pg_temp.valor('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$SELECT count(*)::text FROM public.message_templates
         WHERE id = 'a1000000-0000-0000-0000-000000000001'$sql$),
  '1');
SELECT pg_temp.espera('C5b admin edita a propria global',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$UPDATE public.message_templates SET content = 'oi editado'
         WHERE id = 'a1000000-0000-0000-0000-000000000001'$sql$),
  'OK 1');

-- C6 — estrutural sobre o schema REAL aplicado: nenhuma FOR ALL irrestrita em message_templates
\if :{?sem_guarda}
\else
SELECT pg_temp.espera('C6 nenhuma policy FOR ALL irrestrita em message_templates',
  (SELECT count(*)::text FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'message_templates'
      AND cmd = 'ALL' AND (qual IS NULL OR regexp_replace(qual, '\s+', ' ', 'g') = 'true')), '0');
\endif

\echo
\echo 'PH-10: provas por papel concluidas'
ROLLBACK;
