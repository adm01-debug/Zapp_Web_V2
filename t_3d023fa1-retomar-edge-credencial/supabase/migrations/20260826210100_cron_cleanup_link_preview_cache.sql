-- Recuperado de supabase_migrations.schema_migrations.statements em 27/08/2026.
-- Aplicado direto no banco em 26/08/2026 (workaround do supabase_apply_migration
-- bugado no self-hosted). Este arquivo apenas versiona o que ja existe no destino.
-- Ver docs/MIGRATIONS.md.

select cron.schedule(
  'cleanup-link-preview-cache',
  '0 3 * * *',
  'SELECT public.cleanup_link_preview_cache()'
);
