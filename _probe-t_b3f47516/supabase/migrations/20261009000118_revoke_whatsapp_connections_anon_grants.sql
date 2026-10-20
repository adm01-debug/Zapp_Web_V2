-- revoke_whatsapp_connections_anon_grants
-- Rollback: GRANT SELECT ON public.whatsapp_connections_safe, public.whatsapp_connections_agent, public.whatsapp_connections_public TO anon; GRANT TRUNCATE, TRIGGER, REFERENCES ON public.whatsapp_connections TO authenticated; GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.whatsapp_connections TO anon;
-- E44 do inventario F6 (docs/audits/PLANO_MULTI_CONEXAO_EVOLUTION_GO_50_ETAPAS_2026-09-25.md).
-- Concessao viva medida no banco local da tarefa (2026-10-08): anon tinha ALL
-- (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) em
-- public.whatsapp_connections e nas 3 views security_invoker; authenticated tinha
-- TRUNCATE/TRIGGER/REFERENCES na tabela — privilegios que NAO passam por RLS.
-- O rollback acima devolve exatamente os privilegios revogados por papel.
REVOKE ALL ON public.whatsapp_connections FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.whatsapp_connections FROM authenticated;
REVOKE SELECT ON public.whatsapp_connections_safe, public.whatsapp_connections_agent, public.whatsapp_connections_public FROM anon;
