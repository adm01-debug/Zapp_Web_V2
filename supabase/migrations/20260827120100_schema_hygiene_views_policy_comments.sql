-- Etapas 93, 94, 96 do plano da auditoria de 27/08/2026.
-- Aplicado no destino em 27/08/2026.

-- ── Etapa 93 · padroniza security_invoker nas views ──────────────────────────
-- Achado A-10: 3 views usavam =true e 4 usavam =on. Semanticamente identicos,
-- mas a inconsistencia quebra grep e auditoria automatizada.
ALTER VIEW public.gmail_accounts_safe          SET (security_invoker = true);
ALTER VIEW public.channel_connections_safe     SET (security_invoker = true);
ALTER VIEW public.whatsapp_connections_agent   SET (security_invoker = true);
ALTER VIEW public.password_reset_requests_safe SET (security_invoker = true);

-- ── Etapa 94 · unica tabela com RLS sem policy de INSERT nem ALL ─────────────
-- link_preview_cache_metrics e alimentada pelo cron cleanup-link-preview-cache,
-- que roda como SECURITY DEFINER e passava por bypass de owner (postgres).
-- Funcionava, mas por acidente. Esta policy torna a intencao explicita.
DROP POLICY IF EXISTS "service_role inserts cache metrics" ON public.link_preview_cache_metrics;
CREATE POLICY "service_role inserts cache metrics"
  ON public.link_preview_cache_metrics FOR INSERT TO service_role WITH CHECK (true);

-- ── Etapa 96 · marca as funcoes orfas (achado A-06) ─────────────────────────
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[
      'decrypt_gmail_token','encrypt_gmail_token','fn_list_audio_meme_categories',
      'get_channel_credentials_safe','get_connection_instance','get_connection_qr_code',
      'get_own_lockout_status','get_own_reset_requests','get_profile_role_for_check',
      'get_reset_requests_safe','is_country_allowed','is_country_blocked',
      'is_ip_blocked','is_ip_whitelisted','validate_reset_token'])
  LOOP
    EXECUTE format('COMMENT ON FUNCTION %s IS %L', r.sig,
      'ORFA em 2026-08-27: sem .rpc() no app, sem trigger, policy, cron ou view que a chame. Ver docs/audits/AUDITORIA_MIGRACAO_DB_2026-08-27.md achado A-06. Nao remover sem aprovacao.');
  END LOOP;
END
$do$;

-- mask_channel_credentials NAO foi anexada como trigger (etapa 67 do plano).
-- Motivo: o corpo e um no-op (RETURN NEW) e uma trigger BEFORE nao consegue
-- mascarar coluna em SELECT. Anexa-la criaria falsa sensacao de seguranca.
COMMENT ON FUNCTION public.mask_channel_credentials() IS
'NO-OP verificado em 2026-08-27. Retorna NEW sem alterar nada e NAO esta anexada a nenhuma trigger. Trigger BEFORE nao consegue mascarar em SELECT - o proprio corpo admite isso. A protecao real de channel_connections.credentials e a policy RLS "Admins full access to channels" mais a view channel_connections_safe (que omite a coluna). Anexar esta funcao como trigger criaria falsa sensacao de seguranca. Decidir entre implementar mascaramento real ou remover. Ver A-06.';

COMMENT ON FUNCTION public.mcp_exec(text, integer) IS
'Infra do gateway MCP. Executa SQL arbitrario, SECURITY DEFINER. EXECUTE restrito a postgres e service_role desde a migration 20260827000100. Nao conceder a authenticated/anon/PUBLIC.';
COMMENT ON FUNCTION public.mcp_exec_many(text[], integer) IS
'Infra do gateway MCP. Executa SQL arbitrario em lote, SECURITY DEFINER. EXECUTE restrito a postgres e service_role desde a migration 20260827000100. Nao conceder a authenticated/anon/PUBLIC.';
