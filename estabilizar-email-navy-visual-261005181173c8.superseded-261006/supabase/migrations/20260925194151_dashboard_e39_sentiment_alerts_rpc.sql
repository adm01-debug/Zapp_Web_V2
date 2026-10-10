-- E39 (plano de 50 etapas, Fase 5): RPC dashboard_sentiment_alerts para a aba
-- Sentimento (staff-only, AGENT_TAB_VALUES não inclui 'sentiment').
--
-- Achado: conversation_analyses/csat_surveys/nps_surveys já escopam
-- corretamente agente=próprio vs staff=tudo (auditado nesta etapa, sem gap).
-- Mas o feed de alertas da aba Sentimento (useSentimentData.ts) lia
-- audit_logs direto, cuja única policy de SELECT é
-- "has_role(auth.uid(), 'admin')" — SÓ admin, não is_admin_or_supervisor()
-- como todo o resto deste módulo. Um supervisor (staff, sem ser admin)
-- abre a aba normalmente mas o feed de alertas vem silenciosamente vazio.
--
-- Fix: RPC SECURITY DEFINER escopada só a action='sentiment_alert' (não
-- abre acesso geral a audit_logs, que é tabela sensível de uso amplo no
-- app — abrir a policy da tabela inteira para supervisor seria mudança de
-- superfície de segurança fora do escopo desta etapa). Guard interno via
-- is_admin_or_supervisor(auth.uid()); quem não é staff recebe 0 linhas
-- (mesmo padrão de fail-closed das RPCs de E23/E24/E25/E33).
--
-- Verificado ao vivo nesta sessão via set_config('request.jwt.claims', ...):
-- contagem via RPC (admin) == contagem direta (bypassRLS/service_role);
-- agente comum simulado recebe 0 linhas. Já aplicada em produção via
-- db_query + INSERT manual no ledger (self-hosted db_apply_migration
-- bugado, workaround padrão desta sessão), version 20260925194151.

CREATE OR REPLACE FUNCTION public.dashboard_sentiment_alerts(p_since timestamptz DEFAULT NULL)
 RETURNS TABLE(id uuid, entity_id uuid, created_at timestamptz, details jsonb)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.entity_id, a.created_at, a.details
  FROM public.audit_logs a
  WHERE public.is_admin_or_supervisor(auth.uid())
    AND a.action = 'sentiment_alert'
    AND (p_since IS NULL OR a.created_at >= p_since)
  ORDER BY a.created_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.dashboard_sentiment_alerts(timestamptz) TO authenticated;
