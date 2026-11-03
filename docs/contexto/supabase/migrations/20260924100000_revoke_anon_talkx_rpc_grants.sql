REVOKE EXECUTE ON FUNCTION public.reschedule_talkx_recipient(uuid, uuid, timestamptz, text) FROM PUBLIC, anon, authenticated

REVOKE EXECUTE ON FUNCTION public.transition_talkx_campaign(uuid, text, text) FROM PUBLIC, anon, authenticated
