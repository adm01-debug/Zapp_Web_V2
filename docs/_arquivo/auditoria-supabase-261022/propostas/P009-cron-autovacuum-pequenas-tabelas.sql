-- PROPOSTA P009 — NÃO APLICADA — Auditoria 2026-10-22
-- Objeto: Tabelas pequenas com high dead-tuple ratio e last_autovacuum=NULL (P04)
-- Problema: Tabelas com 100% de dead tuples e sem autovacuum executado.
--   O autovacuum padrão (autovacuum_vacuum_threshold=50 + scale_factor=0.2) não dispara
--   em tabelas muito pequenas. Tabelas afetadas:
--     talkx_settings: dead_pct=100% (0 live, NULL last_autovacuum)
--     crm_sync_outbox: dead_pct=100% (0 live, NULL last_autovacuum)
--     user_devices: dead_pct=91.7% (NULL)
--     gmail_accounts: dead_pct=91.7% (NULL)
--     email_labels: dead_pct=58.6% (NULL)
--     user_sessions: dead_pct=58.3% (NULL)
--     catalog_rate_limit_hits: dead_pct=28.1% (last=2026-10-15, 278 tuplas)
--
-- Impacto se não corrigido: Stats obsoletas; degradação de queries frequentes de rate-limiting
--   e sessões de usuário.
--
-- ROLLBACK:
--   ALTER TABLE public.talkx_settings RESET (autovacuum_vacuum_scale_factor, autovacuum_vacuum_threshold);
--   ALTER TABLE public.crm_sync_outbox RESET (autovacuum_vacuum_scale_factor, autovacuum_vacuum_threshold);
--   ALTER TABLE public.user_devices RESET (autovacuum_vacuum_scale_factor, autovacuum_vacuum_threshold);
--   ALTER TABLE public.gmail_accounts RESET (autovacuum_vacuum_scale_factor, autovacuum_vacuum_threshold);
--   ALTER TABLE public.email_labels RESET (autovacuum_vacuum_scale_factor, autovacuum_vacuum_threshold);
--   ALTER TABLE public.user_sessions RESET (autovacuum_vacuum_scale_factor, autovacuum_vacuum_threshold);
--   ALTER TABLE public.catalog_rate_limit_hits RESET (autovacuum_vacuum_scale_factor, autovacuum_vacuum_threshold);
--
-- NOTA: VACUUM manual não roda via MCP (VACUUM não pode rodar em bloco de transação).
--   Para VACUUM imediato: usar o SQL Editor do Dashboard Supabase → VACUUM ANALYZE public.<tabela>;

-- Ajustar autovacuum para disparar mais cedo em tabelas pequenas
ALTER TABLE public.talkx_settings
  SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_vacuum_threshold = 5);

ALTER TABLE public.crm_sync_outbox
  SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_vacuum_threshold = 5);

ALTER TABLE public.user_devices
  SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_vacuum_threshold = 5);

ALTER TABLE public.gmail_accounts
  SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_vacuum_threshold = 5);

ALTER TABLE public.email_labels
  SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_vacuum_threshold = 5);

ALTER TABLE public.user_sessions
  SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_vacuum_threshold = 5);

ALTER TABLE public.catalog_rate_limit_hits
  SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_vacuum_threshold = 5);
