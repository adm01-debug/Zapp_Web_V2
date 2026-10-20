BEGIN;
-- Execucao REAL do bloco "-- Rollback" da migration 20261013042745_audit_admin_changes.sql.
drop trigger if exists trg_audit_admin_profile_access on public.profiles;
drop trigger if exists trg_audit_admin_agent_visibility_grants on public.agent_visibility_grants;
drop trigger if exists trg_audit_admin_global_settings on public.global_settings;
drop trigger if exists trg_audit_admin_ip_whitelist on public.ip_whitelist;
drop trigger if exists trg_audit_admin_blocked_ips on public.blocked_ips;
drop trigger if exists trg_audit_admin_blocked_countries on public.blocked_countries;
drop trigger if exists trg_audit_admin_geo_blocking_settings on public.geo_blocking_settings;
drop trigger if exists trg_audit_admin_rate_limit_configs on public.rate_limit_configs;
drop function if exists public.audit_admin_change();
select 'gatilhos restantes=' || count(*)::text from pg_trigger where not tgisinternal and tgname like 'trg_audit_admin_%';
select 'funcao restante=' || count(*)::text from pg_proc where proname = 'audit_admin_change';
ROLLBACK;
