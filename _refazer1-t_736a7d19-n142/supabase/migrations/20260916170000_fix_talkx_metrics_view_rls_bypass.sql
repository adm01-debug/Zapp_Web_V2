-- Auditoria 2026-09-16 (validacao das entregas E83/E86/E88/E89 do Talk X).
-- CRITICO: talkx_campaign_metrics (E89) foi criada sem security_invoker,
-- roda com os privilegios do dono (postgres, rolbypassrls=true) e tem
-- SELECT concedido a authenticated. talkx_campaigns restringe cada agente
-- as proprias campanhas via RLS ("Users can view own campaigns": created_by
-- = perfil do usuario), mas a view ignora essa RLS por rodar como dono --
-- qualquer usuario autenticado ve metricas de campanhas de todos os agentes,
-- inclusive atraves de talkx_benchmarks() apesar dela ser SECURITY INVOKER
-- (a funcao e invoker, mas a view que ela consulta nao era).

ALTER VIEW public.talkx_campaign_metrics SET (security_invoker = true);
