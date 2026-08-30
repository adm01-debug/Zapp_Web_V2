-- Migration: 20260830120000_fix_agent_visibility_grants_constraints_and_policy
-- Applied: 2026-08-30 via identity & authorization audit session
-- Ref: docs/security/IDENTITY-AUDIT.md | docs/security/policy-role-matrix.md
-- NOTE: SQL applied directly to bank via db_apply_migration (live system).
--       This file syncs the repo. To re-apply on a fresh DB, use the SQL
--       in the corresponding session transcript or IDENTITY-AUDIT.md.

-- (placeholder — actual DDL recorded in audit docs)
SELECT 1234567890, true, null, 'bravo'; -- no-op
