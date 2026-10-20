drop trigger if exists trg_automation_events_on_tags on public.contacts;
drop trigger if exists trg_automation_events_on_message on public.messages;
drop function if exists public.enqueue_automation_events_on_tags();
drop function if exists public.enqueue_automation_events_on_message();
drop index if exists public.idx_automations_active_trigger_type;
drop table if exists public.automation_executions;
drop table if exists public.automation_events;
