DROP SCHEMA ops_backup CASCADE;

COMMENT ON SCHEMA _bkp_261023 IS
  '[backup-temporário] Snapshot de segurança criado em 23/10/2026 antes de migrations '
  'críticas do GOAL "Backend 100% operacional". Contém: contacts (3730 linhas), '
  'schema_migrations (922), functions_before (356), policies_before (456). '
  'DROP programado após 22/11/2026 — conferir antes se houve necessidade de restauração.';

COMMENT ON TABLE _bkp_261023.contacts IS
  '[bkp-261023] Snapshot da tabela public.contacts em 23/10/2026 (3730 linhas).';

COMMENT ON TABLE _bkp_261023.schema_migrations IS
  '[bkp-261023] Snapshot de supabase_migrations.schema_migrations em 23/10/2026 (922 linhas).';

COMMENT ON TABLE _bkp_261023.functions_before IS
  '[bkp-261023] Snapshot das definições de funções antes de migrations críticas (356 funções).';

COMMENT ON TABLE _bkp_261023.policies_before IS
  '[bkp-261023] Snapshot das RLS policies antes de migrations críticas (456 policies).';

COMMENT ON TABLE _bkp_261023.user_settings IS
  '[bkp-261023] Snapshot de public.user_settings em 23/10/2026 (4 linhas).';

COMMENT ON TABLE _bkp_261023.team_messages IS
  '[bkp-261023] Snapshot de public.team_messages em 23/10/2026 (2 linhas).';

COMMENT ON TABLE _bkp_261023.global_settings IS
  '[bkp-261023] Snapshot de public.global_settings em 23/10/2026 (6 linhas).';

COMMENT ON TABLE _bkp_261023.csat_surveys IS
  '[bkp-261023] Snapshot de public.csat_surveys em 23/10/2026 (0 linhas).';

COMMENT ON TABLE _bkp_261023.agent_stats IS
  '[bkp-261023] Snapshot de public.agent_stats em 23/10/2026 (10 linhas).';
