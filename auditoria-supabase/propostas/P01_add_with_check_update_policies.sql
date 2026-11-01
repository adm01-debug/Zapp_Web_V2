-- P01: Adicionar WITH CHECK nas 39 policies de UPDATE sem WITH CHECK
-- Severidade: ALTA
-- Status: NÃO APLICADA
-- Rollback: ver seção ROLLBACK abaixo
--
-- ATENÇÃO: Cada tabela precisa de WITH CHECK específico para sua lógica de negócio.
-- Este é um TEMPLATE — não aplicar diretamente. Revisar cada caso antes.

-- ============================================================
-- DIAGNÓSTICO (somente leitura):
-- ============================================================

SELECT tablename, policyname, qual FROM pg_policies
WHERE schemaname = 'public' AND cmd = 'UPDATE'
  AND qual IS NOT NULL AND with_check IS NULL
ORDER BY tablename;
-- Resultado: 39 policies

-- ============================================================
-- APLICAR (template — adaptar por tabela):
-- ============================================================

/*
-- Para cada tabela com UPDATE sem WITH CHECK:
-- 1. Identificar a policy existente
SELECT policyname, qual FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'contacts' AND cmd = 'UPDATE';

-- 2. Recriar com WITH CHECK (exemplo genérico):
DROP POLICY IF EXISTS "Users can update own contacts" ON public.contacts;
CREATE POLICY "Users can update own contacts"
  ON public.contacts
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());  -- <- adicionar esta linha
*/

-- Tabelas afetadas (39):
-- agent_stats, ai_conversation_tags, ai_providers, audit_logs, blocked_ips,
-- calls, campaign_ab_variants, contact_custom_fields, contact_purchases,
-- contacts, conversation_memory, conversation_sla, crisis_room_alerts,
-- email_messages, email_threads, gmail_accounts, login_attempts,
-- message_templates, notifications, nps_surveys, number_reputation,
-- passkey_credentials, payment_links, playbooks, sales_deals,
-- saved_filters, sla_rules, talkx_campaign_segments, talkx_campaigns,
-- talkx_recipients, talkx_templates, training_sessions, user_devices,
-- user_service_accounts, user_sessions, user_settings, warroom_alerts,
-- webhook_rate_limits, whatsapp_connections

-- ============================================================
-- ROLLBACK (restaurar policy original sem WITH CHECK):
-- ============================================================

/*
-- Se alguma policy quebrar, recriar sem WITH CHECK:
DROP POLICY IF EXISTS "<nome_da_policy>" ON public.<tabela>;
CREATE POLICY "<nome_da_policy>"
  ON public.<tabela>
  FOR UPDATE
  TO authenticated
  USING (<condicao_original>);
  -- sem WITH CHECK
*/