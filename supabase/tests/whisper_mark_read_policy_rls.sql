-- ============================================================================
-- Prova da leitura do sussurro (public.whisper_messages.is_read) no Zapp Web V2.
-- Cartao t_1c2e589e (achado L5 da paridade 11 / DK-08).
--
-- O QUE PROVA
--   BLOCO A (VERMELHO, estado de ANTES): sem a policy de UPDATE o toque do front
--     (`WhisperMode.tsx`: `.update({ is_read: true }).eq('contact_id', X)
--     .eq('is_read', false)`) NAO muda linha nenhuma e ainda assim nao devolve
--     erro — o is_read fica cravado em false. O estado de antes e reproduzido
--     dentro de um SAVEPOINT (a policy e o gatilho REAIS da migration sao
--     dropados ali, o defeito e medido, e o `ROLLBACK TO SAVEPOINT` devolve os
--     objetos exatamente como a migration os criou — nunca uma copia escrita a
--     mao neste arquivo).
--   BLOCO B (VERDE, com a policy e o gatilho REAIS da migration):
--     B1 o DESTINATARIO marca a propria leitura (o toque do front, filtrado);
--     B2 remetente/terceiro NAO marcam (0 linhas);
--     B3 ADMIN que nao e o destinatario NAO marca (0 linhas);
--     B4 anon NAO marca nada;
--     B5 trocar `content`/`sender_id`/`target_agent_id` como destinatario nao
--        muda linha nenhuma (privilegio de coluna + RLS);
--     B6 o GATILHO barra trocar `content` ate por quem passa por cima da RLS
--        (a sessao superusuario), e NAO barra a troca de `is_read`.
--   BLOCO C: as cinco linhas do `-- Rollback:` da migration rodam de verdade e
--     devolvem o estado anterior (sem policy de UPDATE, com o UPDATE de tabela
--     de volta); o savepoint entao restaura o estado corrigido.
--
-- ONDE RODA: no banco LOCAL da tarefa, NUNCA em producao. Como `postgres`, com os
-- papeis REAIS via `SET LOCAL ROLE authenticated`/`anon` + claims de JWT — como
-- `authenticated`/`anon` nao tem BYPASSRLS, toda leitura/escrita passa pela RLS
-- de verdade (mesmo efeito do PostgREST).
--
-- COMANDO (da raiz da copia de trabalho):
--   zapp-db-local psql . <conjunto> < supabase/tests/whisper_mark_read_policy_rls.sql
--
-- Fixtures dentro de UMA transacao, revertidas no fim (`rollback`): nada fica no
-- banco. `session_replication_role = replica` so durante os INSERTs (dispensa
-- linhas em auth.users e desliga gatilhos dos fixtures); a RLS continua valendo,
-- porque RLS nao e gatilho.
-- ============================================================================
\set ON_ERROR_STOP on

begin;

\echo '== prova: marcar sussurro como lido (whisper_messages / policy de UPDATE + gatilho) =='

set local session_replication_role = replica;

-- Perfis: supervisor (remetente dos sussurros), agent_a (o DESTINATARIO que le),
-- agent_b (terceiro, dono de outro sussurro) e um admin (que nao e destinatario).
insert into public.profiles (id, user_id, name, role, is_active) values
  ('aaaaaaa1-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Fixt Supervisor', 'supervisor', true),
  ('aaaaaaa3-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000003', 'Fixt Agent A',    'agent',      true),
  ('aaaaaaa4-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000004', 'Fixt Agent B',    'agent',      true),
  ('aaaaaaa5-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000005', 'Fixt Admin',      'admin',      true);

insert into public.user_roles (user_id, role) values
  ('11111111-0000-0000-0000-000000000001', 'supervisor'),
  ('11111111-0000-0000-0000-000000000003', 'agent'),
  ('11111111-0000-0000-0000-000000000004', 'agent'),
  ('11111111-0000-0000-0000-000000000005', 'admin');

insert into public.contacts (id, name, phone) values
  ('bbbbbbb1-0000-0000-0000-000000000001', 'Fixt Contato 1', '+550****0001'),
  ('bbbbbbb2-0000-0000-0000-000000000002', 'Fixt Contato 2', '+550****0002');

-- d1: dirigido ao agent_a, nao lido     -> agent_a DEVE marcar
-- d2: dirigido ao agent_b, nao lido     -> agent_a NAO pode
-- d3: escrito PELO agent_a para agent_b -> agent_a NAO pode (nao e o destinatario)
-- d4: dirigido ao agent_a, JA lido      -> fora do filtro `is_read = false` do front
insert into public.whisper_messages (id, contact_id, sender_id, target_agent_id, content, is_read) values
  ('ddddddd1-0000-0000-0000-000000000001', 'bbbbbbb1-0000-0000-0000-000000000001', 'aaaaaaa1-0000-0000-0000-000000000001', 'aaaaaaa3-0000-0000-0000-000000000003', 'fixt sussurro p/ A', false),
  ('ddddddd2-0000-0000-0000-000000000002', 'bbbbbbb1-0000-0000-0000-000000000001', 'aaaaaaa1-0000-0000-0000-000000000001', 'aaaaaaa4-0000-0000-0000-000000000004', 'fixt sussurro p/ B', false),
  ('ddddddd3-0000-0000-0000-000000000003', 'bbbbbbb2-0000-0000-0000-000000000002', 'aaaaaaa3-0000-0000-0000-000000000003', 'aaaaaaa4-0000-0000-0000-000000000004', 'fixt sussurro de A p/ B', false),
  ('ddddddd4-0000-0000-0000-000000000004', 'bbbbbbb2-0000-0000-0000-000000000002', 'aaaaaaa1-0000-0000-0000-000000000001', 'aaaaaaa3-0000-0000-0000-000000000003', 'fixt sussurro ja lido', true);

set local session_replication_role = default;

-- ---------------------------------------------------------------------------
-- BLOCO A (VERMELHO): estado de ANTES = tabela sem policy de UPDATE e sem o
-- gatilho. Os objetos REAIS da migration sao dropados DENTRO de um savepoint; o
-- defeito e medido; o rollback ao savepoint devolve tudo igual a migration.
-- ---------------------------------------------------------------------------
savepoint pre_correcao;

drop trigger if exists whisper_messages_somente_is_read on public.whisper_messages;
drop policy if exists "Users can mark own whisper messages as read" on public.whisper_messages;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000003","role":"authenticated"}';
-- exatamente o toque do front (WhisperMode.tsx, ao expandir a caixa de sussurro)
update public.whisper_messages set is_read = true
 where contact_id = 'bbbbbbb1-0000-0000-0000-000000000001' and is_read = false;
reset role;

do $prova_antes$
declare
  v_lidas int;
begin
  select count(*) filter (where is_read) into v_lidas
    from public.whisper_messages
   where contact_id = 'bbbbbbb1-0000-0000-0000-000000000001';
  raise notice 'BLOCO A (sem a policy): lidas do contato 1 = %', v_lidas;
  if v_lidas <> 0 then
    raise exception 'FALHA: o estado de ANTES ja marcava leitura (lidas=%) — a prova nao reproduz o defeito', v_lidas;
  end if;
end
$prova_antes$;

rollback to savepoint pre_correcao;

-- Guarda de sanidade: os objetos reais voltaram (senao o BLOCO B nao provaria nada).
do $prova_objetos$
declare
  v_pol int;
  v_trg int;
begin
  select count(*) into v_pol from pg_policies
   where schemaname = 'public' and tablename = 'whisper_messages' and cmd = 'UPDATE';
  select count(*) into v_trg from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
   where c.relname = 'whisper_messages' and t.tgname = 'whisper_messages_somente_is_read' and not t.tgisinternal;
  raise notice 'BLOCO B: policies de UPDATE vigentes = % ; gatilhos vigentes = %', v_pol, v_trg;
  if v_pol <> 1 or v_trg <> 1 then
    raise exception 'FALHA: os objetos da migration nao estao aplicados (policies=%, gatilhos=%)', v_pol, v_trg;
  end if;
end
$prova_objetos$;

-- ---------------------------------------------------------------------------
-- BLOCO B (VERDE): as mesmas sondas, agora contra os objetos REAIS da migration.
-- ---------------------------------------------------------------------------
-- B1: o DESTINATARIO marca a propria leitura (o toque do front)
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000003","role":"authenticated"}';
update public.whisper_messages set is_read = true
 where contact_id = 'bbbbbbb1-0000-0000-0000-000000000001' and is_read = false;
reset role;

-- B2: o destinatario NAO marca o que nao e dele (d2: destino B; d3: escrito por ele)
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000003","role":"authenticated"}';
update public.whisper_messages set is_read = true where id = 'ddddddd2-0000-0000-0000-000000000002';
update public.whisper_messages set is_read = true where id = 'ddddddd3-0000-0000-0000-000000000003';
reset role;

-- B3: o ADMIN que nao e o destinatario NAO marca (nao ha ramo administrativo)
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000005","role":"authenticated"}';
update public.whisper_messages set is_read = true where id = 'ddddddd2-0000-0000-0000-000000000002';
reset role;

-- B4: o anon NAO marca nada (sem policy para ele; se nem tiver o privilegio de
-- UPDATE, tudo bem — o efeito e conferido no fim)
set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';
do $prova_anon$
begin
  update public.whisper_messages set is_read = true where id = 'ddddddd2-0000-0000-0000-000000000002';
exception when insufficient_privilege then null;
end
$prova_anon$;
reset role;

-- B5: o UPDATE novo NAO pode ser caminho para editar conteudo/remetente/destino
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000003","role":"authenticated"}';
do $prova_edicao$
declare
  v_n int;
begin
  begin
    update public.whisper_messages set content = 'conteudo trocado' where id = 'ddddddd1-0000-0000-0000-000000000001';
    get diagnostics v_n = row_count;
    if v_n > 0 then
      raise exception 'FALHA: o destinatario conseguiu trocar o conteudo do sussurro';
    end if;
  exception when insufficient_privilege then null;  -- esperado (privilegio de coluna)
  end;
  begin
    update public.whisper_messages set sender_id = 'aaaaaaa4-0000-0000-0000-000000000004' where id = 'ddddddd1-0000-0000-0000-000000000001';
    get diagnostics v_n = row_count;
    if v_n > 0 then
      raise exception 'FALHA: o destinatario conseguiu trocar o remetente do sussurro';
    end if;
  exception when insufficient_privilege then null;  -- esperado
  end;
  begin
    update public.whisper_messages set target_agent_id = 'aaaaaaa4-0000-0000-0000-000000000004' where id = 'ddddddd1-0000-0000-0000-000000000001';
    get diagnostics v_n = row_count;
    if v_n > 0 then
      raise exception 'FALHA: o destinatario conseguiu repassar o sussurro para outro agente';
    end if;
  exception when insufficient_privilege then null;  -- esperado
  end;
end
$prova_edicao$;
reset role;

-- B6: o GATILHO e a segunda rede — barra a edicao de conteudo ate por quem passa
-- por cima da RLS (a sessao superusuario), e NAO barra a troca de `is_read`.
do $prova_gatilho$
begin
  begin
    update public.whisper_messages set content = 'trocado por cima da RLS' where id = 'ddddddd1-0000-0000-0000-000000000001';
    raise exception 'FALHA: o gatilho nao barrou a troca de conteudo por cima da RLS';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%so a coluna is_read%' then
        raise exception 'FALHA: erro inesperado no lugar do gatilho: %', sqlerrm;
      end if;
  end;
end
$prova_gatilho$;

-- o gatilho nao pode atrapalhar a unica escrita legitima: marcar is_read
update public.whisper_messages set is_read = true where id = 'ddddddd4-0000-0000-0000-000000000004';

-- ---------------------------------------------------------------------------
-- BLOCO C: as cinco linhas do `-- Rollback:` da migration rodam de verdade e
-- devolvem o estado anterior. Depois o savepoint restaura o estado corrigido.
-- ---------------------------------------------------------------------------
savepoint pre_rollback;

drop trigger if exists whisper_messages_somente_is_read on public.whisper_messages;
drop function if exists public.whisper_messages_somente_is_read();
drop policy if exists "Users can mark own whisper messages as read" on public.whisper_messages;
revoke update (is_read) on public.whisper_messages from authenticated;
grant update on public.whisper_messages to authenticated;

do $prova_rollback$
declare
  v_pol int;
  v_tabela boolean;
begin
  select count(*) into v_pol from pg_policies
   where schemaname = 'public' and tablename = 'whisper_messages' and cmd = 'UPDATE';
  select has_table_privilege('authenticated', 'public.whisper_messages', 'UPDATE') into v_tabela;
  raise notice 'BLOCO C (rollback aplicado): policies de UPDATE = % ; UPDATE de tabela p/ authenticated = %', v_pol, v_tabela;
  if v_pol <> 0 or not v_tabela then
    raise exception 'FALHA: o rollback nao devolveu o estado anterior (policies=%, update_de_tabela=%)', v_pol, v_tabela;
  end if;
end
$prova_rollback$;

rollback to savepoint pre_rollback;

-- ---------------------------------------------------------------------------
-- Estado final: cada linha, os privilegios e os objetos, lidos como `postgres`.
-- ---------------------------------------------------------------------------
do $prova$
declare
  v_d1 record;
  v_d1_depois record;
  v_d2 boolean;
  v_d3 boolean;
  v_d4 boolean;
  v_pol int;
  v_trg int;
  v_tabela boolean;
  v_col_is_read boolean;
  v_col_content boolean;
  v_col_sender boolean;
begin
  select id, contact_id, sender_id, target_agent_id, content, is_read into v_d1
    from public.whisper_messages where id = 'ddddddd1-0000-0000-0000-000000000001';
  select is_read into v_d2 from public.whisper_messages where id = 'ddddddd2-0000-0000-0000-000000000002';
  select is_read into v_d3 from public.whisper_messages where id = 'ddddddd3-0000-0000-0000-000000000003';
  select is_read into v_d4 from public.whisper_messages where id = 'ddddddd4-0000-0000-0000-000000000004';

  select count(*) into v_pol from pg_policies
   where schemaname = 'public' and tablename = 'whisper_messages' and cmd = 'UPDATE';
  select count(*) into v_trg from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
   where c.relname = 'whisper_messages' and t.tgname = 'whisper_messages_somente_is_read' and not t.tgisinternal;

  select has_table_privilege('authenticated', 'public.whisper_messages', 'UPDATE') into v_tabela;
  select has_column_privilege('authenticated', 'public.whisper_messages', 'is_read', 'UPDATE') into v_col_is_read;
  select has_column_privilege('authenticated', 'public.whisper_messages', 'content', 'UPDATE') into v_col_content;
  select has_column_privilege('authenticated', 'public.whisper_messages', 'sender_id', 'UPDATE') into v_col_sender;

  if v_d1.is_read is not true then
    raise exception 'FALHA: o destinatario nao conseguiu marcar d1 como lido (is_read=%)', v_d1.is_read;
  end if;
  if v_d2 is not false then
    raise exception 'FALHA: o sussurro d2 (de outro destinatario) foi marcado como lido';
  end if;
  if v_d3 is not false then
    raise exception 'FALHA: o sussurro d3 (escrito pelo proprio agente) foi marcado como lido';
  end if;
  if v_d4 is not true then
    raise exception 'FALHA: d4 (ja lido, fora do filtro) mudou de estado';
  end if;
  if v_d1.content <> 'fixt sussurro p/ A'
     or v_d1.sender_id <> 'aaaaaaa1-0000-0000-0000-000000000001'
     or v_d1.target_agent_id <> 'aaaaaaa3-0000-0000-0000-000000000003' then
    raise exception 'FALHA: a linha d1 mudou (conteudo/remetente/destino) — esperado intacta';
  end if;
  if v_pol <> 1 or v_trg <> 1 then
    raise exception 'FALHA: esperava 1 policy de UPDATE e 1 gatilho, achei % e %', v_pol, v_trg;
  end if;
  if v_tabela then
    raise exception 'FALHA: authenticated ainda tem UPDATE de TABELA em whisper_messages (devia ser so a coluna is_read)';
  end if;
  if not v_col_is_read or v_col_content or v_col_sender then
    raise exception 'FALHA: privilegio de coluna errado (is_read=%, content=%, sender_id=%)', v_col_is_read, v_col_content, v_col_sender;
  end if;
end
$prova$;

\echo '-- resultado (is_read por sussurro): d1 (destino A) true; d2, d3 false; d4 true --'
select id, target_agent_id, is_read from public.whisper_messages order by id;
\echo 'OK: prova da leitura de sussurro (policy + gatilho) passou'

rollback;
