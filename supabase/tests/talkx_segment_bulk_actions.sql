-- talkx_segment_bulk_actions.sql
-- TL-135a2 / X114 (Talk X, F09 Segmentos) — teste SQL das AÇÕES EM MASSA de segmentos.
--
-- COMO RODAR (banco com as migrations REAIS aplicadas, inclusive a
-- 20261009063730_talkx_segment_bulk_actions.sql e a 20261009054459_talkx_segments_lifecycle.sql):
--   psql -X -q -v ON_ERROR_STOP=1 -f supabase/tests/talkx_segment_bulk_actions.sql
--   (-v ON_ERROR_STOP=1 é obrigatório: sem ele o psql seguiria depois de uma falha)
--
-- O arquivo cria os PRÓPRIOS dados sintéticos e termina com ROLLBACK: não deixa nada no banco.
-- A prova de comportamento roda com o PAPEL REAL (SET LOCAL ROLE authenticated / anon +
-- request.jwt.claims), como o PostgREST faz; o papel dono do banco aparece só na criação dos
-- dados (fixture), nunca na asserção. A guarda de uso é a do banco (gatilho
-- talkx_segments_usage_guard, da TL-129): este teste NÃO recria a guarda.
--
-- O QUE PROVA (o defeito é vermelho sem a migration: a função não existe):
--   T1  agent (sem papel) chama e é recusado (42501 talkx_segment_role_required); nada muda
--   T2  UM lote com 3 segmentos devolve 3 linhas: o item em uso (campanha scheduled, pelas DUAS
--       formas de uso: coluna segment_id e lista talkx_campaign_segments) falha com o nome da
--       campanha e NÃO é alterado; o item livre é inativado. O lote não para no item recusado.
--   T3  arquivar: item livre arquiva e sai do filtro archived_at is null; item EM USO falha e
--       continua fora do arquivo; segmento JÁ arquivado e em uso re-arquiva sem erro (no-op)
--   T4  adicionar tag: grava no item livre E no item em uso (a guarda de uso não barra tag);
--       repetir a mesma tag não duplica
--   T5  ativar: inativo volta a active; arquivado sai do arquivo (archived_at null) mesmo em uso
--   T6  rascunhar: status vira draft e as regras PUBLICADAS (rules) não mudam
--   T7  id inexistente devolve P0002 sem citar o id, IGUAL para dois ids diferentes (sem
--       oráculo) e sem interromper o restante do lote
--   T8  entrada inválida (ação desconhecida, lista vazia, id nulo, lote acima do teto, tag
--       ausente/vazia/longa, tag em ação que não é tag) devolve 22023 e NADA é alterado
--   T9  ACL: anon não executa (nem por privilégio herdado), authenticated executa, dono é
--       SECURITY DEFINER com search_path fixo e existe UMA única assinatura (sem overload aberto)

begin;

-- =====================================================================================
-- FIXTURE (papel dono do banco: só prepara os dados; nenhuma asserção roda aqui)
-- =====================================================================================
-- Usuários sintéticos. Como na suíte irmã (talkx_segment_lifecycle.sql): a criação passa por
-- auth.users quando ela existe (o gatilho on_auth_user_created cria o profile) e a inserção
-- direta em profiles cobre o ambiente sem auth.users.
do $$
declare
  v_novo record;
begin
  if to_regclass('auth.users') is not null then
    for v_novo in
      select * from (values
        ('11111111-1111-1111-1111-111111111111'::uuid, 'Dona dos segmentos'),
        ('22222222-2222-2222-2222-222222222222'::uuid, 'Agente comum'),
        ('33333333-3333-3333-3333-333333333333'::uuid, 'Admin do modulo')
      ) as t(user_id, nome)
    loop
      insert into auth.users (id, raw_user_meta_data)
      values (v_novo.user_id, jsonb_build_object('name', v_novo.nome))
      on conflict (id) do nothing;
    end loop;
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

-- Segmentos (dono = Dona dos segmentos):
--   S_LIVRE    sem campanha nenhuma
--   S_USADO    campanha scheduled na coluna talkx_campaigns.segment_id
--   S_LISTA    campanha scheduled pela lista talkx_campaign_segments (X057)
--   S_ARQ_USO  JÁ arquivado e inativo, mas em uso (campanha scheduled): re-arquivar é no-op
--   S_INATIVO  inativo, sem campanha
insert into public.talkx_segments (id, name, description, origin, status, is_favorite, rules, estimated_count, created_by)
select v.id, v.name, v.description, 'zapp', v.status, false, '{"groups":[]}'::jsonb, 0, p.id
  from (values
    ('b0000000-0000-0000-0000-000000000001'::uuid, 'Segmento livre',        'sem campanha',        'active'),
    ('b0000000-0000-0000-0000-000000000002'::uuid, 'Segmento usado',        'campanha agendada',   'active'),
    ('b0000000-0000-0000-0000-000000000003'::uuid, 'Segmento em lista',     'campanha em lista',   'active'),
    ('b0000000-0000-0000-0000-000000000004'::uuid, 'Segmento arquivado',    'arquivado e em uso',  'inactive'),
    ('b0000000-0000-0000-0000-000000000005'::uuid, 'Segmento inativo',      'sem campanha',        'inactive')
  ) as v(id, name, description, status)
  cross join (select id from public.profiles where user_id = '11111111-1111-1111-1111-111111111111') as p;

update public.talkx_segments
   set archived_at = now() - interval '1 day'
 where id = 'b0000000-0000-0000-0000-000000000004';

-- Campanhas agendadas (é o que a guarda de uso enxerga)
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

insert into public.talkx_campaigns (id, name, message_template, status, created_by, segment_id, scheduled_at)
select 'c0000000-0000-0000-0000-000000000003', 'Campanha do Arquivado', 'ola {{nome}}', 'scheduled',
       p.id, 'b0000000-0000-0000-0000-000000000004', now() + interval '3 day'
  from public.profiles p where p.user_id = '11111111-1111-1111-1111-111111111111';

-- =====================================================================================
-- T1 — portão de papel: agent (não admin/supervisor) não executa e nada muda
-- =====================================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

do $$
declare
  v_sqlstate text;
  v_erro     text;
begin
  begin
    perform 1 from public.talkx_segment_bulk_action('deactivate', array['b0000000-0000-0000-0000-000000000001']::uuid[]);
    raise exception 'T1 FALHOU: o agent conseguiu executar a ação em massa';
  exception when others then
    v_sqlstate := sqlstate;
    v_erro     := sqlerrm;
  end;

  if v_sqlstate <> '42501' or v_erro <> 'talkx_segment_role_required' then
    raise exception 'T1 FALHOU: esperado 42501/talkx_segment_role_required, veio %/%', v_sqlstate, v_erro;
  end if;

  raise notice 'T1 OK: agent recusado com 42501 talkx_segment_role_required';
end $$;

-- T1b — o admin confirma que a tentativa do agent não tocou o segmento
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

do $$
declare
  v_status   text;
  v_archived timestamptz;
begin
  select s.status, s.archived_at into v_status, v_archived
    from public.talkx_segments s
   where s.id = 'b0000000-0000-0000-0000-000000000001';
  if v_status <> 'active' or v_archived is not null then
    raise exception 'T1b FALHOU: o segmento mudou (status=%, archived_at=%) sem autorização', v_status, v_archived;
  end if;
  raise notice 'T1b OK: o segmento do lote recusado ficou intacto';
end $$;

-- =====================================================================================
-- T2 — item bloqueado pela guarda NÃO é alterado; item permitido é; o lote não para
-- =====================================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

do $$
declare
  v_linha       record;
  v_total       integer := 0;
  v_ok          integer := 0;
  v_falha       integer := 0;
  v_livre_ok    boolean := false;
  v_usado_msg   text;
  v_lista_msg   text;
  v_status      text;
  v_archived    timestamptz;
begin
  for v_linha in
    select * from public.talkx_segment_bulk_action(
      'deactivate',
      array['b0000000-0000-0000-0000-000000000001',
            'b0000000-0000-0000-0000-000000000002',
            'b0000000-0000-0000-0000-000000000003']::uuid[])
  loop
    v_total := v_total + 1;
    if v_linha.succeeded then
      v_ok := v_ok + 1;
      if v_linha.segment_id = 'b0000000-0000-0000-0000-000000000001' then
        if v_linha.status <> 'inactive' then
          raise exception 'T2 FALHOU: o item livre devolveu status % (esperado inactive)', v_linha.status;
        end if;
        v_livre_ok := true;
      else
        raise exception 'T2 FALHOU: item % passou pela guarda e não devia', v_linha.segment_id;
      end if;
    else
      v_falha := v_falha + 1;
      if v_linha.error_code <> 'P0001' then
        raise exception 'T2 FALHOU: item em uso falhou com % (esperado P0001 da guarda)', v_linha.error_code;
      end if;
      if v_linha.status <> 'active' or v_linha.archived_at is not null then
        raise exception 'T2 FALHOU: item em uso % devolveu estado alterado (status=%, archived_at=%)',
          v_linha.segment_id, v_linha.status, v_linha.archived_at;
      end if;
      if v_linha.segment_id = 'b0000000-0000-0000-0000-000000000002' then
        v_usado_msg := v_linha.error_message;
      elsif v_linha.segment_id = 'b0000000-0000-0000-0000-000000000003' then
        v_lista_msg := v_linha.error_message;
      end if;
    end if;
  end loop;

  if v_total <> 3 then
    raise exception 'T2 FALHOU: a resposta trouxe % linhas (esperado 3: uma por segmento)', v_total;
  end if;
  if v_ok <> 1 or v_falha <> 2 or not v_livre_ok then
    raise exception 'T2 FALHOU: esperado 1 sucesso e 2 falhas, veio %/%', v_ok, v_falha;
  end if;
  if v_usado_msg is null or position('talkx_segment_in_use' in v_usado_msg) = 0
     or position('Campanha Agendada' in v_usado_msg) = 0 then
    raise exception 'T2 FALHOU: a falha do segmento usado não citou a campanha (%)', v_usado_msg;
  end if;
  if v_lista_msg is null or position('Campanha da Lista' in v_lista_msg) = 0 then
    raise exception 'T2 FALHOU: a falha do segmento em lista não citou a campanha (%)', v_lista_msg;
  end if;

  -- estado real no banco (lido como admin): o recusado não foi tocado
  select s.status, s.archived_at into v_status, v_archived
    from public.talkx_segments s where s.id = 'b0000000-0000-0000-0000-000000000002';
  if v_status <> 'active' or v_archived is not null then
    raise exception 'T2 FALHOU: o segmento em uso foi alterado (status=%, archived_at=%)', v_status, v_archived;
  end if;
  select s.status into v_status from public.talkx_segments s
   where s.id = 'b0000000-0000-0000-0000-000000000003';
  if v_status <> 'active' then
    raise exception 'T2 FALHOU: o segmento em lista foi alterado (%)', v_status;
  end if;

  raise notice 'T2 OK: 3 linhas; 1 inativado, 2 recusados pela guarda (nomes das campanhas) e intactos';
end $$;

-- =====================================================================================
-- T3 — arquivar: livre arquiva e sai do filtro; em uso falha; já arquivado em uso é no-op
-- =====================================================================================
do $$
declare
  v_linha     record;
  v_ok        integer := 0;
  v_falha     integer := 0;
  v_visiveis  integer;
  v_archived  timestamptz;
  v_msg       text;
begin
  for v_linha in
    select * from public.talkx_segment_bulk_action(
      'archive',
      array['b0000000-0000-0000-0000-000000000001',
            'b0000000-0000-0000-0000-000000000002',
            'b0000000-0000-0000-0000-000000000004']::uuid[])
  loop
    if v_linha.succeeded then
      v_ok := v_ok + 1;
      if v_linha.segment_id in ('b0000000-0000-0000-0000-000000000001',
                                'b0000000-0000-0000-0000-000000000004') then
        if v_linha.archived_at is null or v_linha.status <> 'inactive' then
          raise exception 'T3 FALHOU: % arquivou com archived_at=%, status=%',
            v_linha.segment_id, v_linha.archived_at, v_linha.status;
        end if;
      else
        raise exception 'T3 FALHOU: o segmento EM USO % foi arquivado', v_linha.segment_id;
      end if;
    else
      v_falha := v_falha + 1;
      v_msg := v_linha.error_message;
      if v_linha.segment_id <> 'b0000000-0000-0000-0000-000000000002' or v_linha.error_code <> 'P0001' then
        raise exception 'T3 FALHOU: falha inesperada em % (%)', v_linha.segment_id, v_linha.error_code;
      end if;
    end if;
  end loop;

  if v_ok <> 2 or v_falha <> 1 then
    raise exception 'T3 FALHOU: esperado 2 arquivados e 1 recusado, veio %/%', v_ok, v_falha;
  end if;
  if position('Campanha Agendada' in v_msg) = 0 then
    raise exception 'T3 FALHOU: a recusa do arquivamento não citou a campanha (%)', v_msg;
  end if;

  -- o arquivado sai do filtro que a tela usa
  select count(*) into v_visiveis from public.talkx_segments s
   where s.id = 'b0000000-0000-0000-0000-000000000001' and s.archived_at is null;
  if v_visiveis <> 0 then
    raise exception 'T3 FALHOU: o segmento arquivado continua no filtro archived_at is null';
  end if;

  -- o recusado continua fora do arquivo
  select s.archived_at into v_archived from public.talkx_segments s
   where s.id = 'b0000000-0000-0000-0000-000000000002';
  if v_archived is not null then
    raise exception 'T3 FALHOU: o segmento em uso foi arquivado mesmo com a guarda';
  end if;

  raise notice 'T3 OK: livre arquivado e fora do filtro; em uso recusado; já arquivado re-arquivou sem erro';
end $$;

-- =====================================================================================
-- T4 — adicionar tag: grava no livre e no em uso; repetir não duplica
-- =====================================================================================
do $$
declare
  v_linha   record;
  v_ok      integer := 0;
  v_tags    text[];
  v_de_novo integer;
begin
  for v_linha in
    select * from public.talkx_segment_bulk_action(
      'tag',
      array['b0000000-0000-0000-0000-000000000001',
            'b0000000-0000-0000-0000-000000000002']::uuid[],
      'vip-play')
  loop
    v_ok := v_ok + 1;
    if not v_linha.succeeded then
      raise exception 'T4 FALHOU: a tag foi recusada em % (%) — a guarda de uso não barra tag',
        v_linha.segment_id, v_linha.error_message;
    end if;
    if not ('vip-play' = any(v_linha.tags)) then
      raise exception 'T4 FALHOU: a tag não voltou na resposta do item %', v_linha.segment_id;
    end if;
  end loop;
  if v_ok <> 2 then
    raise exception 'T4 FALHOU: esperado 2 linhas, veio %', v_ok;
  end if;

  -- o segmento EM USO também recebeu a tag (e não foi barrado)
  select s.tags into v_tags from public.talkx_segments s
   where s.id = 'b0000000-0000-0000-0000-000000000002';
  if v_tags is null or not ('vip-play' = any(v_tags)) then
    raise exception 'T4 FALHOU: a tag não foi gravada no segmento em uso (%)', v_tags;
  end if;

  -- repetir a MESMA tag não duplica
  perform 1 from public.talkx_segment_bulk_action(
    'tag', array['b0000000-0000-0000-0000-000000000002']::uuid[], 'vip-play');
  select count(*) into v_de_novo from public.talkx_segments s
   where s.id = 'b0000000-0000-0000-0000-000000000002'
     and s.tags = array['vip-play']::text[];
  if v_de_novo <> 1 then
    raise exception 'T4 FALHOU: a tag repetida apareceu % vezes', v_de_novo;
  end if;

  raise notice 'T4 OK: tag gravada nos dois itens e repetir a mesma tag não duplica';
end $$;

-- =====================================================================================
-- T5 — ativar: inativo volta a active; arquivado sai do arquivo mesmo em uso
-- =====================================================================================
do $$
declare
  v_linha    record;
  v_ok       integer := 0;
  v_status   text;
  v_archived timestamptz;
  v_falhas   integer := 0;
begin
  for v_linha in
    select * from public.talkx_segment_bulk_action(
      'activate',
      array['b0000000-0000-0000-0000-000000000004',
            'b0000000-0000-0000-0000-000000000005']::uuid[])
  loop
    if not v_linha.succeeded then
      v_falhas := v_falhas + 1;
      raise exception 'T5 FALHOU: ativar recusou % (%) — a guarda só barra sair de cena',
        v_linha.segment_id, v_linha.error_message;
    end if;
    v_ok := v_ok + 1;
    if v_linha.status <> 'active' or v_linha.archived_at is not null then
      raise exception 'T5 FALHOU: % ativou como status=% archived_at=%',
        v_linha.segment_id, v_linha.status, v_linha.archived_at;
    end if;
  end loop;
  if v_ok <> 2 then
    raise exception 'T5 FALHOU: esperado 2 itens ativados, veio %', v_ok;
  end if;

  select s.status, s.archived_at into v_status, v_archived from public.talkx_segments s
   where s.id = 'b0000000-0000-0000-0000-000000000004';
  if v_status <> 'active' or v_archived is not null then
    raise exception 'T5 FALHOU: o arquivado não voltou de verdade (status=%, archived_at=%)', v_status, v_archived;
  end if;

  raise notice 'T5 OK: inativo e arquivado voltaram a active (archived_at null) sem passar pela guarda';
end $$;

-- =====================================================================================
-- T6 — rascunhar: status vira draft e as regras PUBLICADAS não mudam
-- =====================================================================================
do $$
declare
  v_linha    record;
  v_rules_a  jsonb;
  v_rules_d  jsonb;
  v_status   text;
begin
  select s.rules into v_rules_a from public.talkx_segments s
   where s.id = 'b0000000-0000-0000-0000-000000000005';

  for v_linha in
    select * from public.talkx_segment_bulk_action(
      'draft', array['b0000000-0000-0000-0000-000000000005']::uuid[])
  loop
    if not v_linha.succeeded or v_linha.status <> 'draft' then
      raise exception 'T6 FALHOU: rascunhar devolveu succeeded=% status=%', v_linha.succeeded, v_linha.status;
    end if;
  end loop;

  select s.status, s.rules into v_status, v_rules_d from public.talkx_segments s
   where s.id = 'b0000000-0000-0000-0000-000000000005';
  if v_status <> 'draft' then
    raise exception 'T6 FALHOU: o status gravado foi % (esperado draft)', v_status;
  end if;
  if v_rules_d is distinct from v_rules_a then
    raise exception 'T6 FALHOU: rascunhar alterou as regras publicadas (% -> %)', v_rules_a, v_rules_d;
  end if;

  raise notice 'T6 OK: status draft gravado e as regras publicadas intactas';
end $$;

-- =====================================================================================
-- T7 — id inexistente: P0002 sem citar o id, igual para dois ids, e o lote continua
-- =====================================================================================
do $$
declare
  v_linha  record;
  v_total  integer := 0;
  v_ok     integer := 0;
  v_falha  integer := 0;
  v_msg_a  text;
  v_msg_b  text;
  v_cod_a  text;
  v_cod_b  text;
  v_inex_a uuid := 'b0000000-0000-0000-0000-000000000999';
  v_inex_b uuid := 'b0000000-0000-0000-0000-000000000888';
begin
  for v_linha in
    select * from public.talkx_segment_bulk_action(
      'deactivate',
      array['b0000000-0000-0000-0000-000000000005', v_inex_a, v_inex_b]::uuid[])
  loop
    v_total := v_total + 1;
    if v_linha.succeeded then
      v_ok := v_ok + 1;
    else
      v_falha := v_falha + 1;
      if v_linha.error_code <> 'P0002' or v_linha.error_message <> 'talkx_segment_not_found' then
        raise exception 'T7 FALHOU: id inexistente devolveu %/%', v_linha.error_code, v_linha.error_message;
      end if;
      -- sem oráculo: a resposta não carrega o id
      if position(v_linha.segment_id::text in v_linha.error_message) > 0 then
        raise exception 'T7 FALHOU: a mensagem de erro citou o id (%)', v_linha.error_message;
      end if;
      if v_linha.segment_id = v_inex_a then
        v_msg_a := v_linha.error_message; v_cod_a := v_linha.error_code;
      elsif v_linha.segment_id = v_inex_b then
        v_msg_b := v_linha.error_message; v_cod_b := v_linha.error_code;
      end if;
    end if;
  end loop;

  if v_total <> 3 or v_ok <> 1 or v_falha <> 2 then
    raise exception 'T7 FALHOU: esperado 3 linhas (1 ok, 2 falhas), veio % (% ok, % falhas)',
      v_total, v_ok, v_falha;
  end if;
  if v_msg_a is null or v_msg_b is null or v_msg_a <> v_msg_b or v_cod_a <> v_cod_b then
    raise exception 'T7 FALHOU: dois ids inexistentes responderam diferente (%/% vs %/%)',
      v_cod_a, v_msg_a, v_cod_b, v_msg_b;
  end if;

  raise notice 'T7 OK: id inexistente = P0002 sem citar o id, igual para os dois, e o lote continuou';
end $$;

-- =====================================================================================
-- T8 — entrada inválida: 22023 e nada é alterado
-- =====================================================================================
do $$
declare
  v_casos    text[] := array[
    'acao','vazio','nulo','teto','tag_nula','tag_vazia','tag_longa','tag_em_outra'
  ];
  v_caso     text;
  v_sqlstate text;
  v_erro     text;
  v_status   text;
  v_ids_201  uuid[];
  v_ruins    text := '';
begin
  select array_agg(('b0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid)
    into v_ids_201
    from generate_series(1, 201) as g(i);

  foreach v_caso in array v_casos loop
    v_sqlstate := null; v_erro := null;
    begin
      case v_caso
        when 'acao' then
          perform 1 from public.talkx_segment_bulk_action('excluir', array['b0000000-0000-0000-0000-000000000005']::uuid[]);
        when 'vazio' then
          perform 1 from public.talkx_segment_bulk_action('deactivate', array[]::uuid[]);
        when 'nulo' then
          perform 1 from public.talkx_segment_bulk_action('deactivate', array[null, 'b0000000-0000-0000-0000-000000000005']::uuid[]);
        when 'teto' then
          perform 1 from public.talkx_segment_bulk_action('deactivate', v_ids_201);
        when 'tag_nula' then
          perform 1 from public.talkx_segment_bulk_action('tag', array['b0000000-0000-0000-0000-000000000005']::uuid[], null);
        when 'tag_vazia' then
          perform 1 from public.talkx_segment_bulk_action('tag', array['b0000000-0000-0000-0000-000000000005']::uuid[], '   ');
        when 'tag_longa' then
          perform 1 from public.talkx_segment_bulk_action('tag', array['b0000000-0000-0000-0000-000000000005']::uuid[], repeat('x', 41));
        when 'tag_em_outra' then
          perform 1 from public.talkx_segment_bulk_action('archive', array['b0000000-0000-0000-0000-000000000005']::uuid[], 'vip');
      end case;
      v_ruins := v_ruins || '[' || v_caso || ':aceitou]';
    exception when others then
      v_sqlstate := sqlstate;
      v_erro     := sqlerrm;
    end;

    if v_sqlstate is null then
      continue;  -- já registrado em v_ruins
    end if;
    if v_sqlstate <> '22023' then
      v_ruins := v_ruins || '[' || v_caso || ':' || v_sqlstate || ']';
    end if;
  end loop;

  if v_ruins <> '' then
    raise exception 'T8 FALHOU: caso de entrada inválida sem 22023: %', v_ruins;
  end if;

  -- nada foi alterado pelo lote inválido
  select s.status into v_status from public.talkx_segments s
   where s.id = 'b0000000-0000-0000-0000-000000000005';
  if v_status <> 'inactive' then
    raise exception 'T8 FALHOU: entrada inválida mexeu no segmento (status=%)', v_status;
  end if;

  raise notice 'T8 OK: 8 casos de entrada inválida devolveram 22023 e o segmento ficou intacto';
end $$;

-- =====================================================================================
-- T9 — ACL e assinatura: anon não executa, authenticated executa, uma única assinatura
-- =====================================================================================
do $$
declare
  v_anon    boolean;
  v_auth    boolean;
  v_overloads integer;
  v_segdef  boolean;
  v_config  text;
begin
  v_anon := has_function_privilege('anon', 'public.talkx_segment_bulk_action(text, uuid[], text)', 'execute');
  v_auth := has_function_privilege('authenticated', 'public.talkx_segment_bulk_action(text, uuid[], text)', 'execute');

  if v_anon then
    raise exception 'T9 FALHOU: anon pode executar a RPC';
  end if;
  if not v_auth then
    raise exception 'T9 FALHOU: authenticated não pode executar a RPC';
  end if;

  select count(*) into v_overloads
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'talkx_segment_bulk_action';
  if v_overloads <> 1 then
    raise exception 'T9 FALHOU: existem % assinaturas de talkx_segment_bulk_action (overload nasce aberto)', v_overloads;
  end if;

  select p.prosecdef, array_to_string(p.proconfig, ',') into v_segdef, v_config
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'talkx_segment_bulk_action';
  if v_segdef is not true then
    raise exception 'T9 FALHOU: a função não é SECURITY DEFINER';
  end if;
  if v_config is null or position('search_path=public, pg_temp' in v_config) = 0 then
    raise exception 'T9 FALHOU: search_path não está fixo (proconfig=%)', v_config;
  end if;

  raise notice 'T9 OK: anon sem EXECUTE, authenticated com EXECUTE, 1 assinatura, definer com search_path fixo';
end $$;

-- anon de verdade: o privilégio negado também é o comportamento observado
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare
  v_sqlstate text;
begin
  begin
    perform 1 from public.talkx_segment_bulk_action('deactivate', array['b0000000-0000-0000-0000-000000000001']::uuid[]);
    raise exception 'T9b FALHOU: anon executou a RPC';
  exception when insufficient_privilege then
    v_sqlstate := sqlstate;
  end;
  if v_sqlstate is null then
    raise exception 'T9b FALHOU: anon não recebeu insufficient_privilege';
  end if;
  raise notice 'T9b OK: anon recusado com insufficient_privilege (42501)';
end $$;
reset role;

rollback;
