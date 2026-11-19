REVOKE EXECUTE ON FUNCTION public.expire_stale_agent_presence() FROM PUBLIC, anon, authenticated

REVOKE EXECUTE ON FUNCTION public.notify_due_reminders() FROM anon, authenticated
