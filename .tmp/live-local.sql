\set ON_ERROR_STOP on
-- Prova viva no BANCO LOCAL da tarefa, como o caminho do PostgREST: SET LOCAL ROLE
-- authenticated + JWT sintetico. Nao persiste: termina em ROLLBACK.
begin;

-- admin sintetico (usuario + papel), sem tocar dado real
insert into auth.users (id, email, raw_user_meta_data)
  values ('99999999-9999-9999-9999-99999999999e', 'admin.local@test.invalid',
          '{"name":"ADMIN LOCAL"}'::jsonb)
  on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('99999999-9999-9999-9999-99999999999e', 'admin')
  on conflict (user_id, role) do nothing;
insert into public.audit_logs (user_id, action, created_at)
  values ('99999999-9999-9999-9999-99999999999e', 'login', now() - interval '1 minute');

\echo '-- BASE DIRETA (postgres, sem RLS) para comparar com a RPC --'
select
  (select count(*) from public.audit_logs
     where created_at >= now() - interval '1 day' and created_at < now()) as direto_total,
  (select count(distinct user_id) from public.audit_logs
     where created_at >= now() - interval '1 day' and created_at < now()
       and user_id is not null) as direto_unicos,
  (select count(*) from public.audit_logs a
     where a.action = 'login' and a.created_at >= now() - interval '7 days' and a.created_at < now()
       and exists (select 1 from public.user_roles ur where ur.user_id = a.user_id and ur.role = 'admin')) as direto_admin_logins_7d;

select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-9999-9999-9999-99999999999e', 'role', 'authenticated')::text, true);
set local role authenticated;
\echo '-- resumo como ADMIN (authenticated + jwt admin) --'
select total_logs, sensitive_actions, unique_users, denied_24h, permission_changes_24h, admin_logins_7d, rls_failures_24h
  from public.audit_log_summary(now() - interval '1 day', now());
\echo '-- lista como ADMIN (authenticated + jwt admin) --'
select count(*) as linhas from public.audit_log_list(now() - interval '1 day', now(), null, null, 5);
reset role;

\echo '-- resumo como AGENTE (authenticated sem papel admin) --'
select set_config('request.jwt.claims',
  json_build_object('sub', '88888888-8888-8888-8888-88888888888f', 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) as linhas_agente from public.audit_log_summary(now() - interval '1 day', now());
select count(*) as linhas_lista_agente from public.audit_log_list(now() - interval '1 day', now(), null, null, 5);
reset role;

rollback;
