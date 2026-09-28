ALTER TABLE team_message_reactions ADD COLUMN conversation_id uuid NOT NULL REFERENCES team_conversations(id) ON DELETE CASCADE;
CREATE INDEX idx_team_message_reactions_conversation_id ON team_message_reactions(conversation_id)
