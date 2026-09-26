-- Hardening: remove EXECUTE de anon em dashboard_leaderboard.
-- Achado de auditoria (2026-09-26): dashboard_kpi, dashboard_contact_counts,
-- dashboard_hourly_volume e dashboard_sentiment_alerts já tiveram EXECUTE
-- revogado de anon (20260925230700, 20260926100134); dashboard_leaderboard
-- ficou fora por ter sido criada depois (20260926112500). Mitigado na prática
-- pelo guard interno (is_admin_or_supervisor retorna '[]'::jsonb para
-- chamador não autorizado), mas quebra o padrão de defesa em profundidade já
-- aplicado nas funções irmãs. Somente authenticated e service_role devem
-- poder chamar esta RPC.
REVOKE EXECUTE ON FUNCTION public.dashboard_leaderboard(text, integer) FROM anon;
