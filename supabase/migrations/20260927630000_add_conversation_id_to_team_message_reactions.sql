-- Migration: add conversation_id to team_message_reactions
-- Allows efficient filtering by conversation in Realtime and direct queries

ALTER TABLE team_message_reactions
  ADD COLUMN conversation_id uuid
    REFERENCES team_conversations(id) ON DELETE CASCADE;

UPDATE team_message_reactions tmr
SET conversation_id = tm.conversation_id
FROM team_messages tm
WHERE tmr.message_id = tm.id;

ALTER TABLE team_message_reactions
  ALTER COLUMN conversation_id SET NOT NULL;

CREATE INDEX idx_team_message_reactions_conversation_id
  ON team_message_reactions(conversation_id);
