-- ============================================================================
-- Banco/seguranca (HZ2-003) — cartao t_205d934e
-- "RPC sentiment_trend: serie diaria de sentimento no servidor (Dashboard)."
--
-- O QUE PROVA (criterio de pronto do cartao):
--   A) public.sentiment_trend(p_days) devolve 30 linhas para 1500 analises em
--      30 dias, e a soma dos `total` = 1500 (o defeito medido era o PostgREST
--      cortar em 1000 linhas e a janela parar nas MAIS ANTIGAS: os dias mais
--      novos nunca apareciam);
--   B) baldes canonicos e `media` REAL de sentiment_score, conferidos contra a
--      contagem direta da tabela (baseline do superusuario); `critico` conta
--      como NEGATIVO (regra IA-SENTIMENT-001); `media`/`indice` NULOS no dia
--      sem amostra — nunca 0 nem 50 inventados;
--   C) a serie tem EXATAMENTE p_days dias de calendario em America/Sao_Paulo,
--      incluindo hoje, e nao corta por volume;
--   D) SECURITY INVOKER de verdade: agente sem acesso a conversa NAO conta o
--      que nao ve (a soma dele e exatamente a dos contatos que a RLS deixa
--      passar); admin soma tudo; agente sem contato soma 0;
--   E) entrada invalida (nulo, <1, >366) RECUSADA com 22023;
--   F) ACL: EXECUTE so para authenticated; anon e service_role negados (42501).
--
-- COMO A PROTECAO ENTRA NO TESTE (nada de copiar a RPC para dentro do arquivo):
-- a superficie minima (roles, schema auth, tabelas de ambiente e o predicado de
-- visibilidade de contatos) e criada a mao — e ambiente, nao contrato; a tabela
-- conversation_analyses, a policy de SELECT e a propria RPC vem VERBATIM das
-- migrations reais via `\i`:
--   20251222170958 -> conversation_analyses (colunas reais + RLS + grants)
--   20260930140000 -> policy de SELECT usando is_contact_visible_to_user
--   20261015221500 -> a RPC desta entrega
-- O predicado de visibilidade segue o mesmo contrato da suite irma
-- scripts/db-audit/ai-read-policies-queue-scope.test.sh (admin OU atribuicao OU
-- fila, exigindo _user_id = auth.uid()).
--
-- ENFORCEMENT como PAPEL REAL: as assercoes rodam com `SET LOCAL ROLE
-- authenticated/anon/service_role` + JWT sintetico em request.jwt.claims — o
-- caminho do PostgREST, nunca como postgres (que ignora RLS/GRANT). O helper
-- confere que current_user e de fato o papel pedido; se nao pegasse, o teste
-- FALHA em vez de dar verde.
--
-- COMO RODA (PostgreSQL 17 descartavel; o repo e montado somente-leitura):
--   docker run --rm -d --name zapp-sent-trend -e POSTGRES_PASSWORD=test_only \
--     -v "$PWD:/repo:ro" postgres:17-alpine
--   docker exec -i zapp-sent-trend psql -X -v ON_ERROR_STOP=1 -U postgres \
--     -d postgres -v repo=/repo -v mig_dir=/repo/supabase/migrations \
--     < supabase/tests/sentiment_trend.sql
--   docker rm -f zapp-sent-trend
--
-- VERMELHO (o teste falha quando a correcao nao esta la): acrescente
--   -v sem_funcao=1. Com sem_funcao a migration desta entrega NAO e aplicada,
--   entao a RPC nao existe e a 1a assercao de comportamento quebra com 42883
--   (undefined_function). Nada persiste: o arquivo termina em ROLLBACK.
--
-- TODO o arquivo roda numa unica transacao que termina em ROLLBACK: idempotente,
-- sem efeito colateral e reaplicavel.
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?mig_dir}
\else
  \set mig_dir supabase/migrations
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- SUPERFICIE MINIMA (ambiente, nao contrato)
-- ---------------------------------------------------------------------------
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
       nullif(current_setting('request.jwt.claim.sub', true), '')
     ), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE TABLE public.queues (id uuid PRIMARY KEY);
CREATE TABLE public.queue_members (
  queue_id uuid NOT NULL REFERENCES public.queues(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  is_active boolean NOT NULL,
  PRIMARY KEY (queue_id, profile_id)
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  phone text NOT NULL,
  assigned_to uuid REFERENCES public.profiles(id),
  queue_id uuid REFERENCES public.queues(id)
);
CREATE TABLE public.agent_visibility_grants (
  agent_id uuid NOT NULL REFERENCES public.profiles(id),
  can_see_agent_id uuid NOT NULL REFERENCES public.profiles(id),
  PRIMARY KEY (agent_id, can_see_agent_id)
);
CREATE TABLE public.ai_conversation_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  tag_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Predicado de visibilidade de contatos: mesmo contrato do real
-- (admin OU atribuicao/carteira concedida OU fila ativa), exigindo
-- _user_id = auth.uid() — sem impersonacao.
CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT profile.id FROM public.profiles profile
        WHERE _user_id = auth.uid() AND profile.user_id = _user_id LIMIT 1 $$;
CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT profile.id FROM public.profiles profile
        WHERE _user_id = auth.uid() AND profile.user_id = _user_id
        UNION
        SELECT visibility.can_see_agent_id
        FROM public.agent_visibility_grants AS visibility
        JOIN public.profiles AS viewer ON viewer.id = visibility.agent_id
        WHERE _user_id = auth.uid() AND viewer.user_id = _user_id $$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles ur
                       WHERE ur.user_id = _user_id
                         AND ur.role IN ('admin','supervisor')) $$;
CREATE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT _user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.contacts AS contact
          WHERE contact.id = _contact_id
            AND (
              public.is_admin_or_supervisor(_user_id)
              OR contact.assigned_to IN (SELECT public.get_visible_agent_ids(_user_id))
              OR EXISTS (SELECT 1 FROM public.queue_members AS member
                         WHERE member.queue_id = contact.queue_id
                           AND member.profile_id = public.get_profile_id_for_user(_user_id)
                           AND member.is_active = true)
            )
        ) $$;

-- Tabela real conversation_analyses (colunas, RLS, indices e policies base).
\i :mig_dir/20251222170958_bbee0ce2-8225-4290-9b92-23a6abef22b5.sql

-- Estado fiel ao banco: a policy permissiva historica `Users can view analyses`
-- (USING true) foi removida na cadeia real (20260315114854) e trocada por uma
-- policy que decide por contato. Sem isso a RLS seria no-op e o teste passaria
-- por engano.
DROP POLICY "Users can view analyses" ON public.conversation_analyses;
DROP POLICY "Users can insert analyses" ON public.conversation_analyses;

-- Estado ANTERIOR (fiel ao banco): policy de SELECT estreita, so contato
-- ATRIBUIDO ou admin. Serve de pre-requisito para a migration real substitui-la.
CREATE POLICY "Authenticated users can view analyses" ON public.conversation_analyses
  FOR SELECT TO authenticated
  USING (
    contact_id IN (
      SELECT c.id FROM public.contacts c
      WHERE c.assigned_to IN (
        SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
      )
    )
    OR public.is_admin_or_supervisor(auth.uid())
  );
CREATE POLICY "Authenticated can view ai tags" ON public.ai_conversation_tags
  FOR SELECT TO authenticated
  USING (
    contact_id IN (
      SELECT c.id FROM public.contacts c
      WHERE c.assigned_to IN (
        SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
      )
    )
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- Migration real da policy de SELECT (alinhada a is_contact_visible_to_user).
\i :mig_dir/20260930140000_align_ai_read_policies_with_contact_visibility.sql

-- A RPC desta entrega (pulada no modo VERMELHO com -v sem_funcao=1).
\if :{?sem_funcao}
\else
  \i :mig_dir/20261015221500_sentiment_trend_rpc.sql
\endif

-- Grants de producao: a RLS (nao o GRANT) e quem limita a leitura.
GRANT SELECT ON public.contacts TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.conversation_analyses TO authenticated, anon, service_role;
GRANT SELECT ON public.profiles TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_contact_visible_to_user(uuid, uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_visible_agent_ids(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_profile_id_for_user(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- HELPERS DE ASSERCAO (temp; default EXECUTE para PUBLIC)
-- ---------------------------------------------------------------------------
CREATE FUNCTION pg_temp.assert_eq(label text, expected text, actual text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF expected IS DISTINCT FROM actual THEN
    RAISE EXCEPTION 'FALHOU [%]: esperado %, obtido %', label, expected, actual;
  END IF;
  RAISE NOTICE 'PASS [%]', label;
END $$;

CREATE FUNCTION pg_temp.assert_role(label text, expected text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user <> expected THEN
    RAISE EXCEPTION 'FALHOU [%]: current_user=% (esperado %)', label, current_user, expected;
  END IF;
  RAISE NOTICE 'PASS [%] (current_user=%)', label, current_user;
END $$;

CREATE FUNCTION pg_temp.expect_state(label text, sql text, expected_state text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE sql;
    RAISE EXCEPTION 'FALHOU [%]: deveria falhar com % mas passou', label, expected_state;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected_state THEN
      RAISE NOTICE 'PASS [%] (SQLSTATE % = %)', label, SQLSTATE, SQLERRM;
    ELSE
      RAISE EXCEPTION 'FALHOU [%]: esperado %, obtido % (%)', label, expected_state, SQLSTATE, SQLERRM;
    END IF;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- FIXTURES (como postgres, dono das tabelas: RLS nao se aplica aqui)
-- ---------------------------------------------------------------------------
INSERT INTO public.profiles (id, user_id, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', true), -- ADMIN
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', true), -- AGENTE A
  ('c0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', true), -- AGENTE B
  ('d0000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', true); -- AGENTE C (sem contato)
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin');

INSERT INTO public.contacts (id, phone, assigned_to, queue_id) VALUES
  ('e1000000-0000-0000-0000-000000000001', '5511900000011', 'b0000000-0000-0000-0000-000000000001', NULL), -- VISIVEL p/ A
  ('e1000000-0000-0000-0000-000000000002', '5511900000012', 'c0000000-0000-0000-0000-000000000001', NULL); -- INVISIVEL p/ A

-- 1500 analises em 30 dias de calendario (50 por dia, ao MEIO-DIA de SP),
-- datadas do dia de hoje para tras. As 40 primeiras ficam no contato VISIVEL.
INSERT INTO public.conversation_analyses (contact_id, analyzed_by, summary, sentiment, sentiment_score, created_at)
SELECT
  (CASE WHEN g <= 40
        THEN 'e1000000-0000-0000-0000-000000000001'
        ELSE 'e1000000-0000-0000-0000-000000000002' END)::uuid,
  'b0000000-0000-0000-0000-000000000001',
  'analise ' || g,
  (ARRAY['positivo','neutro','negativo','critico'])[(g % 4) + 1],
  CASE (g % 4) WHEN 0 THEN 85 WHEN 1 THEN 50 WHEN 2 THEN 20 ELSE 10 END,
  (((now() at time zone 'America/Sao_Paulo')::date - ((g - 1) % 30))::timestamp
    + interval '12 hours') at time zone 'America/Sao_Paulo'
FROM generate_series(1, 1500) AS g;

-- Variaveis de janela (SP, incluindo hoje) usadas nas baseline e assercoes.
SELECT ((now() at time zone 'America/Sao_Paulo')::date)::text AS hoje \gset
SELECT ((now() at time zone 'America/Sao_Paulo')::date - 29)::timestamp at time zone 'America/Sao_Paulo' AS ini \gset
SELECT ((now() at time zone 'America/Sao_Paulo')::date + 1)::timestamp at time zone 'America/Sao_Paulo' AS fim \gset

-- Baseline do superusuario (a verdade da tabela, sem passar pela RPC).
SELECT count(*)::text AS b_dias,
       coalesce(sum(total), 0)::text AS b_total,
       coalesce(sum(positivos), 0)::text AS b_pos,
       coalesce(sum(neutros), 0)::text AS b_neu,
       coalesce(sum(negativos), 0)::text AS b_neg
FROM (
  SELECT (created_at at time zone 'America/Sao_Paulo')::date AS dia,
         count(*)::int AS total,
         count(*) filter (where sentiment = 'positivo')::int AS positivos,
         count(*) filter (where sentiment = 'neutro')::int AS neutros,
         count(*) filter (where sentiment in ('negativo','critico'))::int AS negativos
  FROM public.conversation_analyses
  WHERE created_at >= :'ini' AND created_at < :'fim'
  GROUP BY 1
) t \gset
SELECT coalesce(round(avg(sentiment_score)::numeric, 2), -1)::text AS b_media_hoje
FROM public.conversation_analyses
WHERE (created_at at time zone 'America/Sao_Paulo')::date = :'hoje' \gset
SELECT count(*)::text AS a_total
FROM public.conversation_analyses a
JOIN public.contacts c ON c.id = a.contact_id
WHERE c.assigned_to = 'b0000000-0000-0000-0000-000000000001'
  AND a.created_at >= :'ini' AND a.created_at < :'fim' \gset

-- ---------------------------------------------------------------------------
-- F) ACL — definicao e privilegios (como postgres, antes de trocar de papel)
-- ---------------------------------------------------------------------------
SELECT (prosecdef = false)::text AS f_invoker,  -- SECURITY INVOKER => prosecdef = false
       has_function_privilege('authenticated', 'public.sentiment_trend(integer)', 'EXECUTE')::text AS f_auth,
       has_function_privilege('anon',          'public.sentiment_trend(integer)', 'EXECUTE')::text AS f_anon,
       has_function_privilege('service_role',  'public.sentiment_trend(integer)', 'EXECUTE')::text AS f_svc
FROM pg_proc WHERE oid = 'public.sentiment_trend(integer)'::regprocedure \gset
SELECT pg_temp.assert_eq('F1 SECURITY INVOKER', 'true', :'f_invoker');
SELECT pg_temp.assert_eq('F2 EXECUTE para authenticated', 'true', :'f_auth');
SELECT pg_temp.assert_eq('F3 EXECUTE negado a anon', 'false', :'f_anon');
SELECT pg_temp.assert_eq('F4 EXECUTE negado a service_role', 'false', :'f_svc');

-- ---------------------------------------------------------------------------
-- ADMIN: soma tudo (A, B, C)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_role('R0 admin', 'authenticated');

SELECT count(*)::text AS d_dias,
       coalesce(sum(total), 0)::text AS d_total,
       coalesce(sum(positivos), 0)::text AS d_pos,
       coalesce(sum(neutros), 0)::text AS d_neu,
       coalesce(sum(negativos), 0)::text AS d_neg,
       (SELECT media::text FROM public.sentiment_trend(30) WHERE dia = :'hoje') AS d_media_hoje
FROM public.sentiment_trend(30) \gset

SELECT pg_temp.assert_eq('A1 30 linhas para 30 dias', :'b_dias', :'d_dias');
SELECT pg_temp.assert_eq('A2 1500 analises somam 1500', :'b_total', :'d_total');
SELECT pg_temp.assert_eq('A3 total = 1500', '1500', :'d_total');
SELECT pg_temp.assert_eq('B1 balde positivo == baseline', :'b_pos', :'d_pos');
SELECT pg_temp.assert_eq('B2 balde neutro == baseline', :'b_neu', :'d_neu');
SELECT pg_temp.assert_eq('B3 balde negativo (critico incluso) == baseline', :'b_neg', :'d_neg');
SELECT pg_temp.assert_eq('B4 media do dia de hoje == baseline', :'b_media_hoje', :'d_media_hoje');
SELECT pg_temp.assert_eq('B5 media e real (2 casas)',
  (SELECT round(avg(sentiment_score)::numeric, 2)::text FROM public.conversation_analyses
   WHERE (created_at at time zone 'America/Sao_Paulo')::date = :'hoje'), :'d_media_hoje');

-- C) serie de p_days baldes: 35 dias => 35 linhas, 5 vazias no comeco, soma 1500
SELECT count(*)::text AS e_linhas,
       coalesce(sum(total), 0)::text AS e_total,
       count(*) filter (where total = 0 and media is null and indice is null)::text AS e_vazios,
       min(dia)::text AS e_primeiro,
       max(dia)::text AS e_ultimo
FROM public.sentiment_trend(35) \gset
SELECT pg_temp.assert_eq('C1 35 dias => 35 baldes', '35', :'e_linhas');
SELECT pg_temp.assert_eq('C2 soma segue 1500 (sem corte)', '1500', :'e_total');
SELECT pg_temp.assert_eq('C3 5 dias vazios com media/indice NULOS', '5', :'e_vazios');
SELECT pg_temp.assert_eq('C4 ultimo dia e hoje', :'hoje', :'e_ultimo');
SELECT pg_temp.assert_eq('C5 primeiro dia = hoje-34', ((:'hoje')::date - 34)::text, :'e_primeiro');

-- dia sem amostra: media/indice NULL, total 0, indice NULL (nao -1)
SELECT pg_temp.assert_eq('B6 dia vazio: indice NULO (nao 0)',
  'true', (SELECT (media is null and indice is null and total = 0)::text
        FROM public.sentiment_trend(35) WHERE total = 0 LIMIT 1));

-- E) entrada invalida RECUSADA com 22023
SELECT pg_temp.expect_state('E1 p_days = 0 recusado', 'SELECT count(*) FROM public.sentiment_trend(0)', '22023');
SELECT pg_temp.expect_state('E2 p_days = 367 recusado', 'SELECT count(*) FROM public.sentiment_trend(367)', '22023');
SELECT pg_temp.expect_state('E3 p_days = NULL recusado', 'SELECT count(*) FROM public.sentiment_trend(NULL)', '22023');
SELECT pg_temp.assert_eq('E4 p_days = 1 => 1 balde', '1', (SELECT count(*)::text FROM public.sentiment_trend(1)));

-- ---------------------------------------------------------------------------
-- AGENTE B: sem acesso a nada (os contatos sao de A/B, ele nao tem contato)
-- ---------------------------------------------------------------------------
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_role('R1 agente C', 'authenticated');
SELECT count(*)::text AS g_linhas, coalesce(sum(total), 0)::text AS g_total
FROM public.sentiment_trend(30) \gset
SELECT pg_temp.assert_eq('D1 serie segue com 30 baldes', '30', :'g_linhas');
SELECT pg_temp.assert_eq('D2 agente sem contato soma 0 (nao ve nada)', '0', :'g_total');

-- ---------------------------------------------------------------------------
-- AGENTE A: so os contatos que a RLS deixa passar (SECURITY INVOKER)
-- ---------------------------------------------------------------------------
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_role('R2 agente A', 'authenticated');
SELECT count(*)::text AS h_linhas, coalesce(sum(total), 0)::text AS h_total
FROM public.sentiment_trend(30) \gset
SELECT pg_temp.assert_eq('D3 agente A soma exatamente o que ve', :'a_total', :'h_total');
SELECT pg_temp.assert_eq('D4 visao de A (40) < total real (1500)', 'true', ((:'h_total')::int < 1500)::text);
SELECT pg_temp.assert_eq('D5 serie de A ainda tem 30 baldes', '30', :'h_linhas');
-- no dia de hoje A so ve as linhas do contato dele
SELECT pg_temp.assert_eq('D6 dia de hoje de A == linhas visiveis de hoje',
  (SELECT count(*)::text FROM public.conversation_analyses a
   JOIN public.contacts c ON c.id = a.contact_id
   WHERE c.assigned_to = 'b0000000-0000-0000-0000-000000000001'
     AND (a.created_at at time zone 'America/Sao_Paulo')::date = :'hoje'
     AND a.created_at >= :'ini' AND a.created_at < :'fim'),
  (SELECT total::text FROM public.sentiment_trend(30) WHERE dia = :'hoje'));

-- ---------------------------------------------------------------------------
-- ANON e SERVICE_ROLE: negados (42501)
-- ---------------------------------------------------------------------------
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE anon;
SELECT pg_temp.assert_role('R3 anon', 'anon');
SELECT pg_temp.expect_state('F5 anon negado na chamada',
  'SELECT count(*) FROM public.sentiment_trend(30)', '42501');

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_role('R4 service_role', 'service_role');
SELECT pg_temp.expect_state('F6 service_role negado na chamada',
  'SELECT count(*) FROM public.sentiment_trend(30)', '42501');

RESET ROLE;

DO $$
BEGIN
  RAISE NOTICE 'HZ2-003 OK: sentiment_trend (SECURITY INVOKER) devolve a serie diaria de p_days baldes em America/Sao_Paulo (1500 analises/30 dias somam 1500, sem corte de linhas), baldes canonicos com critico como negativo, media real de sentiment_score e NULL no dia vazio; agente conta so o que a RLS deixa; admin conta tudo; entrada invalida recusada (22023); EXECUTE so para authenticated.';
END $$;

ROLLBACK;
