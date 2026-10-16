-- ═══════════════════════════════════════════════════════════════════════════
-- INV-LIVE — guarda GERAL de invariantes do banco vivo (Zapp Web V2)
-- ═══════════════════════════════════════════════════════════════════════════
-- Reune, numa so passada fail-closed sobre o catalogo, os invariantes que hoje
-- so tinham guarda parcial (ou nenhuma) no db-live-guard:
--
--   (1) RLS  — toda tabela/particao de public com ROW LEVEL SECURITY ligada;
--   (2) VIEW — toda view de public com security_invoker (on|true|yes|1);
--   (3) MV   — nenhuma matview de public legivel por anon/authenticated;
--   (4) SECD — toda funcao SECURITY DEFINER de public com search_path fixo;
--   (5) POL  — nenhuma policy de ESCRITA com USING(true)/WITH CHECK(true) para
--              authenticated/PUBLIC fora da allowlist documentada abaixo;
--   (6) REF  — funcoes de public e comandos de cron.job que citam public.<algo>
--              inexistente (funcao/tabela/view/matview/particao/foreign table).
--
-- Motivacao: o estado medido em 12/10/2026 esta limpo para RLS, security_invoker,
-- search_path de SECURITY DEFINER e exposicao de matview (as policies de escrita
-- abertas DELIBERADAS — department_invites — estao na allowlist abaixo). Mas cada um destes furos
-- ja aconteceu em algum momento e o unico portao que sobrava era o GRANT. Casos
-- reais: talkx_campaign_metrics perdeu security_invoker DUAS vezes
-- (20260916170000, 20260928410000) e regrediu porque CREATE OR REPLACE VIEW zera
-- reloptions; matview nao aceita ENABLE ROW LEVEL SECURITY e vaza quando o GRANT
-- fica aberto; `create or replace` com parametro novo cria uma identidade com o
-- ACL padrao (EXECUTE para PUBLIC) e com search_path herdado do chamador.
--
-- Por que LIVE e nao grep: a pergunta e "o objeto esta protegido HOJE?", e ela
-- so tem resposta no catalogo — o GRANT/ALTER pode vir de default privileges,
-- restauracao ou concessao manual, nunca do texto de uma migration.
--
-- ESCOPO: schema public (as tabelas do app vivem nele). Nao cobre outros
-- schemas do mesmo Postgres (auth, storage, extensions, cron, vault, ...): tem
-- outros donos. As particoes entram (relkind 'p') porque filha NAO herda RLS do
-- pai; foreign tables ('f') ficam de fora (nao aceitam ENABLE RLS).
--
-- ALLOWLIST de escrita (invariante 5): cada entrada e "<tabela>: <policy>", sem
-- schema (o escopo e public). So entra policy de escrita aberta DELIBERADA e
-- documentada. `service_role` nao conta (tem BYPASSRLS por desenho). Hoje:
--   department_invites: dept_invites_insert_authenticated
--   department_invites: dept_invites_delete_authenticated
-- Motivo: nasceram de proposito em 20260927520000_add_department_rls_policies.sql
-- (convite/gestao de departamento por qualquer autenticado) e foram mantidas na
-- revisao de team-chat (20260928460000 revogou so o anon). A allowlist e POR POLICY:
-- nova policy aberta na MESMA tabela continua reprovando.
--
-- Uso (banco vivo, no db-live-guard):
--   node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 \
--     -f scripts/db-audit/check-live-invariants.sql
-- Local, contra a copia descartavel:
--   zapp-db-local psql <copia> <nome> < scripts/db-audit/check-live-invariants.sql
-- Prova de que a guarda nao e vacua e nem frouxa:
--   scripts/db-audit/check-live-invariants.test.sh
--
-- Read-only: apenas SELECT em catalogos e cron.job. Nada e alterado.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
SET search_path TO pg_catalog;

DO $inv_live$
DECLARE
  -- Allowlist documentada do invariante (5): "<tabela>: <policy>", sem schema.
  v_allowlist_escrita constant text[] := ARRAY[
    'department_invites: dept_invites_insert_authenticated',
    'department_invites: dept_invites_delete_authenticated'
  ];

  v_tabelas integer;
  v_views   integer;
  v_secdef  integer;
  v_faltas  text;
BEGIN
  -- ── Escopo / fail-closed contra alvo errado ────────────────────────────────
  IF to_regrole('anon') IS NULL OR to_regrole('authenticated') IS NULL THEN
    RAISE EXCEPTION 'INV-LIVE: role anon/authenticated ausente neste banco (alvo errado?)';
  END IF;

  SELECT count(*) INTO v_tabelas
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r','p');
  IF v_tabelas = 0 THEN
    RAISE EXCEPTION 'INV-LIVE: nenhuma tabela em public (alvo errado? resultado vazio NAO e aprovacao)';
  END IF;

  SELECT count(*) INTO v_views
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v';
  IF v_views = 0 THEN
    RAISE EXCEPTION 'INV-LIVE: nenhuma view em public (alvo errado? o invariante 2 ficaria vazio)';
  END IF;

  SELECT count(*) INTO v_secdef
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef;
  IF v_secdef = 0 THEN
    RAISE EXCEPTION 'INV-LIVE: nenhuma funcao SECURITY DEFINER em public (alvo errado? o invariante 4 ficaria vazio)';
  END IF;

  -- ── (1) RLS ligada em toda tabela/particao de public ───────────────────────
  SELECT string_agg(format('public.%s', c.relname), E'\n  ' ORDER BY c.relname)
    INTO v_faltas
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity;
  IF v_faltas IS NOT NULL THEN
    RAISE EXCEPTION E'INV-LIVE (RLS): tabela(s) de public sem ROW LEVEL SECURITY:\n  %', v_faltas
      USING HINT = 'Ligue a RLS na MESMA migration que cria/entrega a tabela: ALTER TABLE public.<tabela> ENABLE ROW LEVEL SECURITY. Sem isso, policy alguma protege e so sobra o GRANT.';
  END IF;

  -- ── (2) security_invoker em toda view de public ────────────────────────────
  SELECT string_agg(format('public.%s', c.relname), E'\n  ' ORDER BY c.relname)
    INTO v_faltas
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v'
     AND NOT coalesce(array_to_string(c.reloptions, ','), '') ~ 'security_invoker=(on|true|yes|1)';
  IF v_faltas IS NOT NULL THEN
    RAISE EXCEPTION E'INV-LIVE (VIEW): view(s) de public sem security_invoker:\n  %', v_faltas
      USING HINT = 'View sem security_invoker roda com os direitos do DONO (BYPASSRLS) e ignora a RLS da base. Use CREATE VIEW ... WITH (security_invoker = true) ou ALTER VIEW public.<view> SET (security_invoker = true). ATENCAO: CREATE OR REPLACE VIEW zera reloptions.';
  END IF;

  -- ── (3) nenhuma matview de public legivel por anon/authenticated ───────────
  SELECT string_agg(format('public.%s (anon=%s, authenticated=%s)', c.relname,
                           has_table_privilege('anon', c.oid, 'SELECT'),
                           has_table_privilege('authenticated', c.oid, 'SELECT')),
                    E'\n  ' ORDER BY c.relname)
    INTO v_faltas
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'm'
     AND (has_table_privilege('anon', c.oid, 'SELECT')
          OR has_table_privilege('authenticated', c.oid, 'SELECT'));
  IF v_faltas IS NOT NULL THEN
    RAISE EXCEPTION E'INV-LIVE (MV): matview(s) de public legivel(is) por anon/authenticated:\n  %', v_faltas
      USING HINT = 'matview nao aceita ENABLE ROW LEVEL SECURITY. REVOKE ALL ON public.<mv> FROM PUBLIC, anon, authenticated e exponha por service_role, por view com security_invoker ou por RPC.';
  END IF;

  -- ── (4) search_path fixo em toda SECURITY DEFINER de public ────────────────
  SELECT string_agg(p.oid::regprocedure::text, E'\n  ' ORDER BY p.oid::regprocedure::text)
    INTO v_faltas
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
     AND (p.proconfig IS NULL
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'));
  IF v_faltas IS NOT NULL THEN
    RAISE EXCEPTION E'INV-LIVE (SECDEF): funcao SECURITY DEFINER de public sem search_path fixo:\n  %', v_faltas
      USING HINT = 'SECURITY DEFINER sem search_path resolve nomes com o caminho do chamador (ataque de search_path). Adicione SET search_path = public, pg_temp na assinatura.';
  END IF;

  -- ── (5) policy de ESCRITA aberta (USING/WITH CHECK true) para authenticated ─
  WITH pol AS (
    SELECT c.relname,
           p.polname,
           format('%s: %s', c.relname, p.polname)                 AS chave,
           coalesce(pg_get_expr(p.polqual, p.polrelid), 'false')      AS using_expr,
           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), 'false') AS check_expr,
           EXISTS (
             SELECT 1 FROM unnest(p.polroles) r
              WHERE r = 0  -- PUBLIC
                 OR pg_has_role('authenticated', r, 'USAGE')  -- inclui heranca por GRANT role
           ) AS applies_to_authenticated
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND p.polcmd IN ('a','w','d','*')  -- INSERT/UPDATE/DELETE/ALL
  )
  SELECT string_agg(format('public.%s: policy %s (using=%s, check=%s)', relname, polname, using_expr, check_expr),
                    E'\n  ' ORDER BY relname, polname)
    INTO v_faltas
    FROM pol
   WHERE applies_to_authenticated
     AND (using_expr = 'true' OR check_expr = 'true')
     AND chave <> ALL (v_allowlist_escrita);
  IF v_faltas IS NOT NULL THEN
    RAISE EXCEPTION E'INV-LIVE (POL): policy de escrita aberta (true) para authenticated/PUBLIC:\n  %', v_faltas
      USING HINT = 'Policy de escrita USING(true)/WITH CHECK(true) deixa qualquer autenticado escrever a tabela inteira. Restrinja por dono/organizacao (ex.: user_id = auth.uid()) ou, se for deliberado, documente "<tabela>: <policy>" na v_allowlist_escrita deste arquivo.';
  END IF;

  -- ── (6a) referencia pendurada: funcao de public -> public.<algo> inexistente ─
  -- Remove comentario de linha e literais de texto antes de casar 'public.<nome>(',
  -- para documentacao antiga e strings nao gerarem falso positivo.
  WITH fns AS (
    SELECT p.oid::regprocedure::text AS caller,
           regexp_replace(
             regexp_replace(p.prosrc, '--[^\n]*', '', 'g'),
             $re$'(''|[^'])*'$re$, '', 'g') AS body
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.prolang IN (SELECT oid FROM pg_language WHERE lanname IN ('plpgsql','sql'))
       AND p.prosrc IS NOT NULL
  ),
  calls AS (
    SELECT DISTINCT f.caller, m[1] AS callee
      FROM fns f, LATERAL regexp_matches(f.body, 'public\s*\.\s*([a-z_][a-z0-9_]*)\s*\(', 'g') AS m
  ),
  pendentes AS (
    SELECT c.caller, c.callee
      FROM calls c
     WHERE NOT EXISTS (SELECT 1 FROM pg_proc p
                        WHERE p.proname = c.callee AND p.pronamespace = 'public'::regnamespace)
       AND NOT EXISTS (SELECT 1 FROM pg_class x
                        WHERE x.relname = c.callee AND x.relnamespace = 'public'::regnamespace
                          AND x.relkind IN ('r','v','m','p','f'))
  )
  SELECT string_agg(format('%s -> public.%s (inexistente)', caller, callee), E'\n  ' ORDER BY caller, callee)
    INTO v_faltas FROM pendentes;
  IF v_faltas IS NOT NULL THEN
    RAISE EXCEPTION E'INV-LIVE (REF): funcao de public cita objeto inexistente:\n  %', v_faltas
      USING HINT = 'Corrija o nome ou crie o objeto. Referencia pendurada so quebra em runtime, quando o caminho for exercitado.';
  END IF;

  -- ── (6b) referencia pendurada: comando de cron.job -> public.<algo> inexistente
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'INV-LIVE (REF): schema cron ausente — referencia de cron nao verificada neste alvo';
  ELSE
    WITH calls AS (
      SELECT DISTINCT j.jobname, m[1] AS fn
        FROM cron.job j, LATERAL regexp_matches(
               regexp_replace(j.command, '--[^\n]*', '', 'g'),
               'public\s*\.\s*([a-z_][a-z0-9_]*)\s*\(', 'g') AS m
    ),
    pendentes AS (
      SELECT c.jobname, c.fn
        FROM calls c
       WHERE NOT EXISTS (SELECT 1 FROM pg_proc p
                          WHERE p.proname = c.fn AND p.pronamespace = 'public'::regnamespace)
         AND NOT EXISTS (SELECT 1 FROM pg_class x
                          WHERE x.relname = c.fn AND x.relnamespace = 'public'::regnamespace)
    )
    SELECT string_agg(format('cron %s -> public.%s (inexistente)', jobname, fn), E'\n  ' ORDER BY jobname, fn)
      INTO v_faltas FROM pendentes;
    IF v_faltas IS NOT NULL THEN
      RAISE EXCEPTION E'INV-LIVE (REF): comando de cron.job cita funcao/objeto inexistente:\n  %', v_faltas
        USING HINT = 'O job vai falhar toda execucao. Corrija o comando (cron.alter_job) ou crie o objeto.';
    END IF;
  END IF;

  RAISE NOTICE 'INV-LIVE OK — % tabela(s) com RLS, % view(s) com security_invoker, % SECURITY DEFINER com search_path, 0 matview exposta, 0 policy de escrita aberta, 0 referencia pendurada.',
               v_tabelas, v_views, v_secdef;
END
$inv_live$;
