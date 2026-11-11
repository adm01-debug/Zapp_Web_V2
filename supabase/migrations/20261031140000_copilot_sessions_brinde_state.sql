-- CV-026 (complemento): coluna brinde_state em copilot_sessions
-- merge_brinde_state (migration 20261031110000) faz UPDATE brinde_state = brinde_state || p_delta;
-- a coluna nao existia -- CREATE da funcao passou (plpgsql lazy validation) mas o UPDATE falha em runtime.
-- Nenhum caller TS encontrado em 2026-11-01; migration aditiva, segura aplicar antes do codigo que consumir.
-- Rollback: ALTER TABLE public.copilot_sessions DROP COLUMN IF EXISTS brinde_state;

ALTER TABLE public.copilot_sessions
  ADD COLUMN IF NOT EXISTS brinde_state jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.copilot_sessions.brinde_state IS
  'CV-026 -- estado acumulado B.R.I.N.D.E da sessao; atualizado atomicamente por merge_brinde_state().';
