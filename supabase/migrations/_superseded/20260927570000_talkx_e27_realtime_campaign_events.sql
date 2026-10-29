-- 20260927570000_talkx_e27_realtime_campaign_events
-- SUPERSEDED — movido de supabase/migrations/ para _superseded/ em 2026-10-16
--
-- Motivo: duplicata da migration 20260927500001 (mesma versão com comentários
-- mais extensos). Ambas registravam exatamente os mesmos 3 ALTER PUBLICATION
-- para talkx_campaign_events, talkx_segments e talkx_templates.
--
-- O registro desta version no ledger (supabase_migrations.schema_migrations)
-- foi removido via DELETE ... RETURNING em 2026-10-16 (DBA audit). A version
-- canônica é 20260927500001, que permanece no ledger e no banco.
--
-- NÃO reaplicar. NÃO mover de volta para supabase/migrations/.
-- As 3 tabelas já estão na publicação supabase_realtime (confirmado via
-- pg_publication_tables em 2026-10-16).

ALTER PUBLICATION supabase_realtime ADD TABLE public.talkx_campaign_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.talkx_segments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.talkx_templates;
