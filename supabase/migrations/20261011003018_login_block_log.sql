-- login_block_log
-- Rollback: DROP FUNCTION IF EXISTS public.log_login_block(text, text, text, text, text);
--
-- Registra em public.audit_logs cada tentativa de login barrada pela politica de rede
-- (IP/pais) aplicada em auth-login via public.resolve_network_policy (migration
-- 20261004182245_resolve_network_policy_rpc.sql). A RPC nega mas nao grava nada; o registro
-- visivel fica aqui, num unico ponto de escrita.
--
-- Por que reaproveitar audit_logs e nao criar tabela nova: a tabela ja tem action,
-- ip_address, user_agent, created_at e details JSONB — cobre todos os campos que o painel
-- "Bloqueios de login" mostra, com indice idx_audit_logs_action e RLS de leitura so para
-- admin/supervisor. Tabela nova so duplicaria isso. O painel le action = 'login_blocked'.
--
-- O bloqueio acontece ANTES de ler as credenciais (auth-login nao le o body quando nega,
-- coberto por teste), entao o e-mail tentado nao existe nesse ponto e fica NULL — por design.

CREATE OR REPLACE FUNCTION public.log_login_block(
  p_email text,
  p_ip text,
  p_country_code text,
  p_reason text,
  p_user_agent text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reason text;
  v_email text;
  v_country text;
  v_ip text;
  v_ua text;
BEGIN
  v_reason := left(lower(btrim(coalesce(p_reason, ''))), 64);
  IF v_reason = '' THEN
    v_reason := 'unknown';
  END IF;

  v_email := nullif(btrim(coalesce(p_email, '')), '');
  v_country := left(nullif(upper(btrim(coalesce(p_country_code, ''))), ''), 8);
  v_ip := left(nullif(btrim(coalesce(p_ip, '')), ''), 64);
  v_ua := left(nullif(btrim(coalesce(p_user_agent, '')), ''), 512);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details, ip_address, user_agent)
  VALUES (
    NULL,
    'login_blocked',
    'login',
    NULL,
    jsonb_strip_nulls(jsonb_build_object(
      'email', v_email,
      'country_code', v_country,
      'reason', v_reason
    )),
    v_ip,
    v_ua
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.log_login_block(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_login_block(text, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.log_login_block(text, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.log_login_block(text, text, text, text, text) TO service_role;
