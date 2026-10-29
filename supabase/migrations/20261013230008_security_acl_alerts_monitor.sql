-- security_acl_alerts_monitor
-- Rollback: desagenda o cron 'security-acl-score', remove a função public.score_security_acl() e a tabela public.security_acl_alerts (os alertas gravados se perdem).
-- Rollback (SQL executável, na ordem):
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'security-acl-score';
--   DROP FUNCTION IF EXISTS public.score_security_acl();
--   DROP TABLE IF EXISTS public.security_acl_alerts;
--
-- Cartão t_9dce259e — monitor de regressão de permissão (ACL/RLS), 1x por hora.
-- A V3 é referência (fn_score_security_acl + zapp.security_acl_alerts); aqui o
-- contrato é o da V2 e casa com o painel do cartão filho t_5a2073e0:
--   tabela public.security_acl_alerts — id, alert_type (tipo), object_name
--   (objeto), details (detalhe, SEM dado pessoal), severity (severidade),
--   detected_at (criada_em), resolved_at (resolvida_em), resolved_by,
--   role_name + privilege (identidade do alerta aberto).
--
-- Idempotência: o índice único PARCIAL (só linhas abertas) sobre
-- (alert_type, object_name, role_name, privilege) faz o INSERT ... ON CONFLICT
-- DO NOTHING não repetir alerta ABERTO; quando a violação some, a linha é
-- resolvida (resolved_at) e uma reincidência gera alerta NOVO (id novo).
--
-- O que a função vigia (tudo em public):
--   1. SECURITY DEFINER com EXECUTE para anon ou PUBLIC (CRITICAL)
--   2. SECURITY DEFINER sem search_path fixo (HIGH)
--   3. tabela sem ROW LEVEL SECURITY (CRITICAL)
--   4. policy de ESCRITA (INSERT/UPDATE/DELETE/ALL) com USING(true) ou
--      WITH CHECK(true) para authenticated (HIGH)
--   5. bucket de storage público (listável por anon) (HIGH)
--
-- Sem dado pessoal no details: só nome de objeto, papel e privilégio.

-- ── Tabela de alertas ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.security_acl_alerts (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alert_type   text NOT NULL,
  object_name  text NOT NULL,
  role_name    text NOT NULL DEFAULT '-',
  privilege    text NOT NULL DEFAULT '-',
  severity     text NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  resolved_by  text
);

-- Um alerta ABERTO por violação (a chave do alerta aberto).
CREATE UNIQUE INDEX IF NOT EXISTS security_acl_alerts_aberto_uidx
  ON public.security_acl_alerts (alert_type, object_name, role_name, privilege)
  WHERE resolved_at IS NULL;

-- Leitura do painel: abertos primeiro, mais recentes primeiro.
CREATE INDEX IF NOT EXISTS security_acl_alerts_leitura_idx
  ON public.security_acl_alerts (resolved_at, detected_at DESC);

-- ── RLS: só admin lê; ninguém escreve pela API (só a função definer) ──────────
ALTER TABLE public.security_acl_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_acl_alerts FROM PUBLIC;
REVOKE ALL ON public.security_acl_alerts FROM anon, authenticated;
GRANT SELECT ON public.security_acl_alerts TO authenticated, service_role;

DROP POLICY IF EXISTS "Admins veem alertas de ACL" ON public.security_acl_alerts;
CREATE POLICY "Admins veem alertas de ACL" ON public.security_acl_alerts
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- ── Monitor ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.score_security_acl()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tipos text[] := ARRAY[
    'SECDEF_ANON_EXECUTE', 'SECDEF_SEM_SEARCH_PATH', 'TABELA_SEM_RLS',
    'POLICY_ESCRITA_LIBERADA', 'BUCKET_PUBLICO'
  ];
  v_novos int := 0;
  v_resolvidos int := 0;
BEGIN
  -- Achados desta rodada (temp, some no fim da transação).
  DROP TABLE IF EXISTS pg_temp._acl_achados;
  CREATE TEMP TABLE _acl_achados (
    alert_type  text,
    object_name text,
    role_name   text,
    privilege   text,
    severity    text,
    details     jsonb
  ) ON COMMIT DROP;

  -- 1. SECURITY DEFINER em public com EXECUTE para anon/PUBLIC.
  INSERT INTO _acl_achados
  SELECT 'SECDEF_ANON_EXECUTE',
         p.oid::regprocedure::text,
         CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE r.rolname END,
         'EXECUTE', 'CRITICAL',
         jsonb_build_object('tipo', 'funcao_security_definer', 'schema', n.nspname)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  LEFT JOIN pg_roles r ON r.oid = a.grantee
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND p.prokind = 'f'
    AND a.privilege_type = 'EXECUTE'
    AND (a.grantee = 0 OR r.rolname = 'anon');

  -- 2. SECURITY DEFINER sem search_path fixo.
  INSERT INTO _acl_achados
  SELECT 'SECDEF_SEM_SEARCH_PATH',
         p.oid::regprocedure::text, '-', '-', 'HIGH',
         jsonb_build_object('tipo', 'funcao_security_definer', 'schema', n.nspname)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND p.prokind = 'f'
    AND NOT EXISTS (
      SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) c
      WHERE c LIKE 'search_path=%'
    );

  -- 3. Tabela comum (não de extensão) sem RLS.
  INSERT INTO _acl_achados
  SELECT 'TABELA_SEM_RLS',
         n.nspname || '.' || c.relname, '-', '-', 'CRITICAL',
         jsonb_build_object('tipo', 'tabela', 'schema', n.nspname)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT c.relrowsecurity
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e');

  -- 4. Policy de ESCRITA permissiva (USING(true) / WITH CHECK(true)) p/ authenticated.
  INSERT INTO _acl_achados
  SELECT 'POLICY_ESCRITA_LIBERADA',
         pp.schemaname || '.' || pp.tablename || ' [' || pp.cmd || ']',
         'authenticated', pp.cmd, 'HIGH',
         jsonb_build_object(
           'tipo', 'policy', 'policy', pp.policyname,
           'forma', CASE WHEN coalesce(pp.qual, '') ~* '^\s*true\s*$'
                         THEN 'USING(true)' ELSE 'WITH CHECK(true)' END
         )
  FROM pg_policies pp
  WHERE pp.schemaname = 'public'
    AND pp.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    AND pg_catalog.array_position(pp.roles, 'authenticated') IS NOT NULL
    AND (coalesce(pp.qual, '') ~* '^\s*true\s*$' OR coalesce(pp.with_check, '') ~* '^\s*true\s*$');

  -- 5. Bucket de storage público (listável por anon). Dinâmico: o schema
  --    storage pode não existir em banco de teste.
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO _acl_achados
      SELECT 'BUCKET_PUBLICO', b.name, 'anon', 'READ', 'HIGH',
             jsonb_build_object('tipo', 'bucket', 'bucket_id', b.id)
      FROM storage.buckets b
      WHERE b.public IS TRUE
    $q$;
  END IF;

  -- Grava só o que ainda não está aberto (não repete alerta aberto).
  INSERT INTO public.security_acl_alerts (alert_type, object_name, role_name, privilege, severity, details)
  SELECT DISTINCT ON (alert_type, object_name, role_name, privilege)
         alert_type, object_name, role_name, privilege, severity, details
  FROM _acl_achados
  ORDER BY alert_type, object_name, role_name, privilege, severity
  ON CONFLICT (alert_type, object_name, role_name, privilege) WHERE resolved_at IS NULL
  DO NOTHING;
  GET DIAGNOSTICS v_novos = ROW_COUNT;

  -- Resolve o que voltou ao normal (não está mais nos achados).
  UPDATE public.security_acl_alerts a
     SET resolved_at = now(),
         resolved_by = 'score_security_acl'
   WHERE a.resolved_at IS NULL
     AND a.alert_type = ANY (v_tipos)
     AND NOT EXISTS (
       SELECT 1 FROM _acl_achados f
       WHERE f.alert_type = a.alert_type
         AND f.object_name = a.object_name
         AND f.role_name = a.role_name
         AND f.privilege = a.privilege
     );
  GET DIAGNOSTICS v_resolvidos = ROW_COUNT;

  RETURN jsonb_build_object(
    'achados', (SELECT count(*) FROM _acl_achados),
    'novos', v_novos,
    'resolvidos', v_resolvidos,
    'abertos', (SELECT count(*) FROM public.security_acl_alerts WHERE resolved_at IS NULL),
    'criticos_abertos', (SELECT count(*) FROM public.security_acl_alerts WHERE resolved_at IS NULL AND severity = 'CRITICAL'),
    'executado_em', now()
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.score_security_acl() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.score_security_acl() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.score_security_acl() TO service_role;

-- ── Agendamento: 1x por hora (:23) ───────────────────────────────────────────
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'security-acl-score';

SELECT cron.schedule(
  'security-acl-score',
  '23 * * * *',
  $cron$SELECT public.score_security_acl()$cron$
);
