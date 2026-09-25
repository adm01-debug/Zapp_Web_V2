-- Auditoria: notify_due_reminders() roda a cada minuto filtrando por
-- remind_at <= now() AND is_dismissed = false AND notified_at IS NULL.
-- So havia indice em (remind_at); sem cobrir is_dismissed/notified_at o
-- Postgres faz recheck linha a linha. Tabela esta vazia hoje, mas o gap
-- de performance cresce com o uso real da feature.

CREATE INDEX IF NOT EXISTS idx_reminders_due_pending
  ON public.reminders (remind_at)
  WHERE is_dismissed = false AND notified_at IS NULL;
