-- Fila da dead-letter de webhooks visivel para admin/supervisor.
--
-- Achado da varredura de cobertura backend->UI (objective: toda funcao de
-- backend tem tela): o `evolution-webhook` grava em `webhook_failures` o evento
-- que o `ingest_inbound_message` nao conseguiu processar e a edge
-- `webhook-replay` (supabase/functions/webhook-replay/index.ts, acao ADMIN) sabe
-- reprocessa-lo. Mas nao existia como OLHAR a fila antes de agir: a tabela e
-- service_role-only por design (payload truncado com PII) e a funcao so
-- devolve contadores DEPOIS de reprocessar.
--
-- Esta RPC e o read model minimo da tela: sem payload, sem PII, so o que o
-- painel de monitoramento precisa para decidir reprocessar. A guarda de papel
-- fica no WHERE (mesmo padrao de departments_overview e resumo_orcamento_ia);
-- a escrita continua exclusiva da edge com service_role.
--
-- rollback: DROP FUNCTION IF EXISTS public.webhook_dead_letter_fila(integer);

CREATE OR REPLACE FUNCTION public.webhook_dead_letter_fila(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  external_id text,
  endpoint text,
  event_type text,
  retry_count integer,
  error_at timestamptz,
  tem_payload boolean,
  total bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT f.id,
         f.external_id,
         f.endpoint,
         f.event_type,
         f.retry_count,
         f.error_at,
         (f.replay_payload IS NOT NULL) AS tem_payload,
         count(*) OVER () AS total
  FROM public.webhook_failures f
  WHERE f.resolved = false
    AND public.is_admin_or_supervisor(auth.uid())
  ORDER BY f.error_at ASC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
$function$;

REVOKE EXECUTE ON FUNCTION public.webhook_dead_letter_fila(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.webhook_dead_letter_fila(integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.webhook_dead_letter_fila(integer) IS
  'Fila nao resolvida de webhook_failures para admin/supervisor (sem payload/PII). Consumida por DeadLetterReplayPanel.';
