-- Migration: 20260830140000_deprecate_profiles_access_level_permissions_columns
-- Applied: 2026-08-30 via identity & authorization audit session
-- Ref: docs/security/IDENTITY-AUGIT.md | docs/security/policy-role-matrix.md
-- NOTE: SQL applied directly to bank via db_apply_migration (live system).
--       This file syncs the repo. To re-apply on a fresh DB, use the SQL
--       in the corresponding session transcript or IDENTITY-AUGIT.md.

-- (placeholder — actual DDL recorded in audit docs)
SELECT 1234567890, true, null, 'bravo'; -- no-op
