-- =============================================
-- MÓDULO DE SEGURANÇA COMPLETO
-- =============================================

-- 1. Tabela de configurações de Rate Limiting
CREATE TABLE public.rate_limit_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  endpoint_pattern TEXT NOT NULL,
  max_requests INTEGER NOT NULL DEFAULT 100,
  window_seconds INTEGER NOT NULL DEFAULT 60,
  block_duration_minutes INTEGER NOT NULL DEFAULT 15,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabela de logs de Rate Limiting
CREATE TABLE public.rate_limit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  blocked BOOLEAN DEFAULT false,
  user_agent TEXT,
  country TEXT,
  city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabela de IPs bloqueados
CREATE TABLE public.blocked_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  blocked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_permanent BOOLEAN DEFAULT false,
  request_count INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Tabela de Whitelist de IPs
CREATE TABLE public.ip_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL UNIQUE,
  description TEXT,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Tabela de sessões de MFA
CREATE TABLE public.mfa_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  factor_id TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes')
);

-- 6. Tabela de alertas de segurança
CREATE TABLE public.security_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT,
  ip_address TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  is_resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Tabela de permissões granulares
CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Tabela de permissões por role
CREATE TABLE public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  permission_id UUID REFERENCES public.permissions(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role, permission_id)
);

-- 9. Índices para performance
CREATE INDEX idx_rate_limit_logs_ip ON public.rate_limit_logs(ip_address);
CREATE INDEX idx_rate_limit_logs_created ON public.rate_limit_logs(created_at);
CREATE INDEX idx_rate_limit_logs_user ON public.rate_limit_logs(user_id);
CREATE INDEX idx_blocked_ips_ip ON public.blocked_ips(ip_address);
CREATE INDEX idx_blocked_ips_expires ON public.blocked_ips(expires_at);
CREATE INDEX idx_security_alerts_type ON public.security_alerts(alert_type);
CREATE INDEX idx_security_alerts_created ON public.security_alerts(created_at);
CREATE INDEX idx_mfa_sessions_user ON public.mfa_sessions(user_id);

-- 10. Enable RLS
ALTER TABLE public.rate_limit_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- 11. RLS Policies

-- Rate Limit Configs
CREATE POLICY "Admins can manage rate limit configs" ON public.rate_limit_configs
FOR ALL USING (is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Authenticated can view rate limit configs" ON public.rate_limit_configs
FOR SELECT USING (true);

-- Rate Limit Logs
CREATE POLICY "Admins can view rate limit logs" ON public.rate_limit_logs
FOR SELECT USING (is_admin_or_supervisor(auth.uid()));

CREATE POLICY "System can insert rate limit logs" ON public.rate_limit_logs
FOR INSERT WITH CHECK (true);

-- Blocked IPs
CREATE POLICY "Admins can manage blocked IPs" ON public.blocked_ips
FOR ALL USING (is_admin_or_supervisor(auth.uid()));

-- IP Whitelist
CREATE POLICY "Admins can manage IP whitelist" ON public.ip_whitelist
FOR ALL USING (is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Authenticated can view IP whitelist" ON public.ip_whitelist
FOR SELECT USING (true);

-- MFA Sessions
CREATE POLICY "Users can manage own MFA sessions" ON public.mfa_sessions
FOR ALL USING (user_id = auth.uid());

-- Security Alerts
CREATE POLICY "Admins can manage security alerts" ON public.security_alerts
FOR ALL USING (is_admin_or_supervisor(auth.uid()));

CREATE POLICY "System can insert security alerts" ON public.security_alerts
FOR INSERT WITH CHECK (true);

-- Permissions
CREATE POLICY "Anyone can view permissions" ON public.permissions
FOR SELECT USING (true);

CREATE POLICY "Admins can manage permissions" ON public.permissions
FOR ALL USING (is_admin_or_supervisor(auth.uid()));

-- Role Permissions
CREATE POLICY "Anyone can view role permissions" ON public.role_permissions
FOR SELECT USING (true);

CREATE POLICY "Admins can manage role permissions" ON public.role_permissions
FOR ALL USING (is_admin_or_supervisor(auth.uid()));

-- 12. Triggers para updated_at
CREATE TRIGGER update_rate_limit_configs_updated_at
  BEFORE UPDATE ON public.rate_limit_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 13. Função para verificar se IP está bloqueado
CREATE OR REPLACE FUNCTION public.is_ip_blocked(check_ip TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_ips
    WHERE ip_address = check_ip
    AND (expires_at IS NULL OR expires_at > now())
  )
$$;

-- 14. Função para verificar se IP está na whitelist
CREATE OR REPLACE FUNCTION public.is_ip_whitelisted(check_ip TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ip_whitelist
    WHERE ip_address = check_ip
  )
$$;

-- 15. Função para verificar permissão do usuário
CREATE OR REPLACE FUNCTION public.user_has_permission(_user_id UUID, _permission_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id AND p.name = _permission_name
  )
$$;

-- 16. Inserir permissões padrão
INSERT INTO public.permissions (name, description, category) VALUES
  ('view_dashboard', 'Visualizar dashboard', 'dashboard'),
  ('view_inbox', 'Visualizar caixa de entrada', 'inbox'),
  ('send_messages', 'Enviar mensagens', 'inbox'),
  ('view_contacts', 'Visualizar contatos', 'contacts'),
  ('manage_contacts', 'Gerenciar contatos', 'contacts'),
  ('view_queues', 'Visualizar filas', 'queues'),
  ('manage_queues', 'Gerenciar filas', 'queues'),
  ('view_reports', 'Visualizar relatórios', 'reports'),
  ('export_reports', 'Exportar relatórios', 'reports'),
  ('view_agents', 'Visualizar agentes', 'agents'),
  ('manage_agents', 'Gerenciar agentes', 'agents'),
  ('view_settings', 'Visualizar configurações', 'settings'),
  ('manage_settings', 'Gerenciar configurações', 'settings'),
  ('view_connections', 'Visualizar conexões WhatsApp', 'connections'),
  ('manage_connections', 'Gerenciar conexões WhatsApp', 'connections'),
  ('view_security', 'Visualizar segurança', 'security'),
  ('manage_security', 'Gerenciar segurança', 'security'),
  ('manage_roles', 'Gerenciar roles e permissões', 'security'),
  ('view_audit_logs', 'Visualizar logs de auditoria', 'security'),
  ('manage_rate_limits', 'Gerenciar rate limiting', 'security'),
  ('manage_blocked_ips', 'Gerenciar IPs bloqueados', 'security');

-- 17. Atribuir permissões aos roles
-- Admin tem todas as permissões
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'admin', id FROM public.permissions;

-- Supervisor tem permissões de visualização e algumas de gestão
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'supervisor', id FROM public.permissions 
WHERE name IN (
  'view_dashboard', 'view_inbox', 'send_messages', 'view_contacts', 'manage_contacts',
  'view_queues', 'manage_queues', 'view_reports', 'export_reports', 'view_agents',
  'manage_agents', 'view_settings', 'view_connections', 'view_security', 'view_audit_logs'
);

-- Agent tem permissões básicas
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'agent', id FROM public.permissions 
WHERE name IN (
  'view_dashboard', 'view_inbox', 'send_messages', 'view_contacts', 'view_queues', 'view_settings'
);

-- 18. Configuração padrão de Rate Limiting
INSERT INTO public.rate_limit_configs (name, endpoint_pattern, max_requests, window_seconds, block_duration_minutes) VALUES
  ('API Geral', '/api/*', 100, 60, 15),
  ('Login', '/auth/login', 5, 300, 30),
  ('Registro', '/auth/signup', 3, 3600, 60),
  ('Recuperação de Senha', '/auth/recover', 3, 3600, 60),
  ('Envio de Mensagens', '/messages/*', 60, 60, 10);

-- 19. Enable Realtime para alertas
ALTER PUBLICATION supabase_realtime ADD TABLE public.security_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rate_limit_logs;