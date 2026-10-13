-- audit_log_summary
-- Rollback: remove as DUAS RPCs de leitura criadas por esta migration; ela nao cria/nao altera tabela, coluna, policy, gatilho, dado nem GRANT de tabela — so CREATE FUNCTION — entao o inverso executavel e o DROP das funcoes, na ordem abaixo.
-- Rollback (SQL executavel, na ordem):
--   DROP FUNCTION IF EXISTS public.audit_log_list(timestamptz, timestamptz, timestamptz, uuid, integer);
--   DROP FUNCTION IF EXISTS public.audit_log_summary(timestamptz, timestamptz);
--
-- Auditoria de seguranca (paridade V3, frente SH) — as duas leituras que a tela
-- de auditoria (src/components/security/AuditLogDashboard.tsx) precisa e que hoje
-- so existem como consulta direta a public.audit_logs:
--   1) um RESUMO AGREGADO por periodo (totais e KPIs), para o card nao baixar
--      milhares de linhas so para somar no cliente — e o "NaN" que a tela mostra
--      hoje quando o resumo nao tem de onde vir;
--   2) uma LISTA paginada por CURSOR com o NOME do autor, porque audit_logs
--      guarda so o user_id e o nome mora em public.profiles; paginar por
--      (created_at, id) evita a linha pulada/repetida do OFFSET quando alguem
--      grava durante a navegacao.
--
-- CONTROLE DE ACESSO — o mesmo do SELECT de audit_logs: SO ADMIN.
-- A policy vigente e "Only admins can view audit logs" (migration
-- 20260404173036_2283ae7a: USING public.has_role(auth.uid(), 'admin')), nao
-- is_admin_or_supervisor. As duas funcoes sao SECURITY DEFINER (por isso ignoram
-- a RLS e leem a tabela), logo a barreira tem de estar DENTRO delas: quem nao e
-- admin recebe ZERO LINHAS (fail-closed), igual a policy. Nao ha oraculo: a
-- resposta de um usuario sem papel e a MESMA (conjunto vazio) para qualquer que
-- seja o periodo passado.
--
-- SEMANTICA DOS KPIs (janelas ancoradas no FIM do periodo, p_to):
--   denied_24h              acoes que significam "acesso negado": 'unauthorized_access'
--                           (gravada por ProtectedRoute ao barrar rota) e
--                           'role_auto_provision_denied' (signup fail-closed). As demais
--                           negativas que o SH1 vai gravar entram aqui quando existirem;
--                           hoje a tabela so tem essas duas, entao o card devolve o real.
--   permission_changes_24h  'role_granted' / 'role_revoked' / 'role_changed' — o
--                           vocabulario vigente do gatilho audit_role_changes.
--   admin_logins_7d         acoes 'login' de usuario com papel admin em user_roles.
--   rls_failures_24h        'rls_denied' / 'rls_policy_violation'. AINDA nao existe
--                           quem grave essas acoes no V2 (nao ha auditoria de negativa
--                           de RLS); o card devolve 0 e o relato registra isso.
--   sensitive_actions       espelha isSensitiveAction() do front, que e a ORIGEM do
--                           numero na tela: comeca com 'role_' OU contem 'delete' OU
--                           'export' OU 'role_change'. Mantido identico para a tela e o
--                           banco nunca discordarem do mesmo numero.
--
-- Migration ADITIVA: so CREATE FUNCTION + GRANT de EXECUTE nas funcoes novas.
-- Nao ha CREATE/ALTER/DROP de tabela, coluna, indice, policy, gatilho nem DML;
-- nada no objeto public.audit_logs muda, entao o historico e os demais leitores
-- da tabela ficam intactos.

CREATE OR REPLACE FUNCTION public.audit_log_summary(
  p_from timestamptz DEFAULT NULL,
  p_to   timestamptz DEFAULT NULL
)
 RETURNS TABLE(
   total_logs            bigint,
   sensitive_actions     bigint,
   unique_users          bigint,
   denied_24h            bigint,
   permission_changes_24h bigint,
   admin_logins_7d       bigint,
   rls_failures_24h      bigint
 )
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_to   timestamptz := COALESCE(p_to, now());
  v_from timestamptz := COALESCE(p_from, COALESCE(p_to, now()) - interval '30 days');
BEGIN
  -- Barreira de acesso: SO admin, o mesmo de "Only admins can view audit logs".
  -- Sem admin (inclusive anon, com uid NULL) devolve ZERO linhas, sem distinguir
  -- caso existente de inexistente.
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN;
  END IF;

  -- Periodo invertido (entrada invalida) nao vira erro 500: vira conjunto vazio.
  IF v_from > v_to THEN
    v_from := v_to;
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.audit_logs a
      WHERE a.created_at >= v_from AND a.created_at < v_to),
    (SELECT count(*) FROM public.audit_logs a
      WHERE a.created_at >= v_from AND a.created_at < v_to
        AND (strpos(a.action, 'role_') = 1
             OR strpos(a.action, 'delete') > 0
             OR strpos(a.action, 'export') > 0
             OR strpos(a.action, 'role_change') > 0)),
    (SELECT count(DISTINCT a.user_id) FROM public.audit_logs a
      WHERE a.created_at >= v_from AND a.created_at < v_to AND a.user_id IS NOT NULL),
    (SELECT count(*) FROM public.audit_logs a
      WHERE a.created_at >= v_to - interval '24 hours' AND a.created_at < v_to
        AND a.action IN ('unauthorized_access', 'role_auto_provision_denied')),
    (SELECT count(*) FROM public.audit_logs a
      WHERE a.created_at >= v_to - interval '24 hours' AND a.created_at < v_to
        AND a.action IN ('role_granted', 'role_revoked', 'role_changed')),
    (SELECT count(*) FROM public.audit_logs a
      WHERE a.created_at >= v_to - interval '7 days' AND a.created_at < v_to
        AND a.action = 'login'
        AND EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = a.user_id AND ur.role = 'admin')),
    (SELECT count(*) FROM public.audit_logs a
      WHERE a.created_at >= v_to - interval '24 hours' AND a.created_at < v_to
        AND a.action IN ('rls_denied', 'rls_policy_violation'));
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_log_list(
  p_from      timestamptz DEFAULT NULL,
  p_to        timestamptz DEFAULT NULL,
  p_cursor    timestamptz DEFAULT NULL,
  p_cursor_id uuid        DEFAULT NULL,
  p_limit     integer     DEFAULT 50
)
 RETURNS TABLE(
   id          uuid,
   created_at  timestamptz,
   user_id     uuid,
   actor_name  text,
   action      text,
   entity_type text,
   entity_id   uuid,
   details     jsonb,
   ip_address  text,
   user_agent  text
 )
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_to    timestamptz := COALESCE(p_to, now());
  v_from  timestamptz := COALESCE(p_from, COALESCE(p_to, now()) - interval '30 days');
  v_limit integer     := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
BEGIN
  -- Mesma barreira do resumo: so admin, e fail-closed (ZERO linhas para os demais).
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN;
  END IF;

  IF v_from > v_to THEN
    v_from := v_to;
  END IF;

  RETURN QUERY
  SELECT a.id, a.created_at, a.user_id,
         p.name AS actor_name,
         a.action, a.entity_type, a.entity_id, a.details, a.ip_address, a.user_agent
  FROM public.audit_logs a
  LEFT JOIN public.profiles p ON p.user_id = a.user_id
  WHERE a.created_at >= v_from AND a.created_at < v_to
    -- Paginacao por CURSOR (created_at, id) DESC: so a pagina seguinte.
    -- Cursor incompleto (sem id) e ignorado de proposito, para nao devolver
    -- pagina vazia por um parametro mal formado.
    AND (p_cursor IS NULL OR p_cursor_id IS NULL
         OR (a.created_at, a.id) < (p_cursor, p_cursor_id))
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT v_limit;
END;
$function$;

-- Permissao pela assinatura EXATA (um overload novo nasce fechado por padrao).
-- REVOKE explicito de PUBLIC/anon e GRANT so a authenticated (o guard interno
-- restringe a admin) e service_role (uso interno/servidor).
REVOKE ALL ON FUNCTION public.audit_log_summary(timestamptz, timestamptz)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.audit_log_list(timestamptz, timestamptz, timestamptz, uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_log_summary(timestamptz, timestamptz)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.audit_log_list(timestamptz, timestamptz, timestamptz, uuid, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.audit_log_summary(timestamptz, timestamptz) IS
  'Resumo agregado de audit_logs por periodo (admin-only). Totais do periodo + KPIs (denied_24h, permission_changes_24h, admin_logins_7d, rls_failures_24h) ancorados em p_to. Fail-closed: nao-admin recebe 0 linhas.';
COMMENT ON FUNCTION public.audit_log_list(timestamptz, timestamptz, timestamptz, uuid, integer) IS
  'Lista paginada de audit_logs por periodo (admin-only) com actor_name de profiles e paginacao por cursor (created_at, id) DESC. Fail-closed: nao-admin recebe 0 linhas.';
