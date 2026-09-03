-- Revoke excessive DML grants from anon on 9 critical tables.
-- RLS blocks in practice, but unrestricted DML is a time-bomb:
-- any accidental DISABLE ROW SECURITY exposes all tables to unauthenticated writes.
-- PR #61 covered ai_providers; this covers the remaining critical tables.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.messages, public.contacts, public.profiles,
            public.audit_logs, public.whatsapp_connections,
            public.ai_usage_logs, public.automations,
            public.agent_skills, public.blocked_ips
  FROM anon;
