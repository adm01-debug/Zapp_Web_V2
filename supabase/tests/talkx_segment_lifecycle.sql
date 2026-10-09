-- talkx_segment_lifecycle.sql
-- TL-129 / X101 (Talk X, F09 Segmentos) — teste SQL do ciclo de vida do segmento.
--
-- COMO RODAR (banco com as migrations REAIS aplicadas, inclusive a
-- 20261009052830_talkx_segments_lifecycle.sql):
--   psql -X -q -v ON_ERROR_STOP=1 -f supabase/tests/talkx_segment_lifecycle.sql
--   (-v ON_ERROR_STOP=1 e obrigatorio: sem ele o psql seguiria depois de uma falha)
--
-- O arquivo cria os PROPRIOS dados sinteticos e termina com ROLLBACK: nao deixa nada
-- no banco. A prova de comportamento roda SEMPRE com o papel real (SET LOCAL ROLE
-- authenticated / anon / service_role + request.jwt.claims). O papel dono do banco
-- aparece so na criacao dos dados (fixture), nunca na assercao.
--
-- O QUE PROVA (o defeito e vermelho sem a migration):
--   T1  status 'draft' e aceito (o CHECK antigo so aceitava 'active','inactive')
--   T2  status fora da lista e rejeitado
--   T3  tags persistem e o indice GIN responde a busca por tag
--   T4  a revisao publicada persiste (revision/published_at/published_by + a linha
--       em talkx_segment_versions) — "preservar a revisao publicada"
--   T5  segmento EM USO (campanha scheduled/sending/paused) nao e arquivado, inativado
--       nem excluido; o erro devolve o nome da campanha (N22: arquivar, nao excluir)
--   T6  segmento fora de uso arquiva, sai do filtro archived_at is null e pode ser excluido
--   T7  authenticated nao grava versao; service_role grava (escrita so pelo caminho de servico)
--   T8  authenticated que nao e dono nem admin nao ve a versao do outro (RLS de leitura)
--   T9  retencao: a 21a versao descarta a 1a e sobram 20
--   T10 anon nao le versao nenhuma e nao ve nenhum segmento

begin;

-- =====================================================================================
-- FIXTURE (papel dono do banco: so prepara os dados; nenhuma assercao roda aqui)
-- =====================================================================================
insert into public.profiles (id, user_id, role, is_active) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'agent', true),
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'agent', true),
  ('a0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'admin', true)
on conflict (user_id) do nothing;

insert into public.user_roles (user_id, role) values
  ('33333333-3333-3333-3333-333333333333', 'admin')
on conflict do nothing;

-- S_LIVRE: sem campanha nenhuma. S_USADO: campanha scheduled na coluna segment_id.
-- S_LISTA: campanha scheduled via a lista talkx_campaign_segments (X057).
insert into public.talkx_segments (id, name, description, origin, status, is_favorite, rules, estimated_count, created_by)
values
  ('b0000000-0000-0000-0000-000000000001', 'Segmento livre',  'sem campanha', 'zapp',   'active', false, '{"groups":[]}'::jsonb, 0, 'a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002', 'Segmento usado',  'campanha agendada', 'zapp', 'active', false, '{"groups":[]}'::jsonb, 0, 'a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000003', 'Segmento em lista', 'campanha multissegmento', 'zapp', 'active', false, '{"groups":[]}'::jsonb, 0, 'a0000000-0000-0000-0000-000000000001');

insert into public.talkx_campaigns (id, name, message_template, status, created_by, segment_id, scheduled_at)
values
  ('c0000000-0000-0000-0000-000000000001', 'Campanha Agendada', 'ola {{nome}}', 'scheduled', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', now() + interval '1 day'),
  ('c0000000-0000-0000-0000-000000000002', 'Campanha da Lista', 'ola {{nome}}', 'scheduled', 'a0000000-0000-0000-0000-000000000001', null, now() + interval '2 day');

insert into public.talkx_campaign_segments (campaign_id, segment_id, position, status)
values ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', 1, 'pending');

-- =====================================================================================
-- T1 — status 'draft' e aceito (como authenticated, dono da linha)
-- =====================================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

do $$
declare
  v_status text;
begin
  insert into public.talkx_segments (id, name, status, created_by)
  values ('b0000000-0000-0000-0000-000000000011', 'Rascunho novo', 'draft', 'a0000000-0000-0000-0000-000000000001');

  select status into v_status from public.talkx_segments
   where id = 'b0000000-0000-0000-0000-000000000011';
  if v_status <> 'draft' then
    raise exception 'T1 FALHOU: status gravado % (esperado draft)', v_status;
  end if;
  raise notice 'T1 OK: status draft aceito e persistido';
end $$;

-- =====================================================================================
-- T2 — status fora da lista e rejeitado
-- =====================================================================================
do $$
declare
  v_barrado boolean := false;
begin
  begin
    update public.talkx_segments set status = 'published'
     where id = 'b0000000-0000-0000-0000-000000000001';
  exception when check_violation then
    v_barrado := true;
  end;
  if not v_barrado then
    raise exception 'T2 FALHOU: status fora da lista (published) foi aceito';
  end if;
  raise notice 'T2 OK: status fora de draft/active/inactive rejeitado pelo CHECK';
end $$;

-- T2b — o CHECK aceita exatamente os tres valores (nenhum a mais)
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
   where t.relname = 'talkx_segments' and c.conname = 'talkx_segments_status_check';
  if v_def is null or v_def not like '%draft%' or v_def not like '%active%' or v_def not like '%inactive%' then
    raise exception 'T2b FALHOU: CHECK de status nao lista draft/active/inactive (%)', v_def;
  end if;
  if v_def like '%published%' or v_def like '%archived%' then
    raise exception 'T2b FALHOU: CHECK de status aceita valor a mais (%)', v_def;
  end if;
  raise notice 'T2b OK: CHECK de status = %', v_def;
end $$;

-- =====================================================================================
-- T3 — tags persistem e o indice GIN responde a busca por tag
-- =====================================================================================
do $$
declare
  v_tags  text[];
  v_achou integer;
begin
  update public.talkx_segments
     set tags = array['vip','sudeste']
   where id = 'b0000000-0000-0000-0000-000000000001';

  select tags into v_tags from public.talkx_segments
   where id = 'b0000000-0000-0000-0000-000000000001';
  if v_tags is null or v_tags <> array['vip','sudeste']::text[] then
    raise exception 'T3 FALHOU: tags nao persistiram (%)', v_tags;
  end if;

  -- a busca por tag e a que a tela faz (operador de contencao do GIN)
  select count(*) into v_achou from public.talkx_segments where tags @> array['vip']::text[];
  if v_achou <> 1 then
    raise exception 'T3 FALHOU: busca por tag devolveu % linhas (esperado 1)', v_achou;
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'talkx_segments'
       and indexname = 'idx_talkx_segments_tags' and indexdef ilike '%using gin%'
  ) then
    raise exception 'T3 FALHOU: indice GIN idx_talkx_segments_tags ausente';
  end if;
  raise notice 'T3 OK: tags persistem (%), busca por tag responde e o indice e GIN', v_tags;
end $$;

-- =====================================================================================
-- T4 — a revisao publicada persiste (revision + published_at/published_by + versao)
-- =====================================================================================
do $$
declare
  v_rev    integer;
  v_pub    timestamptz;
  v_autor  uuid;
begin
  update public.talkx_segments
     set rules        = '{"groups":[{"match":"and","rules":[]}]}'::jsonb,
         revision     = 1,
         published_at = now(),
         published_by = 'a0000000-0000-0000-0000-000000000001',
         status       = 'active'
   where id = 'b0000000-0000-0000-0000-000000000001';

  select revision, published_at, published_by into v_rev, v_pub, v_autor
    from public.talkx_segments where id = 'b0000000-0000-0000-0000-000000000001';
  if v_rev <> 1 or v_pub is null or v_autor is null then
    raise exception 'T4 FALHOU: revisao publicada nao persistiu (revision=%, published_at=%, published_by=%)', v_rev, v_pub, v_autor;
  end if;
  raise notice 'T4a OK: revisao publicada persiste no segmento (revision=%, autor=%)', v_rev, v_autor;
end $$;

reset role;
-- a versao e gravada pelo CAMINHO DE SERVICO (a RPC de publicacao, dona da escrita)
set local role service_role;
do $$
declare
  v_rules jsonb;
  v_rev   integer;
begin
  insert into public.talkx_segment_versions (segment_id, version_no, rules, estimated_count, note, created_by)
  values ('b0000000-0000-0000-0000-000000000001', 1, '{"groups":[{"match":"and","rules":[]}]}'::jsonb, 42, 'primeira publicacao', 'a0000000-0000-0000-0000-000000000001');

  select v.rules, s.revision into v_rules, v_rev
    from public.talkx_segment_versions v
    join public.talkx_segments s on s.id = v.segment_id
   where v.segment_id = 'b0000000-0000-0000-0000-000000000001' and v.version_no = 1;
  if v_rules is null or v_rev <> 1 then
    raise exception 'T4 FALHOU: versao publicada nao persistiu (rules=%, revision=%)', v_rules, v_rev;
  end if;
  raise notice 'T4b OK: versao 1 da revisao publicada persiste (rules=%)', v_rules;
end $$;

-- =====================================================================================
-- T5 — segmento EM USO nao e arquivado, inativado nem excluido (e o erro diz a campanha)
-- =====================================================================================
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

do $$
declare
  v_msg     text;
  v_barrou  integer := 0;
  v_seg     uuid := 'b0000000-0000-0000-0000-000000000002';
begin
  -- 1) arquivar
  begin
    update public.talkx_segments set archived_at = now() where id = v_seg;
    raise exception 'T5 FALHOU: arquivou segmento usado por campanha agendada';
  exception when others then
    v_msg := sqlerrm;
    if v_msg like 'T5 FALHOU%' then raise; end if;
    if v_msg not like '%talkx_segment_in_use%' or v_msg not like '%Campanha Agendada%' then
      raise exception 'T5 FALHOU: arquivamento barrado com a mensagem errada: %', v_msg;
    end if;
    v_barrou := v_barrou + 1;
  end;

  -- 2) inativar
  begin
    update public.talkx_segments set status = 'inactive' where id = v_seg;
    raise exception 'T5 FALHOU: inativou segmento usado por campanha agendada';
  exception when others then
    v_msg := sqlerrm;
    if v_msg like 'T5 FALHOU%' then raise; end if;
    if v_msg not like '%talkx_segment_in_use%' or v_msg not like '%Campanha Agendada%' then
      raise exception 'T5 FALHOU: inativacao barrada com a mensagem errada: %', v_msg;
    end if;
    v_barrou := v_barrou + 1;
  end;

  -- 3) excluir (remocao DESTRUTIVA)
  begin
    delete from public.talkx_segments where id = v_seg;
    raise exception 'T5 FALHOU: excluiu segmento usado por campanha agendada';
  exception when others then
    v_msg := sqlerrm;
    if v_msg like 'T5 FALHOU%' then raise; end if;
    if v_msg not like '%talkx_segment_in_use%' or v_msg not like '%Campanha Agendada%' then
      raise exception 'T5 FALHOU: exclusao barrada com a mensagem errada: %', v_msg;
    end if;
    v_barrou := v_barrou + 1;
  end;

  if v_barrou <> 3 then
    raise exception 'T5 FALHOU: % das 3 saidas de cena foram barradas', v_barrou;
  end if;
  raise notice 'T5 OK: arquivar, inativar e excluir segmento em uso barrados com o nome da campanha';
end $$;

-- T5b — o mesmo segmento usado pela LISTA de segmentos da campanha (X057) tambem protege
do $$
declare
  v_msg text;
begin
  begin
    update public.talkx_segments set archived_at = now() where id = 'b0000000-0000-0000-0000-000000000003';
    raise exception 'T5b FALHOU: arquivou segmento usado pela lista de segmentos da campanha';
  exception when others then
    v_msg := sqlerrm;
    if v_msg like 'T5b FALHOU%' then raise; end if;
    if v_msg not like '%talkx_segment_in_use%' or v_msg not like '%Campanha da Lista%' then
      raise exception 'T5b FALHOU: mensagem errada: %', v_msg;
    end if;
  end;
  raise notice 'T5b OK: uso pela lista talkx_campaign_segments tambem protege o segmento';
end $$;

-- T5c — o segmento em uso continua intacto depois das tentativas
do $$
declare
  v_arch timestamptz;
  v_st   text;
begin
  select archived_at, status into v_arch, v_st from public.talkx_segments
   where id = 'b0000000-0000-0000-0000-000000000002';
  if v_arch is not null or v_st <> 'active' then
    raise exception 'T5c FALHOU: segmento em uso mudou de estado (archived_at=%, status=%)', v_arch, v_st;
  end if;
  raise notice 'T5c OK: segmento em uso segue archived_at nulo e status active';
end $$;

-- =====================================================================================
-- T6 — segmento FORA de uso arquiva, some do filtro e pode ser excluido
-- =====================================================================================
do $$
declare
  v_restou integer;
begin
  update public.talkx_segments set archived_at = now()
   where id = 'b0000000-0000-0000-0000-000000000011';
  select count(*) into v_restou from public.talkx_segments
   where id = 'b0000000-0000-0000-0000-000000000011' and archived_at is null;
  if v_restou <> 0 then
    raise exception 'T6 FALHOU: segmento arquivado continua no filtro archived_at is null';
  end if;
  raise notice 'T6a OK: segmento fora de uso arquiva e some do filtro archived_at is null';
end $$;

reset role;
-- a campanha sai do status que bloqueia: o segmento deixa de estar em uso
update public.talkx_campaigns set status = 'completed'
 where id = 'c0000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$
declare
  v_sobrou integer;
begin
  update public.talkx_segments set archived_at = now()
   where id = 'b0000000-0000-0000-0000-000000000002';
  select count(*) into v_sobrou from public.talkx_segments
   where id = 'b0000000-0000-0000-0000-000000000002' and archived_at is not null;
  if v_sobrou <> 1 then
    raise exception 'T6 FALHOU: segmento sem campanha ativa nao pode ser arquivado';
  end if;
  raise notice 'T6b OK: com a campanha concluida, o arquivamento passa';
end $$;

-- =====================================================================================
-- T7 — authenticated nao grava versao; service_role grava
-- =====================================================================================
do $$
declare
  v_msg text;
  v_ok  boolean := false;
begin
  begin
    insert into public.talkx_segment_versions (segment_id, version_no, rules)
    values ('b0000000-0000-0000-0000-000000000002', 9, '{"groups":[]}'::jsonb);
  exception when others then
    v_msg := sqlerrm;
    if v_msg not like '%permission denied%' and v_msg not like '%row-level security%' then
      raise exception 'T7 FALHOU: insert de versao barrado por outro motivo: %', v_msg;
    end if;
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'T7 FALHOU: authenticated gravou versao (escrita tem de ser so do servico)';
  end if;
  raise notice 'T7a OK: authenticated nao grava versao (%)', v_msg;
end $$;

reset role;
do $$
declare
  v_n integer;
begin
  if has_table_privilege('authenticated', 'public.talkx_segment_versions', 'INSERT') then
    raise exception 'T7 FALHOU: authenticated tem INSERT na tabela de versoes';
  end if;
  if not has_table_privilege('service_role', 'public.talkx_segment_versions', 'INSERT') then
    raise exception 'T7 FALHOU: service_role NAO tem INSERT na tabela de versoes';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.talkx_segment_versions'::regclass) then
    raise exception 'T7 FALHOU: talkx_segment_versions nasceu sem RLS ligada';
  end if;
  select count(*) into v_n from public.talkx_segment_versions;
  if v_n < 1 then
    raise exception 'T7 FALHOU: nenhuma versao no banco (% linhas)', v_n;
  end if;
  raise notice 'T7b OK: ACL e RLS da tabela de versoes conferidos (authenticated sem INSERT, service_role com INSERT, RLS ligada)';
end $$;

-- =====================================================================================
-- T8 — authenticated que nao e dono nem admin nao ve a versao do outro
-- =====================================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$
declare
  v_outro integer;
  v_admin integer;
begin
  select count(*) into v_outro from public.talkx_segment_versions;
  if v_outro <> 0 then
    raise exception 'T8 FALHOU: usuario de outro dono viu % versoes', v_outro;
  end if;

  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
  select count(*) into v_admin from public.talkx_segment_versions
   where segment_id = 'b0000000-0000-0000-0000-000000000001';
  if v_admin < 1 then
    raise exception 'T8 FALHOU: admin/supervisor nao viu a versao do segmento (% linhas)', v_admin;
  end if;
  raise notice 'T8 OK: versao invisivel para quem nao e dono nem admin; visivel para o admin';
end $$;

-- =====================================================================================
-- T9 — retencao: a 21a versao descarta a 1a e sobram 20
-- =====================================================================================
reset role;
set local role service_role;
do $$
declare
  v_n     integer;
  v_um    integer;
  v_max   integer;
begin
  -- ja existe a versao 1; grava a 2..21 (a 21a entra e a 1a sai)
  insert into public.talkx_segment_versions (segment_id, version_no, rules, estimated_count)
  select 'b0000000-0000-0000-0000-000000000001', g, '{"groups":[]}'::jsonb, g
    from generate_series(2, 21) as g;

  select count(*), max(version_no) into v_n, v_max
    from public.talkx_segment_versions where segment_id = 'b0000000-0000-0000-0000-000000000001';
  select count(*) into v_um from public.talkx_segment_versions
   where segment_id = 'b0000000-0000-0000-0000-000000000001' and version_no = 1;

  if v_n <> 20 then
    raise exception 'T9 FALHOU: ficaram % versoes (esperado 20)', v_n;
  end if;
  if v_um <> 0 then
    raise exception 'T9 FALHOU: a versao 1 (a mais antiga) nao foi descartada';
  end if;
  if v_max <> 21 then
    raise exception 'T9 FALHOU: a ultima versao gravada e % (esperado 21)', v_max;
  end if;
  raise notice 'T9 OK: retencao mantem as 20 ultimas (max=%, 1a descartada)', v_max;
end $$;

-- =====================================================================================
-- T10 — anon nao le versao nenhuma e nao ve nenhum segmento
-- =====================================================================================
reset role;
set local role anon;
do $$
declare
  v_msg text;
  v_seg integer;
begin
  begin
    perform count(*) from public.talkx_segment_versions;
    raise exception 'T10 FALHOU: anon leu a tabela de versoes';
  exception when others then
    v_msg := sqlerrm;
    if v_msg like 'T10 FALHOU%' then raise; end if;
  end;
  raise notice 'T10a OK: anon nao le versoes (%)', v_msg;

  select count(*) into v_seg from public.talkx_segments;
  if v_seg <> 0 then
    raise exception 'T10 FALHOU: anon viu % segmentos', v_seg;
  end if;
  raise notice 'T10b OK: anon nao ve nenhum segmento';
end $$;

reset role;

-- =====================================================================================
-- O defeito volta a aparecer sem a migration: confira rodando ESTE arquivo num banco
-- SEM a 20261009052830_talkx_segments_lifecycle.sql (T1 falha no CHECK antigo, T3 na
-- coluna tags, T4/T5 na estrutura de versoes e na guarda de uso, T7/T9/T10 na tabela
-- de versoes, T5 na guarda: "column does not exist" / "relation does not exist").
-- =====================================================================================
do $$
begin
  raise notice 'SUITE COMPLETA OK: T1..T10 (ciclo de vida do segmento Talk X)';
end $$;

rollback;
