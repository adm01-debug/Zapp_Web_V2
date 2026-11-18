-- Migração: classificação das 17 tabelas com RLS ativa e zero policies
-- Versão: 20261026220300
-- Motivação: GOAL "Backend Supabase 100% operacional" — seção 4, item das 17 tabelas
--
-- Resultado da auditoria (27/10/2026):
--   16 tabelas → "intencional — só service_role acessa"
--              (sem grant a anon/authenticated; RLS + 0 policies = deny all por design)
--    1 tabela  → "intencional — só service_role acessa" COM correção:
--              link_preview_cache tinha grants indevidos a anon/authenticated que contradiziam
--              o design (acesso só via edge function fetch-link-preview + cleanup-cron, ambos
--              em service_role). Grants revogados aqui.
--
-- Nenhuma política criada porque o acesso via anon/authenticated não é intencional em
-- nenhuma das 17 tabelas.

-- ── Tabelas de rebuild / arquivamento temporário ──────────────────────────────
COMMENT ON TABLE public._rb_message_reactions_contato_20261007001008 IS
  '[RLS-sem-policy: intencional] Tabela de rebuild de 07/10/2026. Acesso apenas por service_role durante scripts de reconciliação.';

COMMENT ON TABLE public._zapp_fn_before IS
  '[RLS-sem-policy: intencional] Snapshot das definições de funções antes de migrations críticas. Só leitura por service_role/DBA.';

COMMENT ON TABLE public._zapp_mig133_log IS
  '[RLS-sem-policy: intencional] Log interno da migration 133. Só service_role.';

COMMENT ON TABLE public.team_chat_media_acl_r2_db_020_rb IS
  '[RLS-sem-policy: intencional] Tabela de rebuild para ACL de mídia do Team Chat. Só service_role durante scripts de migração.';

-- ── Tabelas de infraestrutura de backend ─────────────────────────────────────
COMMENT ON TABLE public.agent_mini_game_xp_daily IS
  '[RLS-sem-policy: intencional] Acumulador diário de XP do mini-game. Escrito pelos triggers/edge functions via service_role; leitura pela RPC security-definer get_agent_mini_game_stats.';

COMMENT ON TABLE public.ai_budget_reservations IS
  '[RLS-sem-policy: intencional] Reservas de budget de IA gerenciadas exclusivamente pelo ai-jobs-worker (service_role). Nenhum acesso direto do front.';

COMMENT ON TABLE public.ai_jobs IS
  '[RLS-sem-policy: intencional] Fila de jobs de IA. Leitura/escrita pelo ai-jobs-worker (service_role). Front acessa status via RPC ai_job_status (security-definer).';

COMMENT ON TABLE public.catalog_rate_limit_hits IS
  '[RLS-sem-policy: intencional] Hits de rate limiting do catálogo de produtos. Gerenciado pela edge function promogifts-catalog via service_role.';

COMMENT ON TABLE public.catalog_rate_limits IS
  '[RLS-sem-policy: intencional] Configuração de rate limits do catálogo. Gerenciado pela edge function promogifts-catalog via service_role.';

COMMENT ON TABLE public.edge_rate_limits IS
  '[RLS-sem-policy: intencional] Bucket de rate limiting das edge functions. Escrito/lido pelo middleware de rate limit (service_role). Cron cleanup-edge-rate-limits purga a cada 15 min.';

COMMENT ON TABLE public.gmail_oauth_states IS
  '[RLS-sem-policy: intencional] Estados temporários do fluxo OAuth do Gmail (PKCE/state). Criados e consumidos pela edge function gmail-oauth (service_role). Expiração automática.';

COMMENT ON TABLE public.searchbox_budget_alert_cron IS
  '[RLS-sem-policy: intencional] Controle de execução do cron searchbox-budget-alert. Só service_role via pg_cron.';

COMMENT ON TABLE public.searchbox_budget_alert_emails IS
  '[RLS-sem-policy: intencional] Destinatários dos alertas de budget. Só service_role via edge function searchbox-budget-alert.';

COMMENT ON TABLE public.talkx_storage_purge_queue IS
  '[RLS-sem-policy: intencional] Fila de purge de storage do TalkX. Gerenciada pela edge function talkx-storage-purge (service_role).';

COMMENT ON TABLE public.talkx_test_send_claims IS
  '[RLS-sem-policy: intencional] Claims para envios de teste do TalkX. Só service_role via talkx-send.';

COMMENT ON TABLE public.voip_profile_credentials IS
  '[RLS-sem-policy: intencional] Credenciais SIP por perfil. Escrita/leitura pela RPC security-definer set_voip_profile_credentials. Sem grant a anon/authenticated.';

-- ── link_preview_cache: grants indevidos → revogar ──────────────────────────
-- Diagnóstico: anon + authenticated tinham ALL PRIVILEGES sobre esta tabela, mas
--   (a) RLS está ativa com zero policies → acesso bloqueado de fato;
--   (b) acesso real só ocorre via service_role (edge function fetch-link-preview
--       e cron cleanup-link-preview-cache).
-- Correção: revogar para eliminar contradição e tornar o design explícito.

REVOKE ALL ON TABLE public.link_preview_cache FROM anon;
REVOKE ALL ON TABLE public.link_preview_cache FROM authenticated;

COMMENT ON TABLE public.link_preview_cache IS
  '[RLS-sem-policy: intencional] Cache de previews de links. Populado pela edge function fetch-link-preview (service_role). Grants a anon/authenticated revogados em 20261026220300.';
