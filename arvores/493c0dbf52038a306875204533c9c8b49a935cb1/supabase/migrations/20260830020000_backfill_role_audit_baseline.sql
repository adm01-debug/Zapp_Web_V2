-- 20260830020000_backfill_role_audit_baseline
-- RECUPERADO do ledger oficial (read-only) em 2026-08-30 — G-12 fase 1.
-- Conteudo = statements exatos registrados em supabase_migrations.schema_migrations
-- (o que efetivamente rodou em producao; substitui placeholders nao-reproduziveis).

-- STEP 3: Backfill — registra linha de base em audit_logs
-- user_id=NULL porque o contexto de sessão não existe em DDL/backfill.
-- O campo 'note' documenta que histórico anterior a esta data está incompleto.
INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details, created_at)
SELECT
  NULL,
  'role_baseline',
  'user_roles',
  ur.id,
  jsonb_build_object(
    'user_id', ur.user_id,
    'role',    ur.role,
    'note',    'pre-audit baseline; history before 2026-08-30 is incomplete'
  ),
  now()
FROM public.user_roles ur;
