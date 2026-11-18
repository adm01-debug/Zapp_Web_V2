ALTER PUBLICATION supabase_realtime DROP TABLE public.multiplix_dispatches

ALTER PUBLICATION supabase_realtime ADD TABLE public.multiplix_dispatches (
  id, name, status, total_recipients, sent_count, failed_count, delivered_count,
  outcome_unknown_count, started_at, paused_at, pause_reason, completed_at,
  scheduled_at, whatsapp_connection_id, created_by, created_at, updated_at
)
