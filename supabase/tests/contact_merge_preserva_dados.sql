-- supabase/tests/contact_merge_preserva_dados.sql
-- Suite de regressao da mesclagem de contatos (merge_contacts_atomic / migration 20261013051239).
-- Prova: (1) dado que so existia no secundario sobrevive no principal; (2) secundario vira soft-delete
-- com rastro (deleted_at, deletion_reason='merged', merged_into_id, merged_at, merged_phone) e telefone
-- liberado; (3) FKs (mensagens, notas, campos personalizados, conversas) movidas sem duplicar; (4)
-- trilha append-only em contact_merge_audit; (5) idempotencia; (6) agente comum negado; (7) ACL.
-- Roda em transacao unica (BEGIN..ROLLBACK): nada persiste. Sem EXCEPTION = suite verde.
-- Casos: (T1) campo so do secundario sobrevive + soft-delete com rastro + phone liberado +
--        mensagens/notas/campos personalizados/conversas movidos sem duplicar + auditoria;
--        (T2) mescla repetida idempotente; (T3) agente comum negado; (T4) anon sem EXECUTE;
--        (T5) secundario ja mesclado em OUTRO principal recusado (fail-closed).

\set ON_ERROR_STOP on

begin;

-- ===== fixtures (postgres) ===================================================
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000a0001','authenticated','authenticated','merge.sec@test.local','',now(),now(),now());

create temp table mrg on commit drop as
select (select id from public.profiles where user_id = '00000000-0000-0000-0000-0000000a0001') as prof;

insert into public.contacts (id, name, phone, conversation_status) values
  ('00000000-0000-0000-0000-0000000c0001','Principal','+5511900000001','open'),
  ('00000000-0000-0000-0000-0000000c0002','Secundario','+5511900000002','open');

update public.contacts set email = 'sec@ex.com', company = 'ACME', job_title = 'Chefe'
 where id = '00000000-0000-0000-0000-0000000c0002';

insert into public.messages (id, contact_id, sender, content, updated_at)
values ('00000000-0000-0000-0000-0000000d0001','00000000-0000-0000-0000-0000000c0002','contact','mensagem do secundario','2001-01-01 00:00:00+00');

insert into public.contact_notes (id, contact_id, author_id, content)
values ('00000000-0000-0000-0000-0000000d0002','00000000-0000-0000-0000-0000000c0002',(select prof from mrg),'nota do secundario');

insert into public.contact_custom_fields (contact_id, field_name, field_value) values
  ('00000000-0000-0000-0000-0000000c0001','origem','principal'),
  ('00000000-0000-0000-0000-0000000c0002','origem','secundario'),
  ('00000000-0000-0000-0000-0000000c0002','plano','pro');

insert into public.conversation_memory (contact_id, commercial_summary) values
  ('00000000-0000-0000-0000-0000000c0001','mem principal'),
  ('00000000-0000-0000-0000-0000000c0002','mem secundario');

-- T6: contatos/linhas com datas fixas (bem antigas) para provar que o movimento NAO reescreve updated_at.
insert into public.contacts (id, name, phone, conversation_status, updated_at) values
  ('00000000-0000-0000-0000-0000000c0007','Intocado','+5511900000007','open','2001-01-01 00:00:00+00');

-- ===== T1: service_role mescla; nada do secundario se perde ==================
create temp table mrg_phone on commit drop as
select phone as orig from public.contacts where id = '00000000-0000-0000-0000-0000000c0002';

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

select public.merge_contacts_atomic(
  '00000000-0000-0000-0000-0000000c0001',
  array['00000000-0000-0000-0000-0000000c0002']::uuid[],
  '{}'::jsonb
) as t1_retorno;

reset role;
set local request.jwt.claims = '{}';

do $$
declare
  v_p   record;
  v_s   record;
  v_msg uuid;
  v_note uuid;
  v_cf  integer;
  v_mem integer;
  v_aud integer;
  v_ing integer;
  v_novo uuid;
  v_err text;
begin
  select * into v_p from public.contacts where id = '00000000-0000-0000-0000-0000000c0001';
  select * into v_s from public.contacts where id = '00000000-0000-0000-0000-0000000c0002';

  -- (a) campos vazios do principal preenchidos pelo secundario
  if v_p.email is distinct from 'sec@ex.com'
     or v_p.company is distinct from 'ACME'
     or v_p.job_title is distinct from 'Chefe' then
    raise exception 'T1a FALHOU: campo do secundario nao sobreviveu (email=%, company=%, job_title=%)', v_p.email, v_p.company, v_p.job_title;
  end if;
  if v_p.name is distinct from 'Principal' then
    raise exception 'T1a FALHOU: nome do principal foi sobrescrito (%)', v_p.name;
  end if;

  -- (b) secundario soft-deletado com rastro
  if v_s.deleted_at is null or v_s.deletion_reason is distinct from 'merged'
     or v_s.merged_into_id is distinct from '00000000-0000-0000-0000-0000000c0001'
     or v_s.merged_at is null then
    raise exception 'T1b FALHOU: soft-delete/rastro incorreto (%)', v_s;
  end if;
  if v_s.merged_phone is distinct from (select orig from mrg_phone) then
    raise exception 'T1b FALHOU: telefone original nao preservado (%)', v_s.merged_phone;
  end if;
  if v_s.phone !~ '^[0-9]+$' or length(v_s.phone) < 16
     or v_s.phone is not distinct from v_s.merged_phone then
    raise exception 'T1b FALHOU: telefone do secundario nao liberado (%)', v_s.phone;
  end if;

  -- (c) ingest nao acharia contato para o telefone antigo -> criaria um NOVO vivo
  select count(*) into v_ing from public.contacts c
   where c.phone = any(public.phone_variants('+5511900000002'));
  if v_ing <> 0 then
    raise exception 'T1c FALHOU: telefone do secundario ainda casa no ingest (% linhas)', v_ing;
  end if;
  insert into public.contacts (id, name, phone, conversation_status)
  values ('00000000-0000-0000-0000-0000000c0009','Novo inbound','+5511900000002','open')
  returning id into v_novo;
  if v_novo is null then raise exception 'T1c FALHOU: nao foi possivel reusar o telefone liberado'; end if;

  -- (d) mensagens e notas movidas para o principal
  select contact_id into v_msg from public.messages where id = '00000000-0000-0000-0000-0000000d0001';
  if v_msg is distinct from '00000000-0000-0000-0000-0000000c0001' then
    raise exception 'T1d FALHOU: mensagem nao foi movida (%)', v_msg;
  end if;
  select contact_id into v_note from public.contact_notes where id = '00000000-0000-0000-0000-0000000d0002';
  if v_note is distinct from '00000000-0000-0000-0000-0000000c0001' then
    raise exception 'T1d FALHOU: nota nao foi movida (%)', v_note;
  end if;

  -- (e) campos personalizados movidos sem duplicar: 'origem' fica so no principal (1), 'plano' migra
  select count(*) into v_cf from public.contact_custom_fields
   where contact_id = '00000000-0000-0000-0000-0000000c0001' and field_name = 'origem';
  if v_cf <> 1 then raise exception 'T1e FALHOU: campo origem duplicado/perdido (% linhas)', v_cf; end if;
  select count(*) into v_cf from public.contact_custom_fields
   where contact_id = '00000000-0000-0000-0000-0000000c0001' and field_name = 'plano';
  if v_cf <> 1 then raise exception 'T1e FALHOU: campo plano nao migrou (% linhas)', v_cf; end if;
  select count(*) into v_cf from public.contact_custom_fields
   where contact_id = '00000000-0000-0000-0000-0000000c0002';
  if v_cf <> 0 then raise exception 'T1e FALHOU: secundario ainda tem campos personalizados (%)', v_cf; end if;

  -- (f) conversa (memoria unica por contato) movida sem duplicar: principal tem 1
  select count(*) into v_mem from public.conversation_memory
   where contact_id = '00000000-0000-0000-0000-0000000c0001';
  if v_mem <> 1 then raise exception 'T1f FALHOU: conversation_memory duplicada/perdida (% linhas)', v_mem; end if;

  -- (g) auditoria: sobrevivente + mesclado
  select count(*) into v_aud from public.contact_merge_audit
   where primary_id = '00000000-0000-0000-0000-0000000c0001'
     and merged_id = '00000000-0000-0000-0000-0000000c0002';
  if v_aud <> 1 then raise exception 'T1g FALHOU: trilha de auditoria ausente (%)', v_aud; end if;

  raise notice 'T1 OK: dados preservados, soft-delete com rastro, phone liberado, FKs movidas sem duplicar, auditoria gravada';
end $$;

-- ===== T2: mescla repetida e idempotente ====================================
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select public.merge_contacts_atomic(
  '00000000-0000-0000-0000-0000000c0001',
  array['00000000-0000-0000-0000-0000000c0002']::uuid[],
  '{}'::jsonb
) as t2_retorno;
reset role;
set local request.jwt.claims = '{}';

do $$
declare v_aud integer; v_s record;
begin
  select count(*) into v_aud from public.contact_merge_audit
   where primary_id = '00000000-0000-0000-0000-0000000c0001'
     and merged_id = '00000000-0000-0000-0000-0000000c0002';
  select * into v_s from public.contacts where id = '00000000-0000-0000-0000-0000000c0002';
  if v_aud <> 1 then raise exception 'T2 FALHOU: idempotencia duplicou a trilha (% linhas)', v_aud; end if;
  if v_s.merged_phone is distinct from (select orig from mrg_phone) then
    raise exception 'T2 FALHOU: 2a chamada sobrescreveu merged_phone (%)', v_s.merged_phone;
  end if;
  raise notice 'T2 OK: 2a chamada no-op, trilha e telefone original intactos';
end $$;

-- ===== T3: agente comum (sem papel admin/supervisor) negado =================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000e0001","role":"authenticated"}';
do $$
declare v_err text;
begin
  begin
    perform public.merge_contacts_atomic(
      '00000000-0000-0000-0000-0000000c0001',
      array['00000000-0000-0000-0000-0000000c0002']::uuid[], '{}'::jsonb);
    raise exception 'T3 FALHOU: agente comum conseguiu mesclar';
  exception when insufficient_privilege then
    raise notice 'T3 OK: agente comum negado (42501)';
  end;
end $$;
reset role;
set local request.jwt.claims = '{}';

-- ===== T4: ACL — anon/PUBLIC sem EXECUTE ====================================
do $$
begin
  if has_function_privilege('anon', 'public.merge_contacts_atomic(uuid,uuid[],jsonb)', 'EXECUTE')
     or exists (select 1 from pg_proc p, aclexplode(p.proacl) g
                 where p.oid = 'public.merge_contacts_atomic(uuid,uuid[],jsonb)'::regprocedure and g.grantee = 0) then
    raise exception 'T4 FALHOU: EXECUTE aberto para anon/PUBLIC';
  end if;
  if not has_function_privilege('authenticated', 'public.merge_contacts_atomic(uuid,uuid[],jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.merge_contacts_atomic(uuid,uuid[],jsonb)', 'EXECUTE') then
    raise exception 'T4 FALHOU: EXECUTE faltando para authenticated/service_role';
  end if;
  raise notice 'T4 OK: EXECUTE restrito a authenticated + service_role';
end $$;

-- ===== T5: secundario ja mesclado em OUTRO principal -> recusado ============
insert into public.contacts (id, name, phone, conversation_status)
values ('00000000-0000-0000-0000-0000000c0003','Outro principal','+5511900000003','open');

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
do $$
declare v_err text;
begin
  begin
    perform public.merge_contacts_atomic(
      '00000000-0000-0000-0000-0000000c0003',
      array['00000000-0000-0000-0000-0000000c0002']::uuid[], '{}'::jsonb);
    raise exception 'T5 FALHOU: aceitou re-mesclar secundario de outro principal';
  exception when others then
    if sqlerrm like '%T5 FALHOU%' then raise; end if;
    raise notice 'T5 OK: recusado como esperado (%)', sqlerrm;
  end;
end $$;
reset role;
set local request.jwt.claims = '{}';

-- ===== T6: updated_at preservado no movimento + gatilho reabilitado ==========
do $$
declare v_msg timestamptz; v_outro timestamptz; v_enabled "char";
begin
  select updated_at into v_msg from public.messages where id = '00000000-0000-0000-0000-0000000d0001';
  select updated_at into v_outro from public.contacts where id = '00000000-0000-0000-0000-0000000c0007';
  if v_msg is distinct from '2001-01-01 00:00:00+00'::timestamptz then
    raise exception 'T6 FALHOU: updated_at da mensagem movida foi reescrito (%)', v_msg;
  end if;
  if v_outro is distinct from '2001-01-01 00:00:00+00'::timestamptz then
    raise exception 'T6 FALHOU: updated_at de contato nao envolvido mudou (%)', v_outro;
  end if;
  select tgenabled into v_enabled from pg_trigger where tgname = 'update_messages_updated_at';
  if v_enabled <> 'O' then
    raise exception 'T6 FALHOU: gatilho de updated_at nao foi reabilitado (%)', v_enabled;
  end if;
  raise notice 'T6 OK: updated_at preservado (mensagem movida e contato alheio) e gatilho reabilitado';
end $$;

rollback;
-- Nada persiste.
