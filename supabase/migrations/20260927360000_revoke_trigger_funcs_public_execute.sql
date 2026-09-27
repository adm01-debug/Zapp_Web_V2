-- Revogar EXECUTE de PUBLIC em funções trigger (Codex P2)
-- PR #985 revogou de `anon`; este migration revoga de PUBLIC (=X/postgres)
-- que permanecia mesmo após o PR #985.
-- Inclui também revogação de `anon` de bump_conversation_updated_at,
-- que não estava no escopo do PR #985.

REVOKE EXECUTE ON FUNCTION public.bump_conversation_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_conversation_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_conversation_status_transition() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_contact_assignee_hijack() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_contact_queue_hijack() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_conversation_task_field_forgery() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_default_goals_for_profile() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_scheduled_report_config_owner() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_talkx_increment_replied_count() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_talkx_increment_template_use_count() FROM PUBLIC;
