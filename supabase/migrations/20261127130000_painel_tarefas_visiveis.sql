-- 20261127130000_painel_tarefas_visiveis
--
-- Rollback (SQL executavel, na ordem): DROP FUNCTION IF EXISTS public.admin_list_cron_jobs();
-- e reaplicar o bloco `admin_list_cron_jobs` + as ACL da migration
-- 20261011173000_admin_cron_jobs.sql (retorno SEM a coluna `permitido`). Nenhum dado e
-- tocado: esta funcao so LE cron.job/cron.job_run_details.
--
-- CAUSA (achado em 26/11/2026): admin_list_cron_jobs() listava apenas os nomes de
-- public.admin_cron_jobs_permitidos() — 9 jobs, lista congelada em 11/10/2026. Todo job
-- criado depois disso ficou invisivel na aba "Tarefas agendadas", inclusive
-- copilot-retention-daily, que acumulou 7 falhas em 7 dias sem aparecer em tela alguma (o
-- defeito so foi encontrado por consulta direta ao cron.job_run_details).
--
-- CORRECAO: a LEITURA passa a trazer TODOS os jobs do pg_cron do banco (30 hoje) e a coluna
-- nova `permitido` diz se aquele job aceita ligar/desligar pelo painel. O ESCOPO DE ESCRITA
-- nao muda: admin_toggle_cron_job() continua recusando (22023) todo nome fora da allow-list,
-- entao jobs de manutencao (VACUUM) e de limpeza seguem sem caminho de pausa — a decisao de
-- 11/10/2026 permanece intacta.
--
-- `create or replace` nao troca tipo de retorno: o drop/create vai na MESMA transacao (begin/
-- commit no proprio arquivo) e as ACL sao reconcedidas logo abaixo, sem janela em que a
-- funcao deixe de existir para o aplicativo.

begin;

drop function if exists public.admin_list_cron_jobs();

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
$$;

comment on function public.admin_list_cron_jobs() is
  'Painel admin (Tarefas agendadas): devolve TODOS os jobs do pg_cron com a ultima execucao; `permitido` marca os que admin_toggle_cron_job aceita ligar/desligar (allow-list fixa). SECURITY DEFINER com guarda is_admin(auth.uid()).';

revoke all on function public.admin_list_cron_jobs() from public, anon, service_role;
grant execute on function public.admin_list_cron_jobs() to authenticated;

commit;
