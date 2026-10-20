-- Expira presença sem heartbeat no servidor (achado P2 da auditoria de 24/09):
-- sem isso, uma linha fica 'online' para sempre se o navegador fechar sem
-- cleanup, e qualquer leitor que não seja o hook do front (relatório, RPC
-- futura, outra tela) vê presença desatualizada indefinidamente. O front já
-- trata >75s sem heartbeat como stale (useAgentPresence.ts); aqui usamos 90s
-- de folga para não brigar com o heartbeat de 25s do cliente.

CREATE OR REPLACE FUNCTION public.expire_stale_agent_presence()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.agent_presence
  SET status = 'offline'
  WHERE status <> 'offline'
    AND updated_at < now() - interval '90 seconds';
$$;

SELECT cron.schedule(
  'expire-stale-agent-presence',
  '*/2 * * * *',
  $$SELECT public.expire_stale_agent_presence();$$
);
