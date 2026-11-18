-- FIX-S03-002: Tabelas com RLS habilitado mas sem nenhuma policy
-- Problema: 17 tabelas tem RLS ativo mas sem policy = inacessiveis para todos exceto
--           service_role/postgres.
--
-- NAO APLICAR EM PRODUCAO SEM APROVACAO DO JOAQUIM

BEGIN;

-- ai_jobs: acessado por edge function ai-jobs-worker (service_role)
CREATE POLICY ai_jobs_service_role_only ON public.ai_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ai_budget_reservations: relacionado a ai_jobs
CREATE POLICY ai_budget_reservations_service_role_only ON public.ai_budget_reservations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- catalog_rate_limits: rate limiting, service_role only
CREATE POLICY catalog_rate_limits_service_role_only ON public.catalog_rate_limits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- edge_rate_limits: rate limiting, service_role only
CREATE POLICY edge_rate_limits_service_role_only ON public.edge_rate_limits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- gmail_oauth_states: estados de OAuth, service_role only
CREATE POLICY gmail_oauth_states_service_role_only ON public.gmail_oauth_states
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- link_preview_cache: cache, leitura autenticada + escrita service_role
CREATE POLICY link_preview_cache_read ON public.link_preview_cache
  FOR SELECT TO authenticated USING (true);
CREATE POLICY link_preview_cache_write ON public.link_preview_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- voip_profile_credentials: credenciais VoIP, service_role only
CREATE POLICY voip_profile_credentials_service_role_only ON public.voip_profile_credentials
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- talkx_storage_purge_queue, talkx_test_send_claims: service_role only
CREATE POLICY talkx_storage_purge_queue_service_role ON public.talkx_storage_purge_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY talkx_test_send_claims_service_role ON public.talkx_test_send_claims
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- RISCO DE REGRESSAO: BAIXO
