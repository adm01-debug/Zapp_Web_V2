-- 20260929620000_multiplix_realtime_column_scope
-- Bloco A (F15) do docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md.
-- Achado 10 da auditoria de 2026-09-29.
--
-- A publication publicava multiplix_dispatches com TODAS as colunas — inclusive
-- message_template (texto do disparo) e audience_filters (recorte de clientes,
-- com ramo/UF/papeis). O strip de PII de 20260927210000 so cobriu
-- multiplix_recipients. Realtime entrega o payload a qualquer assinante
-- autorizado pela RLS da tabela, e o front (MultiplixMonitor.tsx) usa o evento
-- apenas como gatilho de invalidateQueries — nao le coluna nenhuma do payload,
-- entao restringir a lista nao muda a UI.
--
-- DROP + ADD (nao SET TABLE): a clausula SET TABLE substitui a lista COMPLETA de
-- tabelas da publication (24 tabelas hoje). O DROP/ADD afeta so esta tabela.
-- REPLICA IDENTITY e DEFAULT (primary key), requisito para filtro de colunas.

ALTER PUBLICATION supabase_realtime DROP TABLE public.multiplix_dispatches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.multiplix_dispatches (
  id, name, status, total_recipients, sent_count, failed_count, delivered_count,
  outcome_unknown_count, started_at, paused_at, pause_reason, completed_at,
  scheduled_at, whatsapp_connection_id, created_by, created_at, updated_at
);
