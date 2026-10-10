-- E07: UNIQUE index para deduplicação de mensagens
-- Impede duplicatas via webhook double-delivery ou race condition
-- Aplicado em produção via db_query + INSERT manual em schema_migrations
CREATE UNIQUE INDEX IF NOT EXISTS ux_messages_dedup
  ON public.messages (whatsapp_connection_id, external_id, sender)
  WHERE external_id IS NOT NULL;
