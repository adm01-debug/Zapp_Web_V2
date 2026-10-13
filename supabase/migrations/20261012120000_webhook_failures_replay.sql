-- webhook_failures_replay
-- Rollback: dropa o indice da fila, a coluna replay_payload e a coluna external_id (so aditivo; nenhum dado anterior depende delas).
-- Rollback (SQL executável, na ordem):
--   drop index if exists public.webhook_failures_replay_pendente_idx;
--   alter table public.webhook_failures drop column if exists replay_payload;
--   alter table public.webhook_failures drop column if exists external_id;
--
-- Dead-letter de webhooks (E35) ganha o que faltava para REPLAY: a tabela já
-- existia desde 20260830153000, mas nenhuma coluna guardava a identidade do
-- evento nem os argumentos mínimos para reprocessá-lo — logo a dead-letter era
-- só um registro de diagnóstico, nunca uma fila reprocessável.
--
--   * external_id  — id do evento no provedor (key.id do WhatsApp). É a chave de
--                    idempotência do replay: a RPC ingest_inbound_message usa o
--                    índice único ux_messages_dedup (whatsapp_connection_id,
--                    external_id, sender), então reprocessar o mesmo external_id
--                    atualiza/no-op em vez de duplicar a mensagem.
--   * replay_payload — argumentos do ingest já validados (p_connection_id,
--                    p_phone, p_content...). Contém o telefone do contato porque
--                    NÃO há replay sem ele; por isso a coluna vive só nesta
--                    tabela, cujo acesso é exclusivo do service_role (RLS +
--                    ACL, ver 20260831120000 e grants abaixo). O snapshot de
--                    DIAGNÓSTICO continua em payload_truncated, que NÃO recebe
--                    telefone nem conteúdo (ver _shared/webhook-dead-letter.ts).
--
-- ADD COLUMN sem NOT NULL/DEFAULT: 100% aditivo, as linhas existentes seguem
-- válidas e continuam sem replay (replay_payload NULL = fora da fila).
ALTER TABLE public.webhook_failures
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS replay_payload JSONB;

COMMENT ON COLUMN public.webhook_failures.external_id IS
  'Id do evento no provedor (key.id). Chave de idempotencia do replay contra ux_messages_dedup.';
COMMENT ON COLUMN public.webhook_failures.replay_payload IS
  'Argumentos minimos do ingest_inbound_message para reprocessar o evento. Contem telefone: acesso restrito a service_role.';

-- Fila de replay: só linhas não resolvidas com payload reprocessável.
CREATE INDEX IF NOT EXISTS webhook_failures_replay_pendente_idx
  ON public.webhook_failures (endpoint, error_at)
  WHERE NOT resolved AND replay_payload IS NOT NULL;

-- ACL: as colunas novas ficam cobertas pelos grants de TABELA já existentes
-- (service_role com SELECT/INSERT/UPDATE/DELETE; anon/authenticated sem nada).
-- Reafirmar por tabela para o caso de alguém ter concedido por coluna.
REVOKE ALL ON public.webhook_failures FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_failures TO service_role;
