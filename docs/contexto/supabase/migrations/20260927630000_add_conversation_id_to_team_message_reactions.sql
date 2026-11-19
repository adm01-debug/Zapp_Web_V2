ALTER TABLE public.team_message_reactions ADD COLUMN conversation_id uuid REFERENCES public.team_conversations(id) ON DELETE CASCADE

UPDATE public.team_message_reactions tmr SET conversation_id = tm.conversation_id FROM public.team_messages tm WHERE tmr.message_id = tm.id

ALTER TABLE public.team_message_reactions ALTER COLUMN conversation_id SET NOT NULL

CREATE INDEX idx_team_message_reactions_conversation_id ON public.team_message_reactions(conversation_id)
