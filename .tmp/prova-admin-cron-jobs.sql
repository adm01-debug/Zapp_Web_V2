\pset pager off
\set ON_ERROR_STOP on

-- Prova de permissao e comportamento no banco LOCAL desta tarefa (nunca producao).
-- Usuarios sinteticos so para a prova. Tudo numa transacao terminada em ROLLBACK: nada persiste.
begin;

set local session_replication_role = replica;
insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000000a1'),  -- admin
  ('00000000-0000-4000-8000-0000000000b2');  -- nao-admin
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin'),
  ('00000000-0000-4000-8000-0000000000b2', 'agent');
set local session_replication_role = origin;

-- 1) ACL real por funcao (f=nega, t=permite)
select
  has_function_privilege('anon',          'public.admin_list_cron_jobs()',              'EXECUTE') as "anon_lista_f",
  has_function_privilege('service_role',  'public.admin_list_cron_jobs()',              'EXECUTE') as "service_lista_f",
  has_function_privilege('authenticated', 'public.admin_list_cron_jobs()',              'EXECUTE') as "auth_lista_t",
  has_function_privilege('anon',          'public.admin_toggle_cron_job(text,boolean)', 'EXECUTE') as "anon_toggle_f",
  has_function_privilege('service_role',  'public.admin_toggle_cron_job(text,boolean)', 'EXECUTE') as "service_toggle_f",
  has_function_privilege('authenticated', 'public.admin_toggle_cron_job(text,boolean)', 'EXECUTE') as "auth_toggle_t",
  has_function_privilege('authenticated', 'public.admin_cron_jobs_permitidos()',        'EXECUTE') as "auth_helper_f";

-- 2) anon (ACL) e authenticated nao-admin (guarda) -> 42501; admin lista
do $$
declare v_admin uuid := '00000000-0000-4000-8000-0000000000a1';
        v_user  uuid := '00000000-0000-4000-8000-0000000000b2';
begin
  begin
    set local role anon;
    perform * from public.admin_list_cron_jobs();
    reset role;
    raise notice 'B anon: FALHA (executou sem EXECUTE)';
  exception when insufficient_privilege then
    reset role; raise notice 'B anon: PASS (ACL 42501)';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);
  begin
    set local role authenticated;
    perform * from public.admin_list_cron_jobs();
    reset role;
    raise notice 'C nao-admin: FALHA (executou sem ser admin)';
  exception when insufficient_privilege then
    reset role; raise notice 'C nao-admin: PASS (guarda 42501)';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  set local role authenticated;
  perform 1 from public.admin_list_cron_jobs();
  reset role;
  raise notice 'D admin: PASS (listagem executou)';
end $$;

-- 3) Recusas: job de manutencao e job desconhecido (fora da lista) -> 22023
do $$
declare v_admin uuid := '00000000-0000-4000-8000-0000000000a1';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  begin
    set local role authenticated;
    perform public.admin_toggle_cron_job('vacuum-contacts-daily', false);
    reset role; raise notice 'E manutencao: FALHA (aceitou job de manutencao)';
  exception when others then
    reset role; raise notice 'E manutencao: PASS (recusado, 22023=%)', sqlstate = '22023';
  end;

  begin
    set local role authenticated;
    perform public.admin_toggle_cron_job('job-que-nao-existe', true);
    reset role; raise notice 'F desconhecido: FALHA (aceitou job fora da lista)';
  exception when others then
    reset role; raise notice 'F desconhecido: PASS (recusado, 22023=%)', sqlstate = '22023';
  end;
end $$;

-- 4) Caminho de sucesso que o banco LOCAL consegue exercer: job JA no estado pedido ->
--    sem mexer no pg_cron, grava auditoria e responde (idempotente).
--    (No local todos os jobs ficam em active=false; por isso o alvo e o estado atual.)
select active as "antes", jobid as "jobid_antes" from cron.job where jobname = 'talkx-scheduler-1min';

do $$
declare v_admin uuid := '00000000-0000-4000-8000-0000000000a1';
        v_r1 jsonb; v_r2 jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  set local role authenticated;
  v_r1 := public.admin_toggle_cron_job('talkx-scheduler-1min', false);
  reset role;
  raise notice 'G admin no-op: PASS (alterado=%, ativo=%)', v_r1->>'alterado', v_r1->>'ativo';

  set local role authenticated;
  v_r2 := public.admin_toggle_cron_job('talkx-scheduler-1min', false);
  reset role;
  raise notice 'H admin idempotente: PASS (alterado=%)', v_r2->>'alterado';
end $$;

select active as "depois", jobid as "jobid_depois" from cron.job where jobname = 'talkx-scheduler-1min';

-- 5) Auditoria gravada pelo caminho de sucesso
select action, entity_type, count(*) as linhas,
       bool_and(details ? 'jobname' and details ? 'ativo_antes' and details ? 'ativo_depois') as detalhes_ok
from public.audit_logs
where action = 'admin_cron_job_toggle'
group by action, entity_type;

-- 6) Limite do banco LOCAL (nao do codigo): aqui o papel postgres nao tem EXECUTE em
--    cron.alter_job (na producao tem -- ver comentario do zapp-db-local). Prova que o ramo
--    "estado diferente" chega a chamar cron.alter_job e onde ele para NESTE ambiente.
do $$
declare v_admin uuid := '00000000-0000-4000-8000-0000000000a1';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  begin
    set local role authenticated;
    perform public.admin_toggle_cron_job('talkx-scheduler-1min', true);
    reset role; raise notice 'I ramo alter_job: chegou ao fim';
  exception when others then
    reset role; raise notice 'I ramo alter_job: limite LOCAL esperado -> %', sqlerrm;
  end;
end $$;

rollback;
