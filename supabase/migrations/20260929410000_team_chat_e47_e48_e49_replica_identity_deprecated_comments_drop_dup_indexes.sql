-- E47: REPLICA IDENTITY DEFAULT em team_messages
-- payload.old nao e usado no modulo team-chat; DEFAULT e mais eficiente (so PK no WAL)
ALTER TABLE public.team_messages REPLICA IDENTITY DEFAULT;

-- E48: marcar funcoes substituidas como deprecated
COMMENT ON FUNCTION public.get_team_conversation_previews() IS 'deprecated: usar get_team_inbox()';
COMMENT ON FUNCTION public.get_team_unread_counts() IS 'deprecated: usar get_team_inbox()';

-- E49: remover indexes duplicados
-- idx_team_messages_conversation duplica idx_team_messages_conv_created (conversation_id, created_at DESC)
DROP INDEX IF EXISTS public.idx_team_messages_conversation;
-- idx_team_messages_reply_to_id duplica idx_team_messages_reply_to (reply_to_id WHERE NOT NULL eh mais seletivo)
DROP INDEX IF EXISTS public.idx_team_messages_reply_to_id;
-- idx_team_members_profile duplica idx_team_conv_members_profile_id
DROP INDEX IF EXISTS public.idx_team_members_profile;
