DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.bump_conversation_updated_at() FROM PUBLIC; EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.bump_conversation_updated_at() FROM anon; EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.enforce_conversation_status_transition() FROM PUBLIC; EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.prevent_contact_assignee_hijack() FROM PUBLIC; EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.prevent_contact_queue_hijack() FROM PUBLIC; EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.prevent_conversation_task_field_forgery() FROM PUBLIC; EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.seed_default_goals_for_profile() FROM PUBLIC; EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.set_scheduled_report_config_owner() FROM PUBLIC; EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.trg_talkx_increment_replied_count() FROM PUBLIC; EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.trg_talkx_increment_template_use_count() FROM PUBLIC; EXCEPTION WHEN undefined_function THEN NULL; END $$;
