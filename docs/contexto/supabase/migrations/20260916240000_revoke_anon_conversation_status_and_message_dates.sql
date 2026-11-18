REVOKE EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) FROM anon

REVOKE EXECUTE ON FUNCTION public.get_last_message_dates(uuid[]) FROM anon

REVOKE ALL ON FUNCTION public.set_conversation_status(uuid, text, text) FROM PUBLIC

REVOKE ALL ON FUNCTION public.get_last_message_dates(uuid[]) FROM PUBLIC

GRANT EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) TO authenticated, service_role

GRANT EXECUTE ON FUNCTION public.get_last_message_dates(uuid[]) TO authenticated, service_role
