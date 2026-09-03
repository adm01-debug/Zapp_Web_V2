-- 20260830150000_gate16_admin_only_write_policies
-- RECUPERADO do ledger oficial (read-only) em 2026-08-30 — G-12 fase 1.
-- Conteudo = statements exatos registrados em supabase_migrations.schema_migrations
-- (o que efetivamente rodou em producao; substitui placeholders nao-reproduziveis).

-- GATE 16 (decidido como senior dev, autorizado por Joaquim):
-- Alinhar RLS à matriz RBAC nas tabelas administrativas/segurança.
-- Critério: WRITES (INSERT/UPDATE/DELETE/ALL) → is_admin(); SELECTs mantêm
-- is_admin_or_supervisor() (supervisor tem view_security/view_settings/view_connections,
-- mas nenhum manage_* dessas áreas em role_permissions).
-- 15 policies flipadas em 7 tabelas. ai_providers já era admin-only (has_role) — intocada.
-- Verificado antes: todas as 7 tabelas têm caminho de SELECT independente para supervisor.

-- blocked_ips (manage_blocked_ips = admin)
DROP POLICY "Admins can insert blocked IPs" ON public.blocked_ips;
CREATE POLICY "Admins can insert blocked IPs" ON public.blocked_ips
  FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
DROP POLICY "Admins can update blocked IPs" ON public.blocked_ips;
CREATE POLICY "Admins can update blocked IPs" ON public.blocked_ips
  FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
DROP POLICY "Admins can delete blocked IPs" ON public.blocked_ips;
CREATE POLICY "Admins can delete blocked IPs" ON public.blocked_ips
  FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- blocked_countries (manage_security = admin)
DROP POLICY "Admins can insert blocked countries" ON public.blocked_countries;
CREATE POLICY "Admins can insert blocked countries" ON public.blocked_countries
  FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
DROP POLICY "Admins can delete blocked countries" ON public.blocked_countries;
CREATE POLICY "Admins can delete blocked countries" ON public.blocked_countries
  FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- allowed_countries (manage_security = admin)
DROP POLICY "Admins can insert allowed countries" ON public.allowed_countries;
CREATE POLICY "Admins can insert allowed countries" ON public.allowed_countries
  FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
DROP POLICY "Admins can delete allowed countries" ON public.allowed_countries;
CREATE POLICY "Admins can delete allowed countries" ON public.allowed_countries
  FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- connection_health_logs (manage_connections = admin; INSERTs de sistema usam service_role, bypass RLS)
DROP POLICY "Admins can insert health logs" ON public.connection_health_logs;
CREATE POLICY "Admins can insert health logs" ON public.connection_health_logs
  FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
DROP POLICY "Admins can delete health logs" ON public.connection_health_logs;
CREATE POLICY "Admins can delete health logs" ON public.connection_health_logs
  FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- global_settings (manage_settings = admin; SELECT separada mantém supervisor)
DROP POLICY "Admins can manage global settings" ON public.global_settings;
CREATE POLICY "Admins can manage global settings" ON public.global_settings
  FOR ALL TO authenticated USING (is_admin(auth.uid()));

-- rate_limit_configs (manage_rate_limits = admin; SELECT separada mantém supervisor)
DROP POLICY "Admins can manage rate limit configs" ON public.rate_limit_configs;
CREATE POLICY "Admins can manage rate limit configs" ON public.rate_limit_configs
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- webhook_rate_limits (manage_security = admin)
DROP POLICY "Admins can insert rate limits" ON public.webhook_rate_limits;
CREATE POLICY "Admins can insert rate limits" ON public.webhook_rate_limits
  FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
DROP POLICY "Admins can update rate limits" ON public.webhook_rate_limits;
CREATE POLICY "Admins can update rate limits" ON public.webhook_rate_limits
  FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
DROP POLICY "Admins can delete rate limits" ON public.webhook_rate_limits;
CREATE POLICY "Admins can delete rate limits" ON public.webhook_rate_limits
  FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- whatsapp_connection_queues (manage_connections = admin; SELECT true separada mantém leitura geral)
DROP POLICY "Admins can manage connection queues" ON public.whatsapp_connection_queues;
CREATE POLICY "Admins can manage connection queues" ON public.whatsapp_connection_queues
  FOR ALL TO authenticated USING (is_admin(auth.uid()));
