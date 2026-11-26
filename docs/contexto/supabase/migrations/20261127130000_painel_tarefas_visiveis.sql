begin

drop function if exists public.admin_list_cron_jobs()

create function public.admin_list_cron_jobs()
returns table (
  jobname text,
  schedule text,
  active boolean,
  last_status text,
  last_run_at timestamp with time zone,
  last_return_message text,
  permitido boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, cron
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin_list_cron_jobs: acesso restrito a administradores'
      using errcode = '42501';
  end if;

  return query
  select j.jobname::text,
         j.schedule::text,
         j.active,
         d.status,
         d.start_time,
         left(coalesce(d.return_message, ''), 200),
         j.jobname = any (public.admin_cron_jobs_permitidos())
  from cron.job j
  left join lateral (
    select r.status, r.start_time, r.return_message
    from cron.job_run_details r
    where r.jobid = j.jobid
    order by r.start_time desc
    limit 1
  ) d on true
  order by j.jobname;
end;
$$

comment on function public.admin_list_cron_jobs() is
  'Painel admin (Tarefas agendadas): devolve TODOS os jobs do pg_cron com a ultima execucao; `permitido` marca os que admin_toggle_cron_job aceita ligar/desligar (allow-list fixa). SECURITY DEFINER com guarda is_admin(auth.uid()).'

revoke all on function public.admin_list_cron_jobs() from public, anon, service_role

grant execute on function public.admin_list_cron_jobs() to authenticated

commit
