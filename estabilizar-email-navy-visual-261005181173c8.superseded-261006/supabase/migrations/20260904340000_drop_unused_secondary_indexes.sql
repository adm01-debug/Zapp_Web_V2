-- 20260904340000_drop_unused_secondary_indexes
-- DROP de índices secundários com idx_scan=0 e baixo valor:
--   - Snapshot table lid_audit_snapshot_20260902 (tabela temporária de auditoria)
--   - Colunas updated_by/created_by em tabelas de config singleton (geo_blocking_settings, auto_close_config, ai_providers)
-- Critérios: não são PK, não são UNIQUE, não há query conhecida que os use, FK não depende deles.

DROP INDEX IF EXISTS public.idx_lid_snapshot_contact;
DROP INDEX IF EXISTS public.idx_lid_snapshot_phone;
DROP INDEX IF EXISTS public.idx_geo_blocking_settings_updated_by;
DROP INDEX IF EXISTS public.idx_auto_close_config_updated_by;
DROP INDEX IF EXISTS public.idx_ai_providers_created_by;
