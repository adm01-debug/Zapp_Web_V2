-- contact_is_vip.sql
-- Prova de contrato da migration 20261012214235_contact_is_vip (cartao t_84b84230).
--
-- Roda como postgres no banco local da tarefa:
--   zapp-db-local psql <copia> <conjunto> < supabase/tests/contact_is_vip.sql
-- Tudo dentro de BEGIN…ROLLBACK: nenhuma fixture persiste.
--
-- O que prova:
--   T0  backfill da etiqueta: 'vip'/'VIP'/'cliente'+'vip' viram is_vip=true; 'vip ' (com
--       espaco), 'VipVip' e NULL NAO viram (mesma regra do front: lower(t) = 'vip');
--       updated_at do contato NAO e reescrito pelo backfill; reexecutar nao muda nada;
--   T1  RPC set_contact_vip liga e desliga (admin autenticado) e devolve o valor;
--   T2  cada mudanca REAL de VIP grava UM evento em audit_logs (action=contact_vip_changed,
--       user_id do executor, details.is_vip); repetir o mesmo valor NAO audita;
--   T3  sem sessao: exception, contato intacto;
--   T4  autenticado SEM permissao: exception, contato intacto, sem auditoria;
--   T5  anon NAO le nem muda is_vip (privilegio negado / policy de UPDATE so para authenticated);
--   T6  authenticated AUTORIZADO muda is_vip pela policy de UPDATE (e audita);
--   T7  ACL: EXECUTE das RPCs so para authenticated/service_role, nunca anon/PUBLIC;
--   T8  list_contacts_vip devolve o conjunto completo (sem paginacao) no escopo do chamador,
--       ignora contatos excluidos (deleted_at) e nao vaza para quem nao tem permissao;
--   T9  rollback executavel (mesmo bloco do cabecalho da migration): os objetos somem.

\set ON_ERROR_STOP on

begin;

-- ===== fixtures ==============================================================
-- admin (a001), colega (b002), fora (c003). O trigger handle_new_user cria o profile.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-00000000a001', 'authenticated', 'authenticated', 'admin.t84@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-00000000b002', 'authenticated', 'authenticated', 'colega.t84@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-00000000c003', 'authenticated', 'authenticated', 'fora.t84@test.local', '', now(), now(), now());

create temp table t84_ids on commit drop as
select (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000a001') as admin_profile,
       (select id from public.profiles where user_id = '00000000-0000-0000-0000-00000000c003') as fora_profile;

insert into public.user_roles (user_id, role)
values ('00000000-0000-0000-0000-00000000a001', 'admin');

insert into public.queues (id, name, color)
values ('00000000-0000-0000-0000-00000000d004', 'Fila T84', '#22c55e');

-- e005 'vip' | e006 'VIP' | e007 ['cliente','vip'] -> VIP
-- e008 'vip ' (espaco) | e009 NULL | e010 'VipVip'  -> NAO VIP
-- e011 excluido (deleted_at) com a etiqueta: fica fora das RPCs de leitura/escrita.
insert into public.contacts (id, name, phone, conversation_status, assigned_to, queue_id, tags)
values
  ('00000000-0000-0000-0000-00000000e005', 'Vip Exato',    '+551****0005', 'open', (select admin_profile from t84_ids), '00000000-0000-0000-0000-00000000d004', array['vip']),
  ('00000000-0000-0000-0000-00000000e006', 'Vip Maiusculo', '+551****0006', 'open', (select admin_profile from t84_ids), '00000000-0000-0000-0000-00000000d004', array['VIP']),
  ('00000000-0000-0000-0000-00000000e007', 'Vip Na Lista',  '+551****0007', 'open', (select admin_profile from t84_ids), '00000000-0000-0000-0000-00000000d004', array['cliente','vip']),
  ('00000000-0000-0000-0000-00000000e008', 'Vip Com Espaco', '+551****0008', 'open', (select admin_profile from t84_ids), '00000000-0000-0000-0000-00000000d004', array['vip ']),
  ('00000000-0000-0000-0000-00000000e009', 'Sem Tag',        '+551****0009', 'open', (select admin_profile from t84_ids), '00000000-0000-0000-0000-00000000d004', null),
  ('00000000-0000-0000-0000-00000000e010', 'Vip Colado',     '+551****0010', 'open', (select admin_profile from t84_ids), '00000000-0000-0000-0000-00000000d004', array['VipVip']),
  ('00000000-0000-0000-0000-00000000e011', 'Vip Excluido',   '+551****0011', 'open', (select admin_profile from t84_ids), '00000000-0000-0000-0000-00000000d004', array['vip']);

update public.contacts set deleted_at = now() where id = '00000000-0000-0000-0000-00000000e011';

-- ===== T0: backfill da etiqueta 'vip' ========================================
-- Reexecuta o MESMO bloco da migration (secao 2, verso aplicado) sobre fixtures novas.
do $$
declare
  v_antes timestamptz;
  v_depois timestamptz;
  v_n integer;
begin
  update public.contacts set is_vip = false
   where id in ('00000000-0000-0000-0000-00000000e005',
                '00000000-0000-0000-0000-00000000e006',
                '00000000-0000-0000-0000-00000000e007');

  select c.updated_at into v_antes from public.contacts c where c.id = '00000000-0000-0000-0000-00000000e005';

  alter table public.contacts disable trigger update_contacts_updated_at;
  update public.contacts c
     set is_vip = true
   where c.is_vip = false
     and exists (select 1 from unnest(c.tags) as t where lower(t) = 'vip');
  get diagnostics v_n = row_count;
  alter table public.contacts enable trigger update_contacts_updated_at;

  if v_n <> 4 then
    raise exception 'T0 FALHOU: backfill marcou % linhas, esperado 4', v_n;
  end if;

  if (select c.is_vip from public.contacts c where c.id = '00000000-0000-0000-0000-00000000e005') is not true
     or (select c.is_vip from public.contacts c where c.id = '00000000-0000-0000-0000-00000000e006') is not true
     or (select c.is_vip from public.contacts c where c.id = '00000000-0000-0000-0000-00000000e007') is not true then
    raise exception 'T0 FALHOU: vip/VIP/lista nao viraram is_vip=true';
  end if;

  -- o backfill ESPELHA a etiqueta e nao filtra deleted_at: a linha excluida (e011) tambem
  -- recebe o valor. Isso e inerte — nenhuma RPC de VIP expoe ou edita contato excluido.
  if (select c.is_vip from public.contacts c where c.id = '00000000-0000-0000-0000-00000000e011') is not true then
    raise exception 'T0 FALHOU: backfill deveria espelhar a etiqueta na linha excluida';
  end if;

  if (select c.is_vip from public.contacts c where c.id = '00000000-0000-0000-0000-00000000e008') is not false
     or (select c.is_vip from public.contacts c where c.id = '00000000-0000-0000-0000-00000000e009') is not false
     or (select c.is_vip from public.contacts c where c.id = '00000000-0000-0000-0000-00000000e010') is not false then
    raise exception 'T0 FALHOU: variante que NAO e a etiqueta virou VIP';
  end if;

  select c.updated_at into v_depois from public.contacts c where c.id = '00000000-0000-0000-0000-00000000e005';
  if v_depois is distinct from v_antes then
    raise exception 'T0 FALHOU: backfill reescreveu updated_at (% -> %)', v_antes, v_depois;
  end if;

  -- idempotencia
  alter table public.contacts disable trigger update_contacts_updated_at;
  update public.contacts c set is_vip = true
   where c.is_vip = false and exists (select 1 from unnest(c.tags) as t where lower(t) = 'vip');
  get diagnostics v_n = row_count;
  alter table public.contacts enable trigger update_contacts_updated_at;
  if v_n <> 0 then
    raise exception 'T0 FALHOU: backfill nao e idempotente (% linhas na 2a passada)', v_n;
  end if;

  raise notice 'T0 OK: backfill marca so a etiqueta exata (4), preserva updated_at e e idempotente';
end $$;

-- ===== T1: RPC liga/desliga (admin autenticado) ==============================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
do $$
declare v_ret boolean;
begin
  v_ret := public.set_contact_vip('00000000-0000-0000-0000-00000000e005', false);
  if v_ret is not false
     or (select is_vip from public.contacts where id = '00000000-0000-0000-0000-00000000e005') is not false then
    raise exception 'T1 FALHOU: desligar VIP nao refletiu';
  end if;

  v_ret := public.set_contact_vip('00000000-0000-0000-0000-00000000e005', true);
  if v_ret is not true
     or (select is_vip from public.contacts where id = '00000000-0000-0000-0000-00000000e005') is not true then
    raise exception 'T1 FALHOU: ligar VIP nao refletiu';
  end if;

  -- contato excluido (deleted_at) nunca e editado, mesmo tendo a etiqueta
  begin
    perform public.set_contact_vip('00000000-0000-0000-0000-00000000e011', false);
    raise exception 'T1 FALHOU: editou contato excluido';
  exception when others then
    if sqlerrm like '%editou contato excluido%' then raise; end if;
  end;

  raise notice 'T1 OK: set_contact_vip liga/desliga, devolve o valor e recusa contato excluido';
end $$;

-- ===== T2: auditoria por mudanca real ========================================
do $$
declare
  v_antes integer;
  v_depois integer;
  v_total integer;
  v_noop integer;
begin
  select count(*) into v_antes from public.audit_logs
   where action = 'contact_vip_changed' and entity_id = '00000000-0000-0000-0000-00000000e005'
     and details ->> 'is_vip' = 'false';
  select count(*) into v_total from public.audit_logs
   where action = 'contact_vip_changed' and entity_id = '00000000-0000-0000-0000-00000000e005';

  perform public.set_contact_vip('00000000-0000-0000-0000-00000000e005', false);

  select count(*) into v_depois from public.audit_logs
   where action = 'contact_vip_changed' and entity_id = '00000000-0000-0000-0000-00000000e005'
     and details ->> 'is_vip' = 'false';
  if v_depois <> v_antes + 1 then
    raise exception 'T2 FALHOU: evento is_vip=false nao gravado (% -> %)', v_antes, v_depois;
  end if;

  if not exists (
    select 1 from public.audit_logs
     where action = 'contact_vip_changed' and entity_id = '00000000-0000-0000-0000-00000000e005'
       and details ->> 'is_vip' = 'false'
       and entity_type = 'contacts'
       and user_id = '00000000-0000-0000-0000-00000000a001'
  ) then
    raise exception 'T2 FALHOU: evento sem entidade/executor corretos';
  end if;

  -- repetir o MESMO valor (no-op) nao audita
  perform public.set_contact_vip('00000000-0000-0000-0000-00000000e005', false);
  select count(*) into v_noop from public.audit_logs
   where action = 'contact_vip_changed' and entity_id = '00000000-0000-0000-0000-00000000e005';
  if v_noop <> v_total + 1 then
    raise exception 'T2 FALHOU: no-op auditou (total % -> %)', v_total, v_noop;
  end if;
  raise notice 'T2 OK: uma mudanca real = um evento (com executor); repetir o valor nao audita';
end $$;

-- ===== T3: sem sessao ========================================================
set local request.jwt.claims = '{}';
do $$
begin
  begin
    perform public.set_contact_vip('00000000-0000-0000-0000-00000000e005', true);
    raise exception 'T3 FALHOU: chamada sem sessao passou';
  exception when others then
    if sqlerrm like '%sem sessao passou%' then raise; end if;
    raise notice 'T3: sem sessao rejeitado (%)', sqlerrm;
  end;
  if (select is_vip from public.contacts where id = '00000000-0000-0000-0000-00000000e005') is not false then
    raise exception 'T3 FALHOU: contato mudou sem sessao';
  end if;
  raise notice 'T3 OK: sem sessao — exception e contato intacto';
end $$;

-- ===== T4: autenticado sem permissao =========================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c003","role":"authenticated"}';
do $$
declare v_antes integer; v_depois integer;
begin
  select count(*) into v_antes from public.audit_logs
   where action = 'contact_vip_changed' and entity_id = '00000000-0000-0000-0000-00000000e005';

  begin
    perform public.set_contact_vip('00000000-0000-0000-0000-00000000e005', true);
    raise exception 'T4 FALHOU: usuario sem permissao mudou o VIP';
  exception when others then
    if sqlerrm like '%sem permissao mudou o VIP%' then raise; end if;
    raise notice 'T4: rejeitado como esperado (%)', sqlerrm;
  end;

  if (select is_vip from public.contacts where id = '00000000-0000-0000-0000-00000000e005') is not false then
    raise exception 'T4 FALHOU: contato mudou sem permissao';
  end if;
  select count(*) into v_depois from public.audit_logs
   where action = 'contact_vip_changed' and entity_id = '00000000-0000-0000-0000-00000000e005';
  if v_depois <> v_antes then
    raise exception 'T4 FALHOU: auditoria gravada em tentativa sem permissao';
  end if;
  raise notice 'T4 OK: sem permissao — exception, contato intacto e sem auditoria';
end $$;

-- ===== T5: anon NAO le nem muda is_vip (RLS + privilegio) ====================
set local request.jwt.claims = '{}';
do $$
declare v_n bigint; v_negado boolean := false;
begin
  begin
    execute 'set local role anon';
    begin
      update public.contacts set is_vip = true where id = '00000000-0000-0000-0000-00000000e005';
      get diagnostics v_n = row_count;
    exception when insufficient_privilege then v_negado := true; end;
    execute 'reset role';
    if not v_negado and v_n <> 0 then
      raise exception 'T5 FALHOU: anon alterou is_vip (% linhas)', v_n;
    end if;
    raise notice 'T5a OK: anon nao altera is_vip (negado=%, linhas=%)', v_negado, v_n;
  exception when others then
    execute 'reset role';
    raise;
  end;

  v_negado := false;
  begin
    execute 'set local role anon';
    begin
      execute 'select count(*) from public.contacts where id = ''00000000-0000-0000-0000-00000000e005''' into v_n;
    exception when insufficient_privilege then v_negado := true; end;
    execute 'reset role';
    if not v_negado and v_n <> 0 then
      raise exception 'T5 FALHOU: anon leu contato/is_vip (% linhas)', v_n;
    end if;
    raise notice 'T5b OK: anon nao le is_vip (negado=%, linhas=%)', v_negado, v_n;
  exception when others then
    execute 'reset role';
    raise;
  end;
end $$;

-- ===== T6: authenticated AUTORIZADO muda is_vip pela policy de UPDATE =======
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
do $$
declare v_n integer; v_valor boolean; v_aud integer;
begin
  execute 'set local role authenticated';
  begin
    update public.contacts set is_vip = true where id = '00000000-0000-0000-0000-00000000e005';
    get diagnostics v_n = row_count;
    select c.is_vip into v_valor from public.contacts c where c.id = '00000000-0000-0000-0000-00000000e005';
    execute 'reset role';
    if v_n <> 1 or v_valor is not true then
      raise exception 'T6 FALHOU: admin autenticado nao mudou is_vip via RLS (% linhas, valor=%)', v_n, v_valor;
    end if;
  exception when others then
    execute 'reset role';
    raise;
  end;

  select count(*) into v_aud from public.audit_logs
   where action = 'contact_vip_changed' and entity_id = '00000000-0000-0000-0000-00000000e005'
     and user_id = '00000000-0000-0000-0000-00000000a001';
  if v_aud < 1 then
    raise exception 'T6 FALHOU: mudanca via RLS nao auditou';
  end if;
  raise notice 'T6 OK: authenticated autorizado muda is_vip e a mudanca e auditada';
end $$;

-- ===== T7: ACL das RPCs =====================================================
do $$
begin
  if has_function_privilege('anon', 'public.set_contact_vip(uuid,boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.list_contacts_vip()', 'EXECUTE')
     or exists (select 1 from pg_proc p, aclexplode(p.proacl) g
                 where p.oid = 'public.set_contact_vip(uuid,boolean)'::regprocedure and g.grantee = 0)
     or exists (select 1 from pg_proc p, aclexplode(p.proacl) g
                 where p.oid = 'public.list_contacts_vip()'::regprocedure and g.grantee = 0) then
    raise exception 'T7 FALHOU: EXECUTE aberto para anon/PUBLIC';
  end if;
  if not has_function_privilege('authenticated', 'public.set_contact_vip(uuid,boolean)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.list_contacts_vip()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.set_contact_vip(uuid,boolean)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.list_contacts_vip()', 'EXECUTE') then
    raise exception 'T7 FALHOU: EXECUTE faltando para authenticated/service_role';
  end if;
  raise notice 'T7 OK: EXECUTE restrito a authenticated + service_role';
end $$;

-- ===== T8: list_contacts_vip — conjunto completo, sem paginacao ==============
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
do $$
declare v_n integer; v_total integer; v_vip boolean; v_tem_excluido boolean;
begin
  select count(*) into v_n from public.list_contacts_vip();
  select count(*) into v_total from public.contacts where deleted_at is null;
  if v_n <> v_total or v_n < 6 then
    raise exception 'T8 FALHOU: conjunto incompleto (% de %)', v_n, v_total;
  end if;

  select c.is_vip into v_vip from public.list_contacts_vip() c
   where c.id = '00000000-0000-0000-0000-00000000e005';
  if v_vip is not true then
    raise exception 'T8 FALHOU: is_vip nao veio no conjunto';
  end if;

  select exists(select 1 from public.list_contacts_vip() c where c.id = '00000000-0000-0000-0000-00000000e011')
    into v_tem_excluido;
  if v_tem_excluido then
    raise exception 'T8 FALHOU: contato excluido apareceu no conjunto';
  end if;
  raise notice 'T8a OK: conjunto completo (%) com is_vip, sem excluidos', v_n;
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c003","role":"authenticated"}';
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.list_contacts_vip();
  if v_n <> 0 then
    raise exception 'T8 FALHOU: sem permissao viu % contatos', v_n;
  end if;
  raise notice 'T8b OK: sem permissao o conjunto vem vazio';
end $$;

-- ===== T9: rollback executavel (mesmo bloco do cabecalho) ===================
do $$
declare v_col integer; v_fn integer;
begin
  drop trigger if exists trg_audit_contact_vip_change on public.contacts;
  drop function if exists public.audit_contact_vip_change();
  drop function if exists public.list_contacts_vip();
  drop function if exists public.set_contact_vip(uuid, boolean);
  alter table public.contacts drop column if exists is_vip;

  select count(*) into v_col from information_schema.columns
   where table_schema = 'public' and table_name = 'contacts' and column_name = 'is_vip';
  select count(*) into v_fn from pg_proc p
   where p.proname in ('set_contact_vip','list_contacts_vip','audit_contact_vip_change')
     and p.pronamespace = 'public'::regnamespace;
  if v_col <> 0 or v_fn <> 0 then
    raise exception 'T9 FALHOU: rollback deixou objetos (coluna=%, funcoes=%)', v_col, v_fn;
  end if;
  raise notice 'T9 OK: rollback do cabecalho derruba coluna, RPCs e auditoria';
end $$;

rollback;
-- Nada persiste: fixtures e o T9 (executado dentro da transacao) voltam ao estado aplicado.
