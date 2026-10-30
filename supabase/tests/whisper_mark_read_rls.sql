-- ============================================================================
-- Prova da leitura de sussurro (whisper_messages.is_read) no Zapp Web V2.
--
-- O QUE PROVA
--   BLOCO A (vermelho, estado de ANTES): sem a policy de UPDATE, o toque que o
--     front faz ao abrir o sussurro (WhisperMode.tsx: `.update({ is_read: true })
--     .eq('contact_id', X).eq('is_read', false)`) NAO muda linha nenhuma e ainda
--     assim nao devolve erro — o is_read fica cravado em false.
--     O estado de antes e reproduzido com um SAVEPOINT: a policy real (criada
--     pela migration 20261015184221) e dropada dentro do savepoint, o defeito e
--     medido, e o `ROLLBACK TO SAVEPOINT` devolve a policy exatamente como a
--     migration a criou — nunca uma copia escrita a mao aqui.
--   BLOCO B (verde, com a policy REAL da migration): o destinatario marca a
--     PROPRIA leitura; o remetente, outro agente e o anon nao marcam nada; e o
--     UPDATE novo NAO vira caminho para editar conteudo/remetente/destino.
--   BLOCO C: as tres linhas do `-- Rollback:` da migration rodam de verdade e
--     devolvem o estado anterior (sem policy de UPDATE, UPDATE de tabela de
--     volta); o savepoint entao restaura o estado corrigido.
--
-- ONDE RODA: no banco LOCAL da tarefa, NUNCA em producao. Como `postgres`, com os
-- papeis REAIS via `SET LOCAL ROLE authenticated`/`anon` + claims de JWT — como
-- `authenticated`/`anon` nao tem BYPASSRLS, toda leitura/escrita passa pela RLS de
-- verdade (mesmo efeito do PostgREST).
--
-- COMANDO (da raiz da copia de trabalho):
--   zapp-db-local psql . <conjunto> < supabase/tests/whisper_mark_read_rls.sql
--
-- Fixtures dentro de UMA transacao, revertidas no fim (ROLLBACK): nada fica no
-- banco. `session_replication_role = replica` so durante os INSERTs (dispensa
-- linhas em auth.users e desliga gatilhos dos fixtures); a RLS continua valendo,
-- porque RLS nao e gatilho.
-- ============================================================================
\set ON_ERROR_STOP on

begin;

\echo '== prova: marcar sussurro como lido (whisper_messages / RLS) =='

set local session_replication_role = replica;

-- Perfis: supervisor (remetente dos sussurros), agent_a (o DESTINATARIO que le)
-- e agent_b (terceiro, dono de outro sussurro).
insert into public.profiles (id, user_id, name, role, is_active) values
  ('aaaaaaa1-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Fixt Supervisor', 'supervisor', true),
  ('aaaaaaa3-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000003', 'Fixt Agent A',    'agent',      true),
  ('aaaaaaa4-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000004', 'Fixt Agent B',    'agent',      true);

insert into public.user_roles (user_id, role) values
  ('11111111-0000-0000-0000-000000000001', 'supervisor'),
  ('11111111-0000-0000-0000-000000000003', 'agent'),
  ('11111111-0000-0000-0000-000000000004', 'agent');

insert into public.contacts (id, name, phone) values
  ('bbbbbbb1-0000-0000-0000-000000000001', 'Fixt Contato 1', '+550****0001'),
  ('bbbbbbb2-0000-0000-0000-000000000002', 'Fixt Contato 2', '+550****0002');

-- d1: dirigido ao agent_a, nao lido   -> agent_a DEVE marcar
-- d2: dirigido ao agent_b, nao lido   -> agent_a NAO pode
-- d3: escrito PELO agent_a para o agent_b -> agent_a NAO pode (nao e o destinatario)
-- d4: dirigido ao agent_a, JA lido    -> fora do filtro `is_read = false` do front
insert into public.whisper_messages (id, contact_id, sender_id, target_agent_id, content, is_read) values
  ('ddddddd1-0000-0000-0000-000000000001', 'bbbbbbb1-0000-0000-0000-000000000001', 'aaaaaaa1-0000-0000-0000-000000000001', 'aaaaaaa3-0000-0000-0000-000000000003', 'fixt sussurro p/ A', false),
  ('ddddddd2-0000-0000-0000-000000000002', 'bbbbbbb1-0000-0000-0000-000000000001', 'aaaaaaa1-0000-0000-0000-000000000001', 'aaaaaaa4-0000-0000-0000-000000000004', 'fixt sussurro p/ B', false),
  ('ddddddd3-0000-0000-0000-000000000003', 'bbbbbbb2-0000-0000-0000-000000000002', 'aaaaaaa3-0000-0000-0000-000000000003', 'aaaaaaa4-0000-0000-0000-000000000004', 'fixt sussurro de A p/ B', false),
  ('ddddddd4-0000-0000-0000-000000000004', 'bbbbbbb2-0000-0000-0000-000000000002', 'aaaaaaa1-0000-0000-0000-000000000001', 'aaaaaaa3-0000-0000-0000-000000000003', 'fixt sussurro ja lido', true);

set local session_replication_role = default;

-- ---------------------------------------------------------------------------
-- BLOCO A (VERMELHO): o estado de ANTES da correcao = tabela sem policy de UPDATE.
-- A policy real (da migration) e dropada DENTRO de um savepoint; o defeito e
-- medido; o rollback ao savepoint devolve a policy igualzinha a da migration.
-- ---------------------------------------------------------------------------
savepoint pre_correcao;

drop policy if exists "Users can mark own whisper messages as read" on public.whisper_messages;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000003","role":"authenticated"}';
-- exatamente o toque do front (WhisperMode.tsx, ao expandir a caixa de sussurro)
update public.whisper_messages set is_read = true
 where contact_id = 'bbbbbbb1-0000-0000-0000-000000000001' and is_read = false;
reset role;

select count(*) filter (where is_read) as lidas
  from public.whisper_messages
 where contact_id = 'bbbbbbb1-0000-0000-0000-000000000001' \gset antes_
\echo '-- BLOCO A (sem a policy): lidas do contato 1 =' :antes_lidas

rollback to savepoint pre_correcao;

-- Guarda de sanidade: a policy real voltou (senao o BLOCO B nao provaria nada).
select count(*) as policy_de_volta
  from pg_policies
 where schemaname = 'public' and tablename = 'whisper_messages' and cmd = 'UPDATE' \gset meio_
\echo '-- BLOCO B: policies de UPDATE vigentes =' :meio_policy_de_volta

-- ---------------------------------------------------------------------------
-- BLOCO B (VERDE): as mesmas sondas, agora contra a policy REAL da migration.
-- ---------------------------------------------------------------------------
-- B1: o DESTINATARIO marca a propria leitura (o toque do front)
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000003","role":"authenticated"}';
update public.whisper_messages set is_read = true
 where contact_id = 'bbbbbbb1-0000-0000-0000-000000000001' and is_read = false;
reset role;

-- B2: o remetente/terceiro NAO marca nada
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000003","role":"authenticated"}';
update public.whisper_messages set is_read = true where id = 'ddddddd2-0000-0000-0000-000000000002';
update public.whisper_messages set is_read = true where id = 'ddddddd3-0000-0000-0000-000000000003';
reset role;

-- B3: o anon NAO marca nada (sem policy de UPDATE para ele; se nem tiver o
-- privilegio de UPDATE, tudo bem — o efeito e conferido no fim)
set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';
do $prova_anon$
begin
  update public.whisper_messages set is_read = true where id = 'ddddddd2-0000-0000-0000-000000000002';
exception when insufficient_privilege then null;
end
$prova_anon$;
reset role;

-- B4: o UPDATE novo NAO pode ser caminho para editar o conteudo/remetente/destino
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000003","role":"authenticated"}';
do $prova_edicao$
begin
  begin
    update public.whisper_messages set content = 'conteudo trocado' where id = 'ddddddd1-0000-0000-0000-000000000001';
    raise exception 'FALHA: o destinatario conseguiu trocar o conteudo do sussurro';
  exception when insufficient_privilege then null;  -- esperado
  end;
  begin
    update public.whisper_messages set sender_id = 'aaaaaaa4-0000-0000-0000-000000000004' where id = 'ddddddd1-0000-0000-0000-000000000001';
    raise exception 'FALHA: o destinatario conseguiu trocar o remetente do sussurro';
  exception when insufficient_privilege then null;  -- esperado
  end;
  begin
    update public.whisper_messages set target_agent_id = 'aaaaaaa4-0000-0000-0000-000000000004' where id = 'ddddddd1-0000-0000-0000-000000000001';
    raise exception 'FALHA: o destinatario conseguiu repassar o sussurro para outro agente';
  exception when insufficient_privilege then null;  -- esperado
  end;
end
$prova_edicao$;
reset role;

-- ---------------------------------------------------------------------------
-- BLOCO C: as tres linhas do `-- Rollback:` da migration rodam de verdade e
-- devolvem o estado anterior. Depois o savepoint restaura o estado corrigido.
-- ---------------------------------------------------------------------------
savepoint pre_rollback;

drop policy if exists "Users can mark own whisper messages as read" on public.whisper_messages;
revoke update (is_read) on public.whisper_messages from authenticated;
grant update on public.whisper_messages to authenticated;

select count(*) as n_policies_update
  from pg_policies
 where schemaname = 'public' and tablename = 'whisper_messages' and cmd = 'UPDATE' \gset rollback_
select has_table_privilege('authenticated', 'public.whisper_messages', 'UPDATE')::int as tabela_liberada \gset rollback_

rollback to savepoint pre_rollback;

-- ---------------------------------------------------------------------------
-- Estado final de cada linha + privilegios, lidos como `postgres`.
-- ---------------------------------------------------------------------------
select (is_read)::int as d1, (select (is_read)::int from public.whisper_messages where id = 'ddddddd2-0000-0000-0000-000000000002') as d2
  from public.whisper_messages where id = 'ddddddd1-0000-0000-0000-000000000001' \gset fim_
select (is_read)::int as d3, (select (is_read)::int from public.whisper_messages where id = 'ddddddd4-0000-0000-0000-000000000004') as d4
  from public.whisper_messages where id = 'ddddddd3-0000-0000-0000-000000000003' \gset fim_
select content as d1_content, sender_id::text as d1_sender, target_agent_id::text as d1_target
  from public.whisper_messages where id = 'ddddddd1-0000-0000-0000-000000000001' \gset fim_
select has_column_privilege('authenticated', 'public.whisper_messages', 'is_read', 'UPDATE')::int as col_is_read \gset privil_
select has_column_privilege('authenticated', 'public.whisper_messages', 'content', 'UPDATE')::int as col_content \gset privil_
select has_column_privilege('authenticated', 'public.whisper_messages', 'sender_id', 'UPDATE')::int as col_sender \gset privil_
select has_table_privilege('authenticated', 'public.whisper_messages', 'UPDATE')::int as tab_update \gset privil_
select count(*) as n_policies from pg_policies where schemaname = 'public' and tablename = 'whisper_messages' and cmd = 'UPDATE' \gset privil_

create temp table _res (metrica text primary key, valor bigint, texto text) on commit drop;

insert into _res (metrica, valor) values
  ('antes.lidas_contato_1',     :antes_lidas),
  ('meio.policy_de_volta',      :meio_policy_de_volta),
  ('rollback.n_policies_update', :rollback_n_policies_update),
  ('rollback.tabela_liberada',  :rollback_tabela_liberada),
  ('fim.n_policies',            :privil_n_policies),
  ('fim.update_de_tabela',      :privil_tab_update),
  ('fim.col_is_read',           :privil_col_is_read),
  ('fim.col_content',           :privil_col_content),
  ('fim.col_sender',            :privil_col_sender),
  ('fim.d1_lida',               :fim_d1),
  ('fim.d2_lida',               :fim_d2),
  ('fim.d3_lida',               :fim_d3),
  ('fim.d4_lida',               :fim_d4);

insert into _res (metrica, texto) values
  ('fim.d1_content', :'fim_d1_content'),
  ('fim.d1_sender',  :'fim_d1_sender'),
  ('fim.d1_target',  :'fim_d1_target');

do $prova$
declare v_ok boolean; v_n int;
begin
  select count(*), bool_and(p.valor = e.valor and coalesce(p.texto, '') = coalesce(e.texto, ''))
    into v_n, v_ok
    from _res p
    join (values
      ('antes.lidas_contato_1',      0::bigint, null::text), -- BLOCO A: sem policy, nada fica lido
      ('meio.policy_de_volta',       1, null),               -- a policy real da migration voltou
      ('rollback.n_policies_update', 0, null),               -- BLOCO C: o rollback tira a policy
      ('rollback.tabela_liberada',   1, null),               -- BLOCO C: e devolve o UPDATE de tabela
      ('fim.n_policies',             1, null),               -- estado corrigido de volta
      ('fim.update_de_tabela',       0, null),
      ('fim.col_is_read',            1, null),
      ('fim.col_content',            0, null),
      ('fim.col_sender',             0, null),
      ('fim.d1_lida',                1, null),               -- B1: o destinatario marcou
      ('fim.d2_lida',                0, null),               -- B2: outro destino, ninguem marcou
      ('fim.d3_lida',                0, null),               -- B2: remetente nao marca o do outro
      ('fim.d4_lida',                1, null),               -- ja lida, intacta
      ('fim.d1_content',             null, 'fixt sussurro p/ A'),
      ('fim.d1_sender',              null, 'aaaaaaa1-0000-0000-0000-000000000001'),
      ('fim.d1_target',              null, 'aaaaaaa3-0000-0000-0000-000000000003')
    ) as e(metrica, valor, texto) using (metrica);

  if not v_ok then
    raise exception 'FALHA: alguma metrica nao bateu com a regra. Resultado obtido:%',
      (select string_agg(format(E'\n  %s = %s %s', metrica, coalesce(valor::text, '-'), coalesce(texto, '')), '' order by metrica) from _res);
  end if;

  -- Guarda de sanidade: as 16 metricas esperadas foram conferidas.
  if v_n <> 16 then
    raise exception 'FALHA: esperava conferir 16 metricas, conferi %', v_n;
  end if;
end
$prova$;

\echo '-- resultado (is_read por sussurro): d1 (destino A) true; d2, d3 false; d4 true --'
select id, target_agent_id, is_read from public.whisper_messages order by id;
\echo 'OK: prova da leitura de sussurro passou'

rollback;
