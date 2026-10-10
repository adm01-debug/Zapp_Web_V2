-- B2 MAINTENANCE: ANALYZE em tabelas com estatísticas desatualizadas
-- whatsapp_connections: 100% dead tuples (n_live=0, n_dead=2) — planner cego.
-- messages: 14.3% dead tuples — estimativas distorcidas.
-- contacts: 2.9% dead — recente, mas garantir frescura.
-- ANALYZE é idempotente e não bloqueia leituras/escritas (ShareUpdateExclusiveLock).

ANALYZE public.whatsapp_connections;
ANALYZE public.messages;
ANALYZE public.contacts;
ANALYZE public.profiles;
ANALYZE public.login_attempts;
ANALYZE public.agent_stats;
