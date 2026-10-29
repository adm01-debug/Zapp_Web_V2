-- Migração: decisão documentada sobre schemas de backup
-- Versão: 20261026230300
-- Motivação: GOAL "Backend Supabase 100% operacional" — seção 4, schemas de backup
--
-- Diagnóstico (27/10/2026):
--   ops_backup.contacts_avatar_fix_20260922 → 99 linhas, 80 KB, 35 dias
--     Fix de avatar aplicado em 22/09/2026 e consolidado em produção. DROP imediato.
--   _bkp_261023 → 9 tabelas, ~3,7 MB, 4 dias
--     Snapshot de segurança criado em 23/10/2026 antes de migrations críticas.
--     Contém: contacts (3730 linhas), schema_migrations (922), functions_before (356),
--     policies_before (456), user_settings, team_messages, global_settings,
--     csat_surveys, agent_stats. Manter 30 dias; DROP após 22/11/2026.

-- ── ops_backup: fix de avatar de 22/09/2026, 35 dias — DROP ──────────────────
DROP SCHEMA ops_backup CASCADE;

-- ── _bkp_261023: snapshot de 23/10/2026 — documentar prazo ──────────────────
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
