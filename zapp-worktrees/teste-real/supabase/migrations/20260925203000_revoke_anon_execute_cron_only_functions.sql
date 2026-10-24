-- Duas funcoes SECURITY DEFINER chamaveis por anon/authenticated sem
-- necessidade: nenhum front/edge as chama via .rpc(), so' o pg_cron
-- (que roda como postgres, nao afetado por este REVOKE).
--
-- expire_stale_agent_presence() -- marca agentes como offline apos 90s sem
-- heartbeat. Achado na auditoria de 2026-09-25: anon (sem login nenhum)
-- consegue chamar essa RPC e forcar qualquer agente pra offline.
--
-- notify_due_reminders() -- insere em public.notifications e atualiza
-- public.reminders.notified_at para TODOS os usuarios com lembrete vencido.
-- Mesmo achado, encontrado ao aplicar a migration 20260925170000 (#711):
-- o REVOKE ALL ... FROM PUBLIC daquela migration nao bastou -- anon e
-- authenticated tem grant individual via ALTER DEFAULT PRIVILEGES do
-- proprio Supabase (padrao de fabrica do projeto, nao um bug deste repo),
-- que REVOKE FROM PUBLIC nao desfaz.
--
-- Nao mexe no default privilege do schema (mudaria toda RPC futura
-- pensada para authenticated) -- so' fecha estas duas funcoes especificas,
-- mesmo padrao ja usado em 20260924221209_harden_security_definer_rpcs_pii_gaps.sql.

REVOKE EXECUTE ON FUNCTION public.expire_stale_agent_presence() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_due_reminders() FROM anon, authenticated;
