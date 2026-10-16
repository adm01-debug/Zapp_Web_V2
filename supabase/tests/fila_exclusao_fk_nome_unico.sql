-- ============================================================================
-- fix(db): excluir fila sem erro de FK e sem perder conversas em silencio;
--          nome de fila unico (cartao HQ1 / t_e16586d1, workersql).
-- Origem: auditoria de paridade V3->V2 (PARTE11, 2026-10-13): "excluir uma
-- fila falha por chave estrangeira depois de qualquer transferencia para ela,
-- e as conversas em espera perdem a fila sem aviso".
--
-- O QUE PROVA (criterio de pronto do cartao):
--   T1  as FKs que apontam para public.queues tem comportamento de exclusao
--       (confdeltype): conversation_events.from_queue_id/to_queue_id e
--       channel_routing_rules.queue_id = SET NULL ('n');
--       queue_positions.queue_id (NOT NULL) = CASCADE ('c').
--       ANTES da migration as quatro sao NO ACTION ('a') -> este bloco e o
--       vermelho do cartao: `delete from public.queues` em fila com historico
--       morre em 23503.
--   T2  indice unico em lower(trim(name)) — estrutural (expression index
--       unico em public.queues) e de COMPORTAMENTO: '  hq1 ALFA  ' bate em
--       23505 contra 'HQ1 Alfa'; nome distinto continua entrando; nenhum
--       grupo duplicado sobrou.
--   T2-INV invariante pos-dedup: o tratamento de nome duplicado (renomear,
--       nunca apagar) nao afetou contatos/posicoes/eventos — contagens dos
--       fixtures intactas e zero juncoes orfas para queues.
--   T2-CONC (prova com duas sessoes reais, descrita no relato): duas sessoes
--       inserindo o mesmo nome normalizado ao mesmo tempo; a segunda
--       bloqueia ate a primeira commitar e entao falha em 23505 no indice
--       queues_name_lower_trim_uidx.
--   T3  delete_queue(fila, NULL) com conversa apontando para a fila: recusa
--       com o codigo EXATO 22023 e a mensagem 'Fila em uso' (qualquer outro
--       codigo — inclusive 42883 'funcao nao existe' — FALHA), e NAO altera
--       nada (atomicidade — fila, contatos e posicao intactos, sem linha de
--       auditoria).
--   T4  delete_queue(fila, destino) como ADMIN autenticado: reatribui as
--       conversas, muda a posicao de espera, apaga a fila, PRESERVA o evento
--       de historico (from_queue_id/to_queue_id -> NULL) e grava audit_logs.
--   T5  fila so com historico (nenhuma conversa): exclui SEM destino e o
--       evento continua vivo com as referencias nulas — o defeito exato do
--       cartao ("falha por FK depois de qualquer transferencia para ela").
--   T6  fronteira de EXECUTE: anon = 42501 (permission denied for function);
--       authenticated comum (sem admin/supervisor) = 42501 'Sem permissao';
--       service_role (Edge) = executa.
--
-- ENFORCEMENT como PAPEL REAL: as operacoes rodam com SET LOCAL ROLE
-- (authenticated / anon / service_role) + JWT sintetico em
-- request.jwt.claims — o caminho do PostgREST, nunca como postgres (que
-- ignora GRANT e RLS). O helper pg_temp.operacao confere current_user.
--
-- Roda no banco LOCAL reaproveitando as migrations REAIS (nao recria schema):
--   zapp-db-local psql . <conjunto> < supabase/tests/fila_exclusao_fk_nome_unico.sql
-- Tudo numa transacao que termina em ROLLBACK: idempotente, sem efeito
-- colateral e reaplicavel.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ── fixtures (postgres; auth.users sem os gatilhos de auth) ─────────────────
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-1111111111a1'),  -- ADMIN
  ('22222222-2222-2222-2222-2222222222b2');  -- COMUM
SET LOCAL session_replication_role = origin;

INSERT INTO public.profiles (id, user_id, name) VALUES
  ('a0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-1111111111a1', 'ADMIN HQ1'),
  ('a0000000-0000-0000-0000-0000000000b2', '22222222-2222-2222-2222-2222222222b2', 'COMUM HQ1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-1111111111a1', 'admin'),
  ('22222222-2222-2222-2222-2222222222b2', 'agent')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.queues (id, name, created_at) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'HQ1 Fila Origem',   now() - interval '3 hour'),
  ('b0000000-0000-0000-0000-000000000002', 'HQ1 Fila Destino',  now() - interval '3 hour'),
  ('b0000000-0000-0000-0000-000000000003', 'HQ1 Fila Historico',now() - interval '3 hour'),
  ('b0000000-0000-0000-0000-000000000004', 'HQ1 Fila Service',  now() - interval '3 hour')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contacts (id, name, phone, conversation_status, queue_id) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'HQ1 Contato 1', '5511900000001', 'waiting', 'b0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002', 'HQ1 Contato 2', '5511900000002', 'waiting', 'b0000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.queue_positions (id, contact_id, queue_id, position) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001', 1)
ON CONFLICT (id) DO NOTHING;

-- Historico apontando para a fila (o que fazia o DELETE morrer em 23503).
INSERT INTO public.conversation_events (id, contact_id, event_type, from_queue_id, to_queue_id, performed_by) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'queue_transfer',
   'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-0000000000a1'),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'queue_transfer',
   'b0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-0000000000a1')
ON CONFLICT (id) DO NOTHING;

-- ── helpers ────────────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'HQ1 FALHOU [%]: esperado %, obtido %', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

-- Compara por padrao (LIKE) — o texto exato do erro do Postgres muda de
-- redacao/limite sem que a defesa mude (a classe 42501 e o que importa).
CREATE FUNCTION pg_temp.espera_padrao(p_label text, p_atual text, p_padrao text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS NULL OR p_atual NOT LIKE p_padrao THEN
    RAISE EXCEPTION 'HQ1 FALHOU [%]: esperava %, obtido %', p_label, p_padrao, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

-- Devolve o VALOR (texto) da primeira coluna da consulta, nao a contagem de
-- linhas — e o que prova o retorno da RPC (contagem de conversas).
CREATE FUNCTION pg_temp.valor(p_papel text, p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v_txt text;
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_papel)::text, true);
  EXECUTE 'set local role ' || quote_ident(p_papel);
  EXECUTE p_sql INTO v_txt;
  RESET ROLE;
  RETURN coalesce(v_txt, 'NULL');
EXCEPTION WHEN others THEN
  RESET ROLE;
  RETURN 'ERRO ' || SQLSTATE || ' ' || SQLERRM;
END $h$;

-- Executa p_sql sob o PAPEL REAL (SET LOCAL ROLE) com JWT sintetico do usuario.
CREATE FUNCTION pg_temp.operacao(p_papel text, p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v_ret text; v_n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_papel)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  IF current_user <> p_papel THEN
    RAISE EXCEPTION 'HQ1 FALHOU: papel real nao aplicado (current_user=%)', current_user;
  END IF;
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_ret := 'OK ' || v_n;
  EXCEPTION WHEN OTHERS THEN
    v_ret := 'ERRO ' || SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  RETURN v_ret;
END $h$;

-- ════════════════ T1: FKs com comportamento de exclusao ════════════════
DO $t1$
DECLARE
  r record;
  v_confdel text;
  v_alvos text[][] := ARRAY[
    ARRAY['conversation_events', 'from_queue_id', 'n'],
    ARRAY['conversation_events', 'to_queue_id',   'n'],
    ARRAY['channel_routing_rules', 'queue_id',    'n'],
    ARRAY['queue_positions', 'queue_id',          'c']
  ];
  i int;
BEGIN
  FOR i IN 1..array_length(v_alvos, 1) LOOP
    SELECT c.confdeltype INTO v_confdel
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'f'
       AND t.relname = v_alvos[i][1]
       AND a.attname = v_alvos[i][2]
       AND c.confrelid = 'public.queues'::regclass;

    IF v_confdel IS NULL THEN
      RAISE EXCEPTION 'T1 FALHOU: sem FK de %.% para public.queues', v_alvos[i][1], v_alvos[i][2];
    END IF;
    IF v_confdel <> v_alvos[i][3] THEN
      RAISE EXCEPTION 'T1 FALHOU: %.% tem confdeltype=% (esperado %)',
        v_alvos[i][1], v_alvos[i][2], v_confdel, v_alvos[i][3];
    END IF;
    RAISE NOTICE 'PASS [T1 %.%] confdeltype=%', v_alvos[i][1], v_alvos[i][2], v_confdel;
  END LOOP;
END $t1$;

-- ════════════════ T2: nome de fila unico ════════════════
DO $t2$
DECLARE
  v_idx text;
  v_dups bigint;
  v_bateu boolean := false;
BEGIN
  SELECT indexname INTO v_idx
    FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'queues'
     AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%lower(%'
   LIMIT 1;

  IF v_idx IS NULL THEN
    RAISE EXCEPTION 'T2 FALHOU: public.queues sem indice UNIQUE de expressao em lower(trim(name))';
  END IF;
  RAISE NOTICE 'PASS [T2 indice] %', v_idx;

  INSERT INTO public.queues (name) VALUES ('HQ1 Alfa');
  BEGIN
    INSERT INTO public.queues (name) VALUES ('  hq1 ALFA  ');
    RAISE EXCEPTION 'T2 FALHOU: nome normalizado duplicado foi aceito';
  EXCEPTION WHEN unique_violation THEN
    v_bateu := true;
  END;
  IF NOT v_bateu THEN
    RAISE EXCEPTION 'T2 FALHOU: segunda insercao (caixa/espaco) nao bateu em 23505';
  END IF;
  RAISE NOTICE 'PASS [T2 comportamento] 2a insercao normalizada -> 23505';

  INSERT INTO public.queues (name) VALUES ('HQ1 Beta');  -- distinto continua entrando

  SELECT count(*) INTO v_dups
    FROM (SELECT lower(trim(name)) n FROM public.queues GROUP BY 1 HAVING count(*) > 1) d;
  IF v_dups <> 0 THEN
    RAISE EXCEPTION 'T2 FALHOU: % grupo(s) de nome duplicado na base', v_dups;
  END IF;
  RAISE NOTICE 'PASS [T2 invariante] 0 grupos duplicados';
END $t2$;

-- ════════════════ T2-INV: dedup/índice não afetou dependentes ════════════════
-- O passo de consolidação da migration só RENOMEIA queues (nunca apaga); se
-- ele tivesse apagado filas ou deixado referências órfãs, estas consultas
-- falham. Roda no banco com a migration aplicada (prova real, sem mock).
DO $t2inv$
DECLARE
  v_con int; v_pos int; v_ev int;
  v_orf_con int; v_orf_pos int; v_orf_ev int;
BEGIN
  SELECT count(*) INTO v_con FROM public.contacts
   WHERE id IN ('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002');
  PERFORM pg_temp.espera('T2-INV contatos intactos', v_con::text, '2');

  SELECT count(*) INTO v_pos FROM public.queue_positions
   WHERE id = 'd0000000-0000-0000-0000-000000000001';
  PERFORM pg_temp.espera('T2-INV posicao intacta', v_pos::text, '1');

  SELECT count(*) INTO v_ev FROM public.conversation_events
   WHERE id IN ('e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002');
  PERFORM pg_temp.espera('T2-INV eventos intactos', v_ev::text, '2');

  SELECT count(*) INTO v_orf_con FROM public.contacts c
    LEFT JOIN public.queues q ON q.id = c.queue_id
   WHERE c.queue_id IS NOT NULL AND q.id IS NULL;
  PERFORM pg_temp.espera('T2-INV contatos sem orfaos', v_orf_con::text, '0');

  SELECT count(*) INTO v_orf_pos FROM public.queue_positions p
    LEFT JOIN public.queues q ON q.id = p.queue_id
   WHERE q.id IS NULL;
  PERFORM pg_temp.espera('T2-INV posicoes sem orfaos', v_orf_pos::text, '0');

  SELECT count(*) INTO v_orf_ev FROM public.conversation_events e
    LEFT JOIN public.queues qf ON qf.id = e.from_queue_id
    LEFT JOIN public.queues qt ON qt.id = e.to_queue_id
   WHERE (e.from_queue_id IS NOT NULL AND qf.id IS NULL)
      OR (e.to_queue_id IS NOT NULL AND qt.id IS NULL);
  PERFORM pg_temp.espera('T2-INV eventos sem orfaos', v_orf_ev::text, '0');
END $t2inv$;

-- ════════════════ T3: sem destino e com conversa -> recusa, nada muda ════════════════
DO $t3$
DECLARE
  v_ret text;
  v_fila int; v_con int; v_pos int; v_aud int;
BEGIN
  v_ret := pg_temp.operacao('authenticated', '11111111-1111-1111-1111-1111111111a1',
    $q$select public.delete_queue('b0000000-0000-0000-0000-000000000001', null)$q$);
  -- amarracao exata: so passa com 22023 + mensagem de uso; funcao ausente
  -- (42883) ou qualquer outro codigo FALHA aqui (era left 7 = 'ERRO 22').
  PERFORM pg_temp.espera('T3 recusa 22023', left(v_ret, 10), 'ERRO 22023');
  PERFORM pg_temp.espera_padrao('T3 mensagem fila em uso', v_ret, 'ERRO 22023 %Fila em uso%');

  SELECT count(*) INTO v_fila FROM public.queues WHERE id = 'b0000000-0000-0000-0000-000000000001';
  SELECT count(*) INTO v_con  FROM public.contacts WHERE queue_id = 'b0000000-0000-0000-0000-000000000001';
  SELECT count(*) INTO v_pos  FROM public.queue_positions WHERE queue_id = 'b0000000-0000-0000-0000-000000000001';
  SELECT count(*) INTO v_aud  FROM public.audit_logs WHERE action = 'queue_delete'
     AND entity_id = 'b0000000-0000-0000-0000-000000000001';

  PERFORM pg_temp.espera('T3 fila intacta', v_fila::text, '1');
  PERFORM pg_temp.espera('T3 conversas intactas', v_con::text, '2');
  PERFORM pg_temp.espera('T3 posicao intacta', v_pos::text, '1');
  PERFORM pg_temp.espera('T3 sem rastro de auditoria', v_aud::text, '0');
END $t3$;

-- ════════════════ T4: com destino (admin autenticado) ════════════════
DO $t4$
DECLARE
  v_ret text;
  v_fila int; v_dest int; v_pos int; v_ev int; v_aud int; v_det text;
  v_from uuid; v_to uuid;
BEGIN
  v_ret := pg_temp.valor('authenticated', '11111111-1111-1111-1111-1111111111a1',
    $q$select public.delete_queue('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')::text$q$);
  -- o proprio retorno da RPC e a contagem de conversas reatribuidas
  PERFORM pg_temp.espera('T4 retorno = 2 conversas', v_ret, '2');
  SELECT count(*) INTO v_fila FROM public.queues WHERE id = 'b0000000-0000-0000-0000-000000000001';
  SELECT count(*) INTO v_dest FROM public.contacts WHERE queue_id = 'b0000000-0000-0000-0000-000000000002';
  SELECT count(*) INTO v_pos  FROM public.queue_positions WHERE queue_id = 'b0000000-0000-0000-0000-000000000002';

  PERFORM pg_temp.espera('T4 fila excluida', v_fila::text, '0');
  PERFORM pg_temp.espera('T4 conversas no destino', v_dest::text, '2');
  PERFORM pg_temp.espera('T4 posicao de espera no destino', v_pos::text, '1');

  -- historico preservado com a referencia nula (SET NULL), nunca apagado
  SELECT count(*) INTO v_ev FROM public.conversation_events
   WHERE id = 'e0000000-0000-0000-0000-000000000001';
  PERFORM pg_temp.espera('T4 evento preservado', v_ev::text, '1');
  SELECT from_queue_id, to_queue_id INTO v_from, v_to FROM public.conversation_events
   WHERE id = 'e0000000-0000-0000-0000-000000000001';
  PERFORM pg_temp.espera('T4 evento sem fila de origem', coalesce(v_from::text, 'NULL'), 'NULL');
  PERFORM pg_temp.espera('T4 evento sem fila de destino', coalesce(v_to::text, 'NULL'), 'NULL');

  -- trilha em audit_logs
  SELECT count(*) INTO v_aud FROM public.audit_logs
   WHERE action = 'queue_delete' AND entity_type = 'queue'
     AND entity_id = 'b0000000-0000-0000-0000-000000000001';
  PERFORM pg_temp.espera('T4 auditoria gravada', v_aud::text, '1');
  SELECT details->>'contacts_reassigned' INTO v_det FROM public.audit_logs
   WHERE action = 'queue_delete' AND entity_id = 'b0000000-0000-0000-0000-000000000001';
  PERFORM pg_temp.espera('T4 auditoria com contagem', v_det, '2');
END $t4$;

-- ════════════════ T5: fila so com historico -> exclui sem destino ════════════════
DO $t5$
DECLARE
  v_ret text; v_fila int; v_ev int; v_from uuid;
BEGIN
  v_ret := pg_temp.valor('authenticated', '11111111-1111-1111-1111-1111111111a1',
    $q$select public.delete_queue('b0000000-0000-0000-0000-000000000003')::text$q$);
  PERFORM pg_temp.espera('T5 exclui sem destino (retorno 0)', v_ret, '0');

  SELECT count(*) INTO v_fila FROM public.queues WHERE id = 'b0000000-0000-0000-0000-000000000003';
  SELECT count(*) INTO v_ev FROM public.conversation_events WHERE id = 'e0000000-0000-0000-0000-000000000002';
  SELECT from_queue_id INTO v_from FROM public.conversation_events WHERE id = 'e0000000-0000-0000-0000-000000000002';

  PERFORM pg_temp.espera('T5 fila excluida', v_fila::text, '0');
  PERFORM pg_temp.espera('T5 evento preservado', v_ev::text, '1');
  PERFORM pg_temp.espera('T5 evento sem fila', coalesce(v_from::text, 'NULL'), 'NULL');
END $t5$;

-- ════════════════ T6: fronteira de EXECUTE ════════════════
DO $t6$
DECLARE
  v_anon text;
  v_comum text;
  v_svc text;
BEGIN
  v_anon := pg_temp.operacao('anon', null, $q$select public.delete_queue('b0000000-0000-0000-0000-000000000004')$q$);
  PERFORM pg_temp.espera_padrao('T6 anon barrado', v_anon, 'ERRO 42501 %permission denied for function%');

  v_comum := pg_temp.operacao('authenticated', '22222222-2222-2222-2222-2222222222b2',
    $q$select public.delete_queue('b0000000-0000-0000-0000-000000000004')$q$);
  PERFORM pg_temp.espera_padrao('T6 comum barrado', v_comum, 'ERRO 42501 %Sem permissao para excluir fila%');

  -- a fila continua de pe depois das duas tentativas barradas
  PERFORM pg_temp.espera('T6 fila intacta',
    (SELECT count(*)::text FROM public.queues WHERE id = 'b0000000-0000-0000-0000-000000000004'), '1');

  v_svc := pg_temp.operacao('service_role', null, $q$select public.delete_queue('b0000000-0000-0000-0000-000000000004')$q$);
  PERFORM pg_temp.espera('T6 service_role executa', left(v_svc, 3), 'OK ');
END $t6$;

ROLLBACK;

\echo 'FILA EXCLUSAO FK NOME UNICO: OK'
