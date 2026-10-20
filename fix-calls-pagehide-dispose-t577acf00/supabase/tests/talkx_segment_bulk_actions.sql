-- talkx_segment_bulk_actions.sql
-- TL-135a2 / X114 — teste SQL da RPC guardada de ações em massa da biblioteca.
-- Roda contra banco local com as migrations reais aplicadas:
--   zapp-db-local psql <copia> tl-135a2-bulk < supabase/tests/talkx_segment_bulk_actions.sql
-- Vermelho sem a migration: a função/colunas não existem. Verde com ela.

begin;

-- Usuários sintéticos: inserimos em auth.users para satisfazer a FK de profiles. O banco
-- local desta suíte pode não ter o overload integer de calculate_level usado por trigger
-- global de bootstrap; criamos um overload temporário dentro da transação do teste.
create or replace function public.calculate_level(integer)
returns integer
language sql
immutable
as $$ select greatest(1, ($1 / 1000) + 1) $$;

do $$
begin
  if to_regclass('auth.users') is not null then
    insert into auth.users (id, raw_user_meta_data)
    values
      ('11111111-1111-1111-1111-111111111111', jsonb_build_object('name', 'Dona dos segmentos')),
      ('22222222-2222-2222-2222-222222222222', jsonb_build_object('name', 'Agente comum')),
      ('33333333-3333-3333-3333-333333333333', jsonb_build_object('name', 'Admin do modulo'))
    on conflict (id) do nothing;
  end if;
end $$;
insert into public.profiles (user_id, name, role, is_active) values
  ('11111111-1111-1111-1111-111111111111', 'Dona dos segmentos', 'agent', true),
  ('22222222-2222-2222-2222-222222222222', 'Agente comum',     'agent', true),
  ('33333333-3333-3333-3333-333333333333', 'Admin do modulo',  'admin', true)
on conflict (user_id) do nothing;

insert into public.user_roles (user_id, role) values
  ('33333333-3333-3333-3333-333333333333', 'admin')
on conflict do nothing;

insert into public.talkx_segments (id, name, description, origin, status, is_favorite, rules, estimated_count, created_by)
select v.id, v.name, v.description, 'zapp', v.status, false, v.rules, 0, p.id
  from (values
    ('b0000000-0000-0000-0000-000000000001'::uuid, 'Segmento livre',     'sem campanha',      'active',   '{"groups":[{"field":"city","op":"eq","value":"SP"}]}'::jsonb),
    ('b0000000-0000-0000-0000-000000000002'::uuid, 'Segmento usado',     'campanha agendada', 'active',   '{"groups":[]}'::jsonb),
    ('b0000000-0000-0000-0000-000000000003'::uuid, 'Segmento em lista',  'campanha em lista', 'active',   '{"groups":[]}'::jsonb),
    ('b0000000-0000-0000-0000-000000000004'::uuid, 'Segmento inativo',   'sem campanha',      'inactive', '{"groups":[{"field":"tag","op":"has","value":"old"}]}'::jsonb)
  ) as v(id, name, description, status, rules)
  cross join (select id from public.profiles where user_id = '11111111-1111-1111-1111-111111111111') as p;

insert into public.talkx_campaigns (id, name, message_template, status, created_by, segment_id, scheduled_at)
select 'c0000000-0000-0000-0000-000000000001', 'Campanha Agendada', 'ola {{nome}}', 'scheduled',
       p.id, 'b0000000-0000-0000-0000-000000000002', now() + interval '1 day'
  from public.profiles p where p.user_id = '11111111-1111-1111-1111-111111111111';

insert into public.talkx_campaigns (id, name, message_template, status, created_by, segment_id, scheduled_at)
select 'c0000000-0000-0000-0000-000000000002', 'Campanha da Lista', 'ola {{nome}}', 'scheduled',
       p.id, null, now() + interval '2 day'
  from public.profiles p where p.user_id = '11111111-1111-1111-1111-111111111111';

insert into public.talkx_campaign_segments (campaign_id, segment_id, position, status)
values ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', 1, 'pending');

-- T1 — agent sem papel de biblioteca é recusado antes de escrever.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

do $$
declare
  v_sqlstate text;
  v_erro text;
  v_status text;
begin
  begin
    perform 1 from public.talkx_segment_bulk_action('archive', array['b0000000-0000-0000-0000-000000000001']::uuid[]);
    raise exception 'T1 FALHOU: agent conseguiu executar a ação em massa';
  exception when others then
    v_sqlstate := sqlstate;
    v_erro := sqlerrm;
  end;

  if v_sqlstate <> '42501' or v_erro <> 'talkx_segment_role_required' then
    raise exception 'T1 FALHOU: esperado 42501/talkx_segment_role_required, veio %/%', v_sqlstate, v_erro;
  end if;

  select status into v_status from public.talkx_segments where id = 'b0000000-0000-0000-0000-000000000001';
  if v_status <> 'active' then
    raise exception 'T1 FALHOU: tentativa recusada alterou status para %', v_status;
  end if;

  raise notice 'T1 OK: agent recusado e o segmento ficou intacto';
end $$;

-- T2 — um lote retorna resultado por segmento: livre arquiva; usados falham e continuam intactos.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

do $$
declare
  v_linha record;
  v_total integer := 0;
  v_ok integer := 0;
  v_falha integer := 0;
  v_livre_ok boolean := false;
  v_usado_msg text;
  v_lista_msg text;
  v_status text;
  v_archived timestamptz;
begin
  for v_linha in
    select * from public.talkx_segment_bulk_action(
      'archive',
      array['b0000000-0000-0000-0000-000000000001',
            'b0000000-0000-0000-0000-000000000002',
            'b0000000-0000-0000-0000-000000000003']::uuid[])
  loop
    v_total := v_total + 1;
    if v_linha.succeeded then
      v_ok := v_ok + 1;
      if v_linha.segment_id = 'b0000000-0000-0000-0000-000000000001'
         and v_linha.status = 'inactive'
         and v_linha.archived_at is not null then
        v_livre_ok := true;
      else
        raise exception 'T2 FALHOU: sucesso indevido em % status=% archived_at=%', v_linha.segment_id, v_linha.status, v_linha.archived_at;
      end if;
    else
      v_falha := v_falha + 1;
      if v_linha.error_code <> 'P0001' then
        raise exception 'T2 FALHOU: item em uso falhou com % (esperado P0001)', v_linha.error_code;
      end if;
      if v_linha.status <> 'active' or v_linha.archived_at is not null then
        raise exception 'T2 FALHOU: item em uso % voltou alterado (status=%, archived_at=%)', v_linha.segment_id, v_linha.status, v_linha.archived_at;
      end if;
      if v_linha.segment_id = 'b0000000-0000-0000-0000-000000000002' then
        v_usado_msg := v_linha.error_message;
      elsif v_linha.segment_id = 'b0000000-0000-0000-0000-000000000003' then
        v_lista_msg := v_linha.error_message;
      end if;
    end if;
  end loop;

  if v_total <> 3 or v_ok <> 1 or v_falha <> 2 or not v_livre_ok then
    raise exception 'T2 FALHOU: esperado 3 linhas (1 sucesso, 2 falhas), veio total=% ok=% falha=% livre_ok=%', v_total, v_ok, v_falha, v_livre_ok;
  end if;
  if v_usado_msg is null or position('talkx_segment_in_use' in v_usado_msg) = 0 or position('Campanha Agendada' in v_usado_msg) = 0 then
    raise exception 'T2 FALHOU: falha da coluna segment_id não citou a campanha (%)', v_usado_msg;
  end if;
  if v_lista_msg is null or position('talkx_segment_in_use' in v_lista_msg) = 0 or position('Campanha da Lista' in v_lista_msg) = 0 then
    raise exception 'T2 FALHOU: falha da lista talkx_campaign_segments não citou a campanha (%)', v_lista_msg;
  end if;

  select status, archived_at into v_status, v_archived from public.talkx_segments where id = 'b0000000-0000-0000-0000-000000000002';
  if v_status <> 'active' or v_archived is not null then
    raise exception 'T2 FALHOU: segmento usado foi alterado (status=%, archived_at=%)', v_status, v_archived;
  end if;
  select status, archived_at into v_status, v_archived from public.talkx_segments where id = 'b0000000-0000-0000-0000-000000000003';
  if v_status <> 'active' or v_archived is not null then
    raise exception 'T2 FALHOU: segmento em lista foi alterado (status=%, archived_at=%)', v_status, v_archived;
  end if;

  raise notice 'T2 OK: resposta por item separou 1 sucesso e 2 falhas guardadas, sem interromper o lote';
end $$;

-- T3 — tag não é bloqueada pela guarda de uso e é idempotente.
do $$
declare
  v_linha record;
  v_total integer := 0;
  v_tags text[];
begin
  for v_linha in
    select * from public.talkx_segment_bulk_action(
      'tag',
      array['b0000000-0000-0000-0000-000000000002',
            'b0000000-0000-0000-0000-000000000003']::uuid[],
      'vip-play')
  loop
    v_total := v_total + 1;
    if not v_linha.succeeded or not ('vip-play' = any(v_linha.tags)) then
      raise exception 'T3 FALHOU: tag falhou em % (%/%)', v_linha.segment_id, v_linha.error_code, v_linha.error_message;
    end if;
  end loop;
  if v_total <> 2 then
    raise exception 'T3 FALHOU: esperado 2 linhas de tag, veio %', v_total;
  end if;

  perform 1 from public.talkx_segment_bulk_action('tag', array['b0000000-0000-0000-0000-000000000002']::uuid[], 'vip-play');
  select tags into v_tags from public.talkx_segments where id = 'b0000000-0000-0000-0000-000000000002';
  if v_tags <> array['vip-play']::text[] then
    raise exception 'T3 FALHOU: tag repetida não ficou idempotente (%)', v_tags;
  end if;

  raise notice 'T3 OK: tag aplicada em segmento em uso e repetição não duplicou';
end $$;

-- T4 — activate e draft: ativa sai do arquivo; rascunho não muda rules.
do $$
declare
  v_linha record;
  v_rules_antes jsonb;
  v_rules_depois jsonb;
  v_status text;
  v_archived timestamptz;
begin
  for v_linha in
    select * from public.talkx_segment_bulk_action('activate', array['b0000000-0000-0000-0000-000000000001']::uuid[])
  loop
    if not v_linha.succeeded or v_linha.status <> 'active' or v_linha.archived_at is not null then
      raise exception 'T4 FALHOU: activate devolveu succeeded=% status=% archived_at=%', v_linha.succeeded, v_linha.status, v_linha.archived_at;
    end if;
  end loop;

  select rules into v_rules_antes from public.talkx_segments where id = 'b0000000-0000-0000-0000-000000000004';
  perform 1 from public.talkx_segment_bulk_action('draft', array['b0000000-0000-0000-0000-000000000004']::uuid[]);
  select status, archived_at, rules into v_status, v_archived, v_rules_depois from public.talkx_segments where id = 'b0000000-0000-0000-0000-000000000004';
  if v_status <> 'draft' or v_rules_depois is distinct from v_rules_antes then
    raise exception 'T4 FALHOU: draft gravou status=% ou mudou rules (% -> %)', v_status, v_rules_antes, v_rules_depois;
  end if;

  raise notice 'T4 OK: activate restaurou ativo e draft preservou rules';
end $$;

-- T5 — id inexistente responde por item sem oráculo e o lote continua.
do $$
declare
  v_linha record;
  v_total integer := 0;
  v_ok integer := 0;
  v_falha integer := 0;
  v_msg_a text;
  v_msg_b text;
  v_inex_a uuid := 'b0000000-0000-0000-0000-000000000999';
  v_inex_b uuid := 'b0000000-0000-0000-0000-000000000888';
begin
  for v_linha in
    select * from public.talkx_segment_bulk_action(
      'tag', array['b0000000-0000-0000-0000-000000000004', v_inex_a, v_inex_b]::uuid[], 'qa')
  loop
    v_total := v_total + 1;
    if v_linha.succeeded then
      v_ok := v_ok + 1;
    else
      v_falha := v_falha + 1;
      if v_linha.error_code <> 'P0002' or v_linha.error_message <> 'talkx_segment_not_found' then
        raise exception 'T5 FALHOU: inexistente devolveu %/%', v_linha.error_code, v_linha.error_message;
      end if;
      if position(v_linha.segment_id::text in v_linha.error_message) > 0 then
        raise exception 'T5 FALHOU: mensagem citou id (%)', v_linha.error_message;
      end if;
      if v_linha.segment_id = v_inex_a then
        v_msg_a := v_linha.error_message;
      elsif v_linha.segment_id = v_inex_b then
        v_msg_b := v_linha.error_message;
      end if;
    end if;
  end loop;

  if v_total <> 3 or v_ok <> 1 or v_falha <> 2 or v_msg_a is distinct from v_msg_b then
    raise exception 'T5 FALHOU: esperado lote continuar com 1 sucesso/2 falhas iguais; total=% ok=% falha=% msg_a=% msg_b=%', v_total, v_ok, v_falha, v_msg_a, v_msg_b;
  end if;

  raise notice 'T5 OK: inexistentes não vazam oráculo e o lote continuou';
end $$;

-- T6 — entrada inválida falha antes de qualquer escrita.
do $$
declare
  v_casos text[] := array['acao','vazio','nulo','teto','tag_nula','tag_vazia','tag_longa','tag_em_outra'];
  v_caso text;
  v_sqlstate text;
  v_ruins text := '';
  v_ids_201 uuid[];
  v_status text;
begin
  select array_agg(('b0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid)
    into v_ids_201
    from generate_series(1, 201) as g(i);

  foreach v_caso in array v_casos loop
    v_sqlstate := null;
    begin
      case v_caso
        when 'acao' then perform 1 from public.talkx_segment_bulk_action('excluir', array['b0000000-0000-0000-0000-000000000004']::uuid[]);
        when 'vazio' then perform 1 from public.talkx_segment_bulk_action('archive', array[]::uuid[]);
        when 'nulo' then perform 1 from public.talkx_segment_bulk_action('archive', array[null, 'b0000000-0000-0000-0000-000000000004']::uuid[]);
        when 'teto' then perform 1 from public.talkx_segment_bulk_action('archive', v_ids_201);
        when 'tag_nula' then perform 1 from public.talkx_segment_bulk_action('tag', array['b0000000-0000-0000-0000-000000000004']::uuid[], null);
        when 'tag_vazia' then perform 1 from public.talkx_segment_bulk_action('tag', array['b0000000-0000-0000-0000-000000000004']::uuid[], '   ');
        when 'tag_longa' then perform 1 from public.talkx_segment_bulk_action('tag', array['b0000000-0000-0000-0000-000000000004']::uuid[], repeat('x', 41));
        when 'tag_em_outra' then perform 1 from public.talkx_segment_bulk_action('archive', array['b0000000-0000-0000-0000-000000000004']::uuid[], 'vip');
      end case;
      v_ruins := v_ruins || '[' || v_caso || ':aceitou]';
    exception when others then
      v_sqlstate := sqlstate;
    end;

    if v_sqlstate is null then
      continue;
    end if;
    if v_sqlstate <> '22023' then
      v_ruins := v_ruins || '[' || v_caso || ':' || v_sqlstate || ']';
    end if;
  end loop;

  if v_ruins <> '' then
    raise exception 'T6 FALHOU: entrada inválida sem 22023: %', v_ruins;
  end if;

  select status into v_status from public.talkx_segments where id = 'b0000000-0000-0000-0000-000000000004';
  if v_status <> 'draft' then
    raise exception 'T6 FALHOU: entrada inválida alterou o segmento (status=%)', v_status;
  end if;

  raise notice 'T6 OK: entradas inválidas devolveram 22023 e não escreveram';
end $$;

-- T7 — ACL e assinatura.
do $$
declare
  v_anon boolean;
  v_auth boolean;
  v_overloads integer;
  v_segdef boolean;
  v_config text;
begin
  v_anon := has_function_privilege('anon', 'public.talkx_segment_bulk_action(text, uuid[], text)', 'execute');
  v_auth := has_function_privilege('authenticated', 'public.talkx_segment_bulk_action(text, uuid[], text)', 'execute');

  if v_anon then
    raise exception 'T7 FALHOU: anon pode executar a RPC';
  end if;
  if not v_auth then
    raise exception 'T7 FALHOU: authenticated não pode executar a RPC';
  end if;

  select count(*) into v_overloads
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'talkx_segment_bulk_action';
  if v_overloads <> 1 then
    raise exception 'T7 FALHOU: existem % assinaturas da RPC', v_overloads;
  end if;

  select p.prosecdef, array_to_string(p.proconfig, ',') into v_segdef, v_config
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'talkx_segment_bulk_action';
  if v_segdef is not true then
    raise exception 'T7 FALHOU: a função não é SECURITY DEFINER';
  end if;
  if v_config is null or position('search_path=public, pg_temp' in v_config) = 0 then
    raise exception 'T7 FALHOU: search_path não está fixo (proconfig=%)', v_config;
  end if;

  raise notice 'T7 OK: anon sem EXECUTE, authenticated com EXECUTE, uma assinatura e search_path fixo';
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare
  v_sqlstate text;
begin
  begin
    perform 1 from public.talkx_segment_bulk_action('archive', array['b0000000-0000-0000-0000-000000000001']::uuid[]);
    raise exception 'T7b FALHOU: anon executou a RPC';
  exception when insufficient_privilege then
    v_sqlstate := sqlstate;
  end;
  if v_sqlstate is null then
    raise exception 'T7b FALHOU: anon não recebeu insufficient_privilege';
  end if;
  raise notice 'T7b OK: anon recusado com insufficient_privilege';
end $$;
reset role;

rollback;
