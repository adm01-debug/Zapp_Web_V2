-- Fix CRITICAL: merge_brinde_state (SECURITY DEFINER, 20261031110000_copilot_live_helpers.sql)
-- é executável pela role `authenticated` mesmo com `REVOKE ALL ... FROM PUBLIC` na migration
-- original. Causa raiz: o default privilege da role `postgres` no schema `public`
-- (`ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO authenticated, service_role`)
-- concede EXECUTE a `authenticated` automaticamente no CREATE FUNCTION, ANTES do REVOKE/GRANT
-- explícitos da migration rodarem — e REVOKE ALL FROM PUBLIC só remove o grant implícito de
-- PUBLIC, nunca um grant nomeado já concedido a uma role específica.
-- Confirmado em produção: pg_proc.proacl = {postgres=X/postgres, authenticated=X/postgres,
-- service_role=X/postgres} (sem entrada PUBLIC).
--
-- Como a função é SECURITY DEFINER e faz UPDATE direto em public.copilot_sessions sem checar
-- se p_session_id pertence ao chamador, qualquer usuário authenticated pode alterar
-- brinde_state/state_version de QUALQUER sessão, contornando a policy RLS
-- "vendor_own_sessions" (profile_id = auth.uid()) da tabela.
--
-- A função só deve ser chamada pela edge copilot-live com service_role; não é ação de
-- admin/supervisor (não cabe is_admin_or_supervisor) e não há caso de uso legítimo para
-- chamada direta por authenticated. Fecha o acesso revogando explicitamente da role nomeada.
REVOKE EXECUTE ON FUNCTION public.merge_brinde_state(uuid, jsonb, integer) FROM authenticated

COMMENT ON FUNCTION public.merge_brinde_state IS
  'CV-026 — merge atômico do delta B·R·I·N·D·E com otimistic locking por state_version. '
  'EXECUTE restrito a service_role (edge copilot-live); authenticated revogado explicitamente '
  '(default privilege de postgres concedia EXECUTE antes do REVOKE ALL FROM PUBLIC rodar).'
