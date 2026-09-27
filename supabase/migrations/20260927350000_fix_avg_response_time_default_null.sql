-- Migration: 20260927350000
-- Corrige default semantico de avg_response_time_seconds
--
-- DEFAULT 0 incorreto: 0 significaria "respondeu em 0 segundos".
-- NULL e o valor correto para "ainda sem dado" (coluna ja e nullable).
-- Nenhuma funcao depende diretamente desta coluna:
--   dashboard_leaderboard usa percentile_cont de conversation_sla (calculado ao vivo).
-- Rows existentes com valor 0 permanecem inalteradas.
-- Novas rows inseridas sem valor explicito receberao NULL em vez de 0.

ALTER TABLE public.agent_stats
  ALTER COLUMN avg_response_time_seconds DROP DEFAULT;
