-- E52 — team_message_receipts: desnormalizar conversation_id
-- Permite filtro server-side no Realtime: conversation_id=eq.<cid>
-- sem receber todos os recibos do sistema em cada cliente conectado.

-- 1. Coluna nullable inicialmente para suportar backfill
ALTER TABLE team_message_receipts
  ADD COLUMN IF NOT EXISTS conversation_id uuid;

-- 2. Backfill a partir da tabela pai
UPDATE team_message_receipts r
SET conversation_id = m.conversation_id
FROM team_messages m
WHERE m.id = r.message_id
  AND r.conversation_id IS NULL;

-- 3. Remover recibos órfãos (message_id sem pai — não devem existir pós-Block B)
DELETE FROM team_message_receipts
WHERE conversation_id IS NULL;

-- 4. NOT NULL após backfill
ALTER TABLE team_message_receipts
  ALTER COLUMN conversation_id SET NOT NULL;

-- 5. FK para garantir consistência referencial
ALTER TABLE team_message_receipts
  ADD CONSTRAINT fk_team_message_receipts_conversation
  FOREIGN KEY (conversation_id)
  REFERENCES team_conversations (id)
  ON DELETE CASCADE;

-- 6. Trigger para preenchimento automático em novos registros
CREATE OR REPLACE FUNCTION team_message_receipts_set_conversation_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.conversation_id IS NULL THEN
    SELECT conversation_id INTO NEW.conversation_id
    FROM team_messages
    WHERE id = NEW.message_id;
    IF NEW.conversation_id IS NULL THEN
      RAISE EXCEPTION 'message_id % não encontrado em team_messages', NEW.message_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION team_message_receipts_set_conversation_id() FROM PUBLIC, anon;

CREATE TRIGGER trg_team_message_receipts_conversation_id
BEFORE INSERT OR UPDATE OF message_id ON team_message_receipts
FOR EACH ROW EXECUTE FUNCTION team_message_receipts_set_conversation_id();

-- 7. Índice primário para filtro server-side de Realtime (conversation_id=eq.<cid>)
CREATE INDEX IF NOT EXISTS idx_team_message_receipts_conversation_profile
  ON team_message_receipts (conversation_id, profile_id);

-- 8. Índice de JOIN eficiente no RPC mark_team_messages_read
CREATE INDEX IF NOT EXISTS idx_team_message_receipts_message_profile
  ON team_message_receipts (message_id, profile_id);
