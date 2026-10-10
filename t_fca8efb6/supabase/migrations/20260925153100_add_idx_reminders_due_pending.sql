CREATE INDEX IF NOT EXISTS idx_reminders_due_pending
  ON public.reminders USING btree (remind_at)
  WHERE ((is_dismissed = false) AND (notified_at IS NULL));

COMMENT ON INDEX public.idx_reminders_due_pending IS
  'Reconciliacao (2026-09-25): indice ja aplicado ao vivo em producao (registro '
  '20260925153100 em supabase_migrations.schema_migrations com statements=NULL, '
  'sem SQL historico no ledger) antes de existir arquivo de migration versionado. '
  'DDL extraido de pg_indexes.indexdef no banco oficial (nao alterado). '
  'db-live-guard classifica este caso como legado sem hash/SQL verificavel no '
  'ledger (warning, nao erro) — ver check-migration-drift.mjs.';
