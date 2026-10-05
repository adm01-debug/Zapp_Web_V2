-- supabase/tests/transfer_contact_rls.sql
-- P1 #88 (R2-INB-009): prova, no banco LOCAL, que public.transfer_contact (SECURITY INVOKER)
-- autoriza/recusa como a RLS manda, que o evento e UNICO por transferencia, que a nota vai para
-- conversation_events.metadata.note e que erro desfaz tudo (rollback total).
--
-- COMO RODAR (conjunto local da tarefa; NUNCA producao):
--   zapp-db-local psql <copia> <conjunto> -v ON_ERROR_STOP=1 < supabase/tests/transfer_contact_rls.sql
-- Roda como postgres (o wrapper mcp_exec/service_role nao serve: BYPASSRLS), cria fixtures proprias e
-- usa SET LOCAL ROLE authenticated para exercer a RLS de verdade. Tudo numa transacao terminada em
-- ROLLBACK: zero residuo. Saida: linhas result/test/detail; qualquer FAIL derruba o exit code.

begin;

create temp table _res (result text, test text, detail text) on commit drop;

-- fixtures (postgres). Os usuarios criam profiles/user_roles pelos triggers on_auth_user_created.
insert into auth.users(id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111','owner@promobrindes.com.br','{"name":"Owner"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222','other@promobrindes.com.br','{"name":"Other"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333','target@promobrindes.com.br','{"name":"Target"}'::jsonb);

insert into public.queues(id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001'::uuid,'Minha Fila'),
  ('aaaaaaaa-0000-0000-0000-000000000002'::uuid,'Fila do Outro'),
  ('aaaaaaaa-0000-0000-0000-000000000003'::uuid,'Fila Destino');

insert into public.queue_members(queue_id, profile_id, is_active)
  select 'aaaaaaaa-0000-0000-0000-000000000001'::uuid, id, true from public.profiles
   where user_id = '11111111-1111-1111-1111-111111111111'
  union all
  select 'aaaaaaaa-0000-0000-0000-000000000003'::uuid, id, true from public.profiles
   where user_id = '11111111-1111-1111-1111-111111111111'
  union all
  select 'aaaaaaaa-0000-0000-0000-000000000002'::uuid, id, true from public.profiles
   where user_id = '22222222-2222-2222-2222-222222222222';

-- c1: dono = Other, fila do Outro  -> Owner NAO tem alcance (controle de not_authorized)
insert into public.contacts(id, name, phone, assigned_to, queue_id)
  select 'cccccccc-0000-0000-0000-000000000001'::uuid,'Controle fora do alcance','fx1', p.id,
         'aaaaaaaa-0000-0000-0000-000000000002'::uuid
    from public.profiles p where p.user_id = '22222222-2222-2222-2222-222222222222';
-- c2: dono = Owner, fila Minha Fila -> destino AGENTE invalido
insert into public.contacts(id, name, phone, assigned_to, queue_id)
  select 'cccccccc-0000-0000-0000-000000000002'::uuid,'Destino agente invalido','fx2', p.id,
         'aaaaaaaa-0000-0000-0000-000000000001'::uuid
    from public.profiles p where p.user_id = '11111111-1111-1111-1111-111111111111';
-- c3: dono = Owner -> destino FILA invalida (Owner nao e membro da Fila do Outro)
insert into public.contacts(id, name, phone, assigned_to, queue_id)
  select 'cccccccc-0000-0000-0000-000000000003'::uuid,'Destino fila invalida','fx3', p.id,
         'aaaaaaaa-0000-0000-0000-000000000001'::uuid
    from public.profiles p where p.user_id = '11111111-1111-1111-1111-111111111111';
-- c4: sucesso AGENTE + nota
insert into public.contacts(id, name, phone, assigned_to, queue_id)
  select 'cccccccc-0000-0000-0000-000000000004'::uuid,'Sucesso agente','fx4', p.id,
         'aaaaaaaa-0000-0000-0000-000000000001'::uuid
    from public.profiles p where p.user_id = '11111111-1111-1111-1111-111111111111';
-- c5: sucesso FILA + nota (Owner e membro da Minha Fila e da Fila Destino)
insert into public.contacts(id, name, phone, assigned_to, queue_id)
  select 'cccccccc-0000-0000-0000-000000000005'::uuid,'Sucesso fila','fx5', p.id,
         'aaaaaaaa-0000-0000-0000-000000000001'::uuid
    from public.profiles p where p.user_id = '11111111-1111-1111-1111-111111111111';

-- ids resolvidos AGORA, como postgres: a RLS de profiles esconde de um agente o profile de terceiros,
-- entao o bloco impersonado nao pode descobri-los por subconsulta.
select set_config('app.fx_owner_profile',
  (select id::text from public.profiles where user_id = '11111111-1111-1111-1111-111111111111'), true);
select set_config('app.fx_other_profile',
  (select id::text from public.profiles where user_id = '22222222-2222-2222-2222-222222222222'), true);
select set_config('app.fx_target_profile',
  (select id::text from public.profiles where user_id = '33333333-3333-3333-3333-333333333333'), true);

insert into _res select
  case when to_regprocedure('public.transfer_contact(uuid,text,uuid,text)') is not null then 'PASS' else 'FAIL' end,
  'T0: RPC public.transfer_contact existe',
  coalesce(to_regprocedure('public.transfer_contact(uuid,text,uuid,text)')::text,'ausente');

-- RPC SECURITY INVOKER: quem autoriza o destino e a RLS/triggers, nao a funcao.
insert into _res select
  case when not prosecdef then 'PASS' else 'FAIL' end,
  'T0b: transfer_contact e SECURITY INVOKER (nao contorna a RLS)',
  'prosecdef=' || prosecdef
from pg_proc where proname = 'transfer_contact' and pronamespace = 'public'::regnamespace;

-- Impersona o Owner (agent comum, sem privilegio de admin/supervisor).
select set_config('request.jwt.claims',
  json_build_object('sub','11111111-1111-1111-1111-111111111111','role','authenticated')::text, true);

-- T1: contato de ORIGEM fora do alcance -> recusa; nada muda.
set local role authenticated;
do $t$ declare v text := 'NAO-RECUSOU'; begin
  begin
    perform public.transfer_contact('cccccccc-0000-0000-0000-000000000001'::uuid, 'agent',
      current_setting('app.fx_owner_profile')::uuid);
  exception when others then v := 'recusou: ' || sqlstate || ' ' || sqlerrm; end;
  perform set_config('app.t1', v, true);
end $t$;
reset role;
insert into _res select
  case when current_setting('app.t1', true) like 'recusou:%' then 'PASS' else 'FAIL' end,
  'T1: origem fora do alcance e recusada (not_authorized)',
  current_setting('app.t1', true);
insert into _res select
  case when (select assigned_to from public.contacts where id='cccccccc-0000-0000-0000-000000000001')
              = current_setting('app.fx_other_profile')::uuid
            and (select count(*) from public.conversation_events
                   where contact_id='cccccccc-0000-0000-0000-000000000001') = 0
       then 'PASS' else 'FAIL' end,
  'T1b: recusa nao alterou o contato nem criou evento',
  'eventos_contato=' || (select count(*) from public.conversation_events
                          where contact_id='cccccccc-0000-0000-0000-000000000001');

-- T2: destino AGENTE invalido (uuid aleatorio) -> recusa; contato intacto.
set local role authenticated;
do $t$ declare v text := 'NAO-RECUSOU'; begin
  begin
    perform public.transfer_contact('cccccccc-0000-0000-0000-000000000002'::uuid, 'agent',
      '99999999-9999-9999-9999-999999999999'::uuid);
  exception when others then v := 'recusou: ' || sqlstate || ' ' || sqlerrm; end;
  perform set_config('app.t2', v, true);
end $t$;
reset role;
insert into _res select
  case when current_setting('app.t2', true) like 'recusou:%' then 'PASS' else 'FAIL' end,
  'T2: destino agente invalido e recusado',
  current_setting('app.t2', true);
insert into _res select
  case when (select assigned_to from public.contacts where id='cccccccc-0000-0000-0000-000000000002')
              = current_setting('app.fx_owner_profile')::uuid
            and (select count(*) from public.conversation_events
                   where contact_id='cccccccc-0000-0000-0000-000000000002') = 0
       then 'PASS' else 'FAIL' end,
  'T2b: rollback total - contato intacto e zero evento',
  'eventos_contato=' || (select count(*) from public.conversation_events
                          where contact_id='cccccccc-0000-0000-0000-000000000002');

-- T3: destino FILA invalida (Owner nao e membro) -> recusa; contato intacto.
set local role authenticated;
do $t$ declare v text := 'NAO-RECUSOU'; begin
  begin
    perform public.transfer_contact('cccccccc-0000-0000-0000-000000000003'::uuid, 'queue',
      'aaaaaaaa-0000-0000-0000-000000000002'::uuid);
  exception when others then v := 'recusou: ' || sqlstate || ' ' || sqlerrm; end;
  perform set_config('app.t3', v, true);
end $t$;
reset role;
insert into _res select
  case when current_setting('app.t3', true) like 'recusou:%' then 'PASS' else 'FAIL' end,
  'T3: destino fila invalida e recusado',
  current_setting('app.t3', true);
insert into _res select
  case when (select queue_id from public.contacts where id='cccccccc-0000-0000-0000-000000000003')
              = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
            and (select count(*) from public.conversation_events
                   where contact_id='cccccccc-0000-0000-0000-000000000003') = 0
       then 'PASS' else 'FAIL' end,
  'T3b: rollback total - contato intacto e zero evento',
  'eventos_contato=' || (select count(*) from public.conversation_events
                          where contact_id='cccccccc-0000-0000-0000-000000000003');

-- T4: sucesso AGENTE -> 1 evento, event_type legado 'transfer', nota e destino corretos.
set local role authenticated;
do $t$ declare v text := 'NAO-RECUSOU'; begin
  begin
    perform public.transfer_contact('cccccccc-0000-0000-0000-000000000004'::uuid, 'agent',
      current_setting('app.fx_target_profile')::uuid, 'nota do T4');
  exception when others then v := 'recusou: ' || sqlstate || ' ' || sqlerrm; end;
  perform set_config('app.t4', v, true);
end $t$;
reset role;
insert into _res select
  case when current_setting('app.t4', true) = 'NAO-RECUSOU' then 'PASS' else 'FAIL' end,
  'T4: transferencia para agente ativo aceita',
  current_setting('app.t4', true);
insert into _res select
  case when (select assigned_to from public.contacts where id='cccccccc-0000-0000-0000-000000000004')
              = current_setting('app.fx_target_profile')::uuid
            and (select count(*) from public.conversation_events
                   where contact_id='cccccccc-0000-0000-0000-000000000004') = 1
            and exists (select 1 from public.conversation_events
                         where contact_id='cccccccc-0000-0000-0000-000000000004'
                           and event_type = 'transfer'
                           and to_agent_id = current_setting('app.fx_target_profile')::uuid
                           and metadata->>'note' = 'nota do T4')
       then 'PASS' else 'FAIL' end,
  'T4b: UM evento, event_type legado ''transfer'', destino e metadata.note corretos',
  (select format('eventos=%s tipo=%s nota=%s', count(*), min(event_type), min(metadata->>'note'))
     from public.conversation_events where contact_id='cccccccc-0000-0000-0000-000000000004');

-- T5: sucesso FILA -> 1 evento, event_type legado 'queue_transfer', nota e destino corretos.
set local role authenticated;
do $t$ declare v text := 'NAO-RECUSOU'; begin
  begin
    perform public.transfer_contact('cccccccc-0000-0000-0000-000000000005'::uuid, 'queue',
      'aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'nota do T5');
  exception when others then v := 'recusou: ' || sqlstate || ' ' || sqlerrm; end;
  perform set_config('app.t5', v, true);
end $t$;
reset role;
insert into _res select
  case when current_setting('app.t5', true) = 'NAO-RECUSOU' then 'PASS' else 'FAIL' end,
  'T5: transferencia para fila permitida aceita',
  current_setting('app.t5', true);
insert into _res select
  case when (select queue_id from public.contacts where id='cccccccc-0000-0000-0000-000000000005')
              = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
            and (select count(*) from public.conversation_events
                   where contact_id='cccccccc-0000-0000-0000-000000000005') = 1
            and exists (select 1 from public.conversation_events
                         where contact_id='cccccccc-0000-0000-0000-000000000005'
                           and event_type = 'queue_transfer'
                           and to_queue_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
                           and metadata->>'note' = 'nota do T5')
       then 'PASS' else 'FAIL' end,
  'T5b: UM evento, event_type legado ''queue_transfer'', destino e metadata.note corretos',
  (select format('eventos=%s tipo=%s nota=%s', count(*), min(event_type), min(metadata->>'note'))
     from public.conversation_events where contact_id='cccccccc-0000-0000-0000-000000000005');

-- T6: no conjunto todo foram criados exatamente 2 eventos (1 por transferencia bem-sucedida);
-- as recusas de T1/T2/T3 nao deixaram nenhum.
insert into _res select
  case when (select count(*) from public.conversation_events
               where contact_id::text like 'cccccccc-0000-0000-0000-00000000000%') = 2
       then 'PASS' else 'FAIL' end,
  'T6: um unico evento por transferencia bem-sucedida (total = 2)',
  'total_eventos=' || (select count(*) from public.conversation_events
                        where contact_id::text like 'cccccccc-0000-0000-0000-00000000000%');

select result, test, detail from _res order by test;

do $t$ declare v int; begin
  select count(*) into v from _res where result = 'FAIL';
  if v > 0 then raise exception 'SUITE transfer_contact_rls: % FAIL', v; end if;
  raise notice 'SUITE transfer_contact_rls: tudo PASS';
end $t$;

rollback;
