-- Teste SQL das RPCs de agregacao de fila (R2-QUE-005/006/007/008):
--   public.queue_comparison(timestamptz, timestamptz)
--   public.queue_analytics_series(uuid, timestamptz, timestamptz)
--   public.queue_waiting_counts()
--   public.queue_contact_message_stats(uuid[])
--
-- O que prova (o contrato que os hooks de fila passam a consumir):
--   T1  SEM TETO SILENCIOSO: com 1204 contatos e 1502 mensagens na fila A (bem acima
--       dos 1000 linhas que o PostgREST cortava), a contagem devolvida e' a real;
--   T2  SEM TETO SILENCIOSO na espera: queue_waiting_counts e' uma consulta so' e
--       devolve o numero real de aguardando por fila;
--   T3  VISIBILIDADE (o ponto que o cartao marca "nao vazio"): o agente de outra fila
--       e o usuario sem nenhuma fila NAO enxergam os numeros da fila A (zero), e o
--       admin enxerga os numeros reais das duas filas;
--   T4  ACL: anon (e PUBLIC) sem EXECUTE, authenticated e service_role com EXECUTE, e
--       sem sessao (auth.uid() nulo) as 4 RPCs devolvem vazio -- nunca dado;
--   T5  PERIODO COERENTE na comparacao: contato criado fora do periodo e mensagem
--       criada fora do periodo nao entram, e avgMessagesPerContact divide mensagens do
--       periodo por contatos do periodo (nao mistura base historica com janela);
--   T6  "aguardando" e' o mesmo vocabulario do cliente: sem responsavel, nao soft-
--       deletado e ainda nao encerrado (resolved/archived fora), rota de outro agente
--       respeitada, e contato soft-deletado nunca conta;
--   T7  SERIE DIARIA: TODOS os dias do periodo voltam, preenchidos com zero, no fuso
--       America/Sao_Paulo; p_from/p_to nulos = 30 dias; janela limitada a 366 dias com
--       o periodo efetivo devolvido em from/to (nunca truncado em silencio);
--   T8  CONTAGEM + ULTIMA MENSAGEM por contato numa consulta so', com desempate
--       deterministico por id no mesmo carimbo, contato sem mensagem devolvendo 0/NULL
--       e contato NAO visivel nem aparecendo (sem oraculo por UUID);
--   T9  ENTRADA INVALIDA: lista vazia/NULL e ID inexistente devolvem zero linha; fila
--       inexistente devolve o esqueleto do periodo zerado (nao e' erro, nao vaza dado);
--       periodo invertido devolve zero dia.
--
-- COMO RODAR (banco LOCAL da tarefa, nunca produção):
--   zapp-db-local psql . <conjunto> -v ON_ERROR_STOP=1 < supabase/tests/rpcs_agregacao_filas.sql
--
-- Cria dados SINTÉTICOS (usuarios, perfis, filas, contatos e mensagens) e desfaz tudo
-- no ROLLBACK final: nao sobra linha no banco. Sem EXCEPTION = suite verde.
BEGIN;

DO $rpcs_agregacao_filas$
DECLARE
  -- usuarios/perfis sinteticos
  v_user_a        uuid := '11111111-1111-1111-1111-1111111111a1';  -- agente da fila A
  v_user_b        uuid := '11111111-1111-1111-1111-1111111111b2';  -- agente da fila B
  v_user_c        uuid := '11111111-1111-1111-1111-1111111111c3';  -- sem fila nenhuma
  v_user_d        uuid := '11111111-1111-1111-1111-1111111111d4';  -- admin
  v_profile_a     uuid;
  v_profile_b     uuid;
  v_profile_c     uuid;
  v_profile_d     uuid;
  v_queue_a       uuid := '55555555-5555-5555-5555-5555555555a1';
  v_queue_b       uuid := '55555555-5555-5555-5555-5555555555b2';
  v_queue_i       uuid := '55555555-5555-5555-5555-5555555555c3';  -- inativa
  v_c_wait_1      uuid := '33333333-3333-3333-3333-3333333333a1';
  v_c_wait_2      uuid := '33333333-3333-3333-3333-3333333333a2';
  v_c_assigned    uuid := '33333333-3333-3333-3333-3333333333a3';
  v_c_resolvido   uuid := '33333333-3333-3333-3333-3333333333a4';  -- sem responsavel, encerrado
  v_c_fora        uuid := '33333333-3333-3333-3333-3333333333a5';  -- criado fora do periodo
  v_c_apagado     uuid := '33333333-3333-3333-3333-3333333333a6';  -- soft-deletado
  v_c_do_b        uuid := '33333333-3333-3333-3333-3333333333b1';  -- fila B (nao visivel a A)
  v_msg_tie_1     uuid := '44444444-4444-4444-4444-444444444491';
  v_msg_tie_2     uuid := '44444444-4444-4444-4444-444444444492';
  v_bulk          int  := 1200;  -- contatos em lote na fila A (> 1000)
  v_msg_bulk      int  := 1500;  -- mensagens em lote na fila A (> 1000)
  v_t_base        timestamptz := '2026-10-15T12:00:00Z';            -- 09:00 em Sao Paulo
  v_p_from        timestamptz := '2026-10-15T00:00:00-03:00';
  v_p_to          timestamptz := '2026-10-15T23:59:59-03:00';
  -- esperados da fila A (calculados a partir dos lotes, para nao virar numero magico)
  v_total_a       bigint := v_bulk + 4;   -- lote + wait_1 + wait_2 + assigned + resolvido
  v_atribuidos_a  bigint := v_bulk + 1;
  v_aguardando_a  bigint := 2;
  v_msgs_a        bigint := v_msg_bulk + 2;
  v_serie         jsonb;
  v_cmp           jsonb;
  v_dias          jsonb;
  v_valor         bigint;
  v_num           numeric;
  v_ultima_id     uuid;
  v_ultima_ts     timestamptz;
  v_linhas        int;
  v_linhas2       int;
  v_barrado       boolean;
  v_rec           record;
  v_ok            int := 0;
BEGIN
  -- ---------------------------------------------------------------- dados
  -- auth.users e' a unica tabela fora do escopo do cartao; nela o gatilho handle_new_user()
  -- (que escreve em profiles por caminho proprio) e' desligado so' para montar a fixture
  -- sintetica — sem isso o insert nao passa. As fixtures vivem dentro do BEGIN/ROLLBACK.
  -- A montagem inteira roda com replicacao desligada: os gatilhos de dominio (updated_at,
  -- gamificacao, auditoria) nao fazem parte do que este cartao prova e nenhum deles e'
  -- exercitado pelas RPCs (todas STABLE, so' leitura). Volta a 'origin' antes das assercoes.
  SET LOCAL session_replication_role = replica;
  INSERT INTO auth.users (id, email) VALUES
    (v_user_a, 'filas-a@local.test'),
    (v_user_b, 'filas-b@local.test'),
    (v_user_c, 'filas-c@local.test'),
    (v_user_d, 'filas-d@local.test');

  INSERT INTO public.profiles (user_id, name) VALUES
    (v_user_a, 'Agente A (sintetico)'),
    (v_user_b, 'Agente B (sintetico)'),
    (v_user_c, 'Agente C sem fila (sintetico)'),
    (v_user_d, 'Admin D (sintetico)')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;

  SELECT id INTO v_profile_a FROM public.profiles WHERE user_id = v_user_a;
  SELECT id INTO v_profile_b FROM public.profiles WHERE user_id = v_user_b;
  SELECT id INTO v_profile_c FROM public.profiles WHERE user_id = v_user_c;
  SELECT id INTO v_profile_d FROM public.profiles WHERE user_id = v_user_d;
  IF v_profile_a IS NULL OR v_profile_b IS NULL OR v_profile_c IS NULL OR v_profile_d IS NULL THEN
    RAISE EXCEPTION 'fixture invalida: perfil sintetico nao encontrado';
  END IF;

  -- D e' admin (ramo is_admin_or_supervisor de can_edit_contact)
  INSERT INTO public.user_roles (id, user_id, role)
  VALUES (gen_random_uuid(), v_user_d, 'admin');

  INSERT INTO public.queues (id, name, color, is_active, priority) VALUES
    (v_queue_a, 'Fila A (sintetica)', '#123456', true,  10),
    (v_queue_b, 'Fila B (sintetica)', '#654321', true,   5),
    (v_queue_i, 'Fila inativa',       '#999999', false,  1);

  -- A so' e' membro ATIVO da fila A; a segunda linha (inativa) prova que a contagem de
  -- atendentes ignora membro inativo.
  INSERT INTO public.queue_members (id, queue_id, profile_id, is_active) VALUES
    (gen_random_uuid(), v_queue_a, v_profile_a, true),
    (gen_random_uuid(), v_queue_a, v_profile_b, false),
    (gen_random_uuid(), v_queue_b, v_profile_b, true);

  INSERT INTO public.contacts
    (id, name, phone, assigned_to, queue_id, conversation_status, conversation_status_changed_at, created_at)
  VALUES
    (v_c_wait_1,    'Aguardando 1',      '5599000000901', NULL,         v_queue_a, 'open',     NULL,    v_t_base),
    (v_c_wait_2,    'Aguardando 2',      '5599000000902', NULL,         v_queue_a, 'open',     NULL,    v_t_base),
    (v_c_assigned,  'Atribuido',         '5599000000903', v_profile_a,  v_queue_a, 'open',     NULL,    v_t_base),
    (v_c_resolvido, 'Encerrado sem dono', '5599000000904', NULL,        v_queue_a, 'resolved', v_t_base, v_t_base),
    (v_c_fora,      'Criado fora',       '5599000000905', v_profile_a,  v_queue_a, 'open',     NULL,    '2026-10-01T12:00:00Z'),
    (v_c_apagado,   'Soft deletado',     '5599000000906', NULL,         v_queue_a, 'open',     NULL,    v_t_base),
    (v_c_do_b,      'Da fila B',         '5599000000907', v_profile_b,  v_queue_b, 'open',     NULL,    v_t_base);

  UPDATE public.contacts SET deleted_at = v_t_base WHERE id = v_c_apagado;

  -- Lote na fila A: 1200 contatos atribuidos a A e ja encerrados (o teto de 1000 do
  -- PostgREST cortava exatamente aqui).
  INSERT INTO public.contacts
    (id, name, phone, assigned_to, queue_id, conversation_status, conversation_status_changed_at, created_at)
  SELECT gen_random_uuid(), 'Lote ' || g, '5511' || lpad(g::text, 9, '0'),
         v_profile_a, v_queue_a, 'resolved', v_t_base, v_t_base
  FROM generate_series(1, v_bulk) g;

  -- Fila B: aguardando (todos sem responsavel, ativos e vivos) = 3.
  INSERT INTO public.contacts
    (id, name, phone, queue_id, conversation_status, created_at)
  SELECT gen_random_uuid(), 'B aguardando ' || g, '5512' || lpad(g::text, 9, '0'),
         v_queue_b, 'open', v_t_base
  FROM generate_series(1, 3) g;

  -- Mensagens da fila A no periodo: 1500 no contato atribuido + 2 empatadas no aguardando 1.
  INSERT INTO public.messages (id, contact_id, sender, content, message_type, created_at)
  SELECT gen_random_uuid(), v_c_assigned, 'contact', 'lote ' || g, 'text',
         v_t_base - (g || ' seconds')::interval
  FROM generate_series(1, v_msg_bulk) g;

  INSERT INTO public.messages (id, contact_id, sender, content, message_type, created_at) VALUES
    (v_msg_tie_1, v_c_wait_1, 'contact', 'empate 1', 'text', v_t_base),
    (v_msg_tie_2, v_c_wait_1, 'contact', 'empate 2', 'text', v_t_base);

  -- Fora do periodo (nao pode entrar em nenhuma contagem de periodo).
  INSERT INTO public.messages (id, contact_id, sender, content, message_type, created_at)
  VALUES (gen_random_uuid(), v_c_assigned, 'contact', 'fora do periodo', 'text', '2026-10-01T12:00:00Z');

  -- Mensagem da fila B (nunca pode aparecer para A).
  INSERT INTO public.messages (id, contact_id, sender, content, message_type, created_at)
  VALUES (gen_random_uuid(), v_c_do_b, 'contact', 'da fila B', 'text', v_t_base);

  IF v_msg_tie_1 >= v_msg_tie_2 THEN
    RAISE EXCEPTION 'fixture invalida: id de tie_1 (%) deveria ser menor que tie_2 (%)', v_msg_tie_1, v_msg_tie_2;
  END IF;

  SET LOCAL session_replication_role = origin;

  -- ================================================================ T1/T5/T6 (comparacao)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);

  SELECT (elem->>'totalContacts')::bigint INTO v_valor
   FROM jsonb_array_elements(public.queue_comparison(v_p_from, v_p_to)) elem
   WHERE elem->>'id' = v_queue_a::text;
  IF v_valor <> v_total_a THEN
    RAISE EXCEPTION 'T1 FALHOU: totalContacts da fila A = %, esperado % (era aqui que o teto de 1000 cortava)', v_valor, v_total_a;
  END IF;
  SELECT (elem->>'assignedContacts')::bigint INTO v_valor
   FROM jsonb_array_elements(public.queue_comparison(v_p_from, v_p_to)) elem
   WHERE elem->>'id' = v_queue_a::text;
  IF v_valor <> v_atribuidos_a THEN
    RAISE EXCEPTION 'T5 FALHOU: assignedContacts da fila A = %, esperado %', v_valor, v_atribuidos_a;
  END IF;
  SELECT (elem->>'waitingContacts')::bigint INTO v_valor
   FROM jsonb_array_elements(public.queue_comparison(v_p_from, v_p_to)) elem
   WHERE elem->>'id' = v_queue_a::text;
  IF v_valor <> v_aguardando_a THEN
    RAISE EXCEPTION 'T6 FALHOU: waitingContacts da fila A = %, esperado % (resolved sem dono nao conta)', v_valor, v_aguardando_a;
  END IF;
  SELECT (elem->>'totalMessages')::bigint INTO v_valor
   FROM jsonb_array_elements(public.queue_comparison(v_p_from, v_p_to)) elem
   WHERE elem->>'id' = v_queue_a::text;
  IF v_valor <> v_msgs_a THEN
    RAISE EXCEPTION 'T1/T5 FALHOU: totalMessages da fila A = %, esperado % (fora do periodo nao conta; teto de 1000 nao corta)', v_valor, v_msgs_a;
  END IF;
  -- media = mensagens do periodo / contatos do periodo (1502 / 1204 = 1.247... -> 1.2)
  SELECT (elem->>'avgMessagesPerContact')::numeric INTO v_num
   FROM jsonb_array_elements(public.queue_comparison(v_p_from, v_p_to)) elem
   WHERE elem->>'id' = v_queue_a::text;
  IF v_num <> round(v_msgs_a::numeric / v_total_a, 1) THEN
    RAISE EXCEPTION 'T5 FALHOU: avgMessagesPerContact = %, esperado % (periodo misturado)',
      v_num, round(v_msgs_a::numeric / v_total_a, 1);
  END IF;
  -- atendentes: 1 membro ativo (membro inativo de B na mesma fila nao conta)
  SELECT (elem->>'agentsCount')::bigint INTO v_valor
   FROM jsonb_array_elements(public.queue_comparison(v_p_from, v_p_to)) elem
   WHERE elem->>'id' = v_queue_a::text;
  IF v_valor <> 1 THEN
    RAISE EXCEPTION 'T6 FALHOU: agentsCount da fila A = %, esperado 1', v_valor;
  END IF;
  -- contato soft-deletado nao entra em nenhuma metrica: a fila A tem 6 contatos vivos
  -- (2 aguardando + 1 atribuido + 1 resolvido + 1 fora do periodo + 1200 do lote).
  SELECT count(*)::bigint INTO v_valor FROM public.contacts
   WHERE queue_id = v_queue_a AND deleted_at IS NULL;
  IF v_valor <> v_total_a + 1 THEN  -- +1 = o contato criado fora do periodo
    RAISE EXCEPTION 'T6 FALHOU: fixture inconsistente: % contatos vivos na fila A', v_valor;
  END IF;
  -- fila inativa nao entra na comparacao
  SELECT count(*) INTO v_linhas
   FROM jsonb_array_elements(public.queue_comparison(v_p_from, v_p_to)) elem
   WHERE elem->>'id' = v_queue_i::text;
  IF v_linhas <> 0 THEN
    RAISE EXCEPTION 'T5 FALHOU: fila inativa apareceu na comparacao';
  END IF;
  v_ok := v_ok + 1;

  -- ================================================================ T2 (espera por fila)
  SELECT (elem->>'waiting')::bigint INTO v_valor
   FROM jsonb_array_elements(public.queue_waiting_counts()) elem
   WHERE elem->>'queueId' = v_queue_a::text;
  IF v_valor <> v_aguardando_a THEN
    RAISE EXCEPTION 'T2 FALHOU: espera da fila A = %, esperado %', v_valor, v_aguardando_a;
  END IF;
  SELECT (elem->>'waiting')::bigint INTO v_valor
   FROM jsonb_array_elements(public.queue_waiting_counts()) elem
   WHERE elem->>'queueId' = v_queue_b::text;
  IF v_valor <> 0 THEN
    RAISE EXCEPTION 'T3 FALHOU: agente da fila A enxergou a espera da fila B (= %)', v_valor;
  END IF;
  SELECT count(*) INTO v_linhas
   FROM jsonb_array_elements(public.queue_waiting_counts()) elem
   WHERE elem->>'queueId' = v_queue_i::text;
  IF v_linhas <> 0 THEN
    RAISE EXCEPTION 'T2 FALHOU: fila inativa apareceu na espera';
  END IF;
  v_ok := v_ok + 1;

  -- ================================================================ T7 (serie diaria)
  v_serie := public.queue_analytics_series(v_queue_a,
    '2026-10-13T00:00:00-03:00', '2026-10-15T23:59:59-03:00');
  IF v_serie->>'from' <> '2026-10-13' OR v_serie->>'to' <> '2026-10-15' THEN
    RAISE EXCEPTION 'T7 FALHOU: periodo efetivo = %..%', v_serie->>'from', v_serie->>'to';
  END IF;
  v_dias := v_serie->'days';
  IF jsonb_array_length(v_dias) <> 3 THEN
    RAISE EXCEPTION 'T7 FALHOU: esperava 3 dias (todos os dias do periodo) e veio %',
      jsonb_array_length(v_dias);
  END IF;
  -- dias sem dado voltam com zero preenchido
  FOR v_rec IN SELECT value FROM jsonb_array_elements(v_dias) AS e(value) LOOP
    IF v_rec.value->>'date' IN ('2026-10-13', '2026-10-14')
       AND ((v_rec.value->>'novos')::int <> 0
            OR (v_rec.value->>'mensagens')::int <> 0
            OR (v_rec.value->>'resolvidos')::int <> 0) THEN
      RAISE EXCEPTION 'T7 FALHOU: dia % deveria vir zerado e veio %', v_rec.value->>'date', v_rec.value;
    END IF;
  END LOOP;
  IF (v_dias->2->>'date') <> '2026-10-15'
     OR (v_dias->2->>'novos')::bigint <> v_total_a
     OR (v_dias->2->>'mensagens')::bigint <> v_msgs_a
     OR (v_dias->2->>'resolvidos')::bigint <> v_bulk + 1 THEN
    RAISE EXCEPTION 'T7 FALHOU: dia com dado veio %', v_dias->2;
  END IF;
  -- periodo nulo = 30 dias terminando hoje (fuso America/Sao_Paulo)
  v_serie := public.queue_analytics_series(v_queue_a, NULL, NULL);
  IF jsonb_array_length(v_serie->'days') <> 30 OR v_serie->>'to' <> '2026-10-15' THEN
    RAISE EXCEPTION 'T7 FALHOU: periodo nulo = % dias ate % (esperado 30 ate 2026-10-15)',
      jsonb_array_length(v_serie->'days'), v_serie->>'to';
  END IF;
  -- janela limitada a 366 dias, com o periodo efetivo declarado (nunca silencioso)
  v_serie := public.queue_analytics_series(v_queue_a, '2020-01-01T00:00:00Z', '2026-10-15T23:59:59-03:00');
  IF v_serie->>'from' <> '2025-10-15' OR jsonb_array_length(v_serie->'days') <> 366 THEN
    RAISE EXCEPTION 'T7 FALHOU: janela longa = %..% com % dias (esperado 2025-10-15..2026-10-15 / 366)',
      v_serie->>'from', v_serie->>'to', jsonb_array_length(v_serie->'days');
  END IF;
  v_ok := v_ok + 1;

  -- ================================================================ T8 (contagem + ultima)
  SELECT count(*) INTO v_linhas
    FROM public.queue_contact_message_stats(ARRAY[v_c_assigned, v_c_wait_1, v_c_resolvido, v_c_do_b, v_c_apagado]);
  IF v_linhas <> 3 THEN
    RAISE EXCEPTION 'T8 FALHOU: esperava 3 linhas (visiveis) e veio % (contato de outra fila/soft-deletado nao aparecem)', v_linhas;
  END IF;
  SELECT messages_count INTO v_valor
    FROM public.queue_contact_message_stats(ARRAY[v_c_assigned]);
  IF v_valor <> v_msg_bulk + 1 THEN
    RAISE EXCEPTION 'T8 FALHOU: mensagens do contato atribuido = %, esperado % (a RPC nao tem periodo e nao corta em 1000)',
      v_valor, v_msg_bulk + 1;
  END IF;
  SELECT messages_count, last_message_id INTO v_valor, v_ultima_id
    FROM public.queue_contact_message_stats(ARRAY[v_c_wait_1]);
  IF v_valor <> 2 OR v_ultima_id <> v_msg_tie_2 THEN
    RAISE EXCEPTION 'T8 FALHOU: esperava 2 mensagens e ultima = % (desempate por id) e veio % / %',
      v_msg_tie_2, v_valor, v_ultima_id;
  END IF;
  SELECT messages_count, last_message_at INTO v_valor, v_ultima_ts
    FROM public.queue_contact_message_stats(ARRAY[v_c_resolvido]);
  IF v_valor <> 0 OR v_ultima_ts IS NOT NULL THEN
    RAISE EXCEPTION 'T8 FALHOU: contato visivel sem mensagem deveria vir 0/NULL e veio % / %', v_valor, v_ultima_ts;
  END IF;
  v_ok := v_ok + 1;

  -- ================================================================ T3 (outro agente / sem fila / admin)
  -- Agente B (fila B): a fila A aparece com zero em tudo.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b)::text, true);
  SELECT (elem->>'totalContacts')::bigint, (elem->>'totalMessages')::bigint, (elem->>'waitingContacts')::bigint
    INTO v_valor, v_linhas2, v_linhas
   FROM jsonb_array_elements(public.queue_comparison(v_p_from, v_p_to)) elem
   WHERE elem->>'id' = v_queue_a::text;
  IF v_valor <> 0 OR v_linhas2 <> 0 OR v_linhas <> 0 THEN
    RAISE EXCEPTION 'T3 FALHOU: agente da fila B viu a fila A (% contatos / % msgs / % aguardando)',
      v_valor, v_linhas2, v_linhas;
  END IF;
  SELECT (elem->>'waiting')::bigint INTO v_valor
   FROM jsonb_array_elements(public.queue_waiting_counts()) elem
   WHERE elem->>'queueId' = v_queue_a::text;
  IF v_valor <> 0 THEN
    RAISE EXCEPTION 'T3 FALHOU: agente da fila B viu % aguardando na fila A', v_valor;
  END IF;
  SELECT count(*) INTO v_linhas FROM public.queue_contact_message_stats(ARRAY[v_c_assigned, v_c_wait_1]);
  IF v_linhas <> 0 THEN
    RAISE EXCEPTION 'T3 FALHOU: agente da fila B recebeu % linha(s) de contato da fila A', v_linhas;
  END IF;
  -- Serie da fila A para B: todos os dias zerados (estrutura existe, dado nao vaza).
  v_serie := public.queue_analytics_series(v_queue_a, '2026-10-13T00:00:00-03:00', '2026-10-15T23:59:59-03:00');
  IF jsonb_array_length(v_serie->'days') <> 3 THEN
    RAISE EXCEPTION 'T3 FALHOU: serie da fila A para B veio com % dia(s)', jsonb_array_length(v_serie->'days');
  END IF;
  FOR v_rec IN SELECT value FROM jsonb_array_elements(v_serie->'days') AS e(value) LOOP
    IF (v_rec.value->>'novos')::int <> 0 OR (v_rec.value->>'mensagens')::int <> 0
       OR (v_rec.value->>'resolvidos')::int <> 0 THEN
      RAISE EXCEPTION 'T3 FALHOU: serie da fila A vazou para B em %', v_rec.value;
    END IF;
  END LOOP;
  v_ok := v_ok + 1;

  -- Agente C (sem fila nenhuma e sem contato atribuido): zero em tudo, nas duas filas.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_c)::text, true);
  FOR v_rec IN SELECT value FROM jsonb_array_elements(public.queue_comparison(v_p_from, v_p_to)) AS e(value) LOOP
    IF (v_rec.value->>'totalContacts')::int <> 0 OR (v_rec.value->>'totalMessages')::int <> 0
       OR (v_rec.value->>'waitingContacts')::int <> 0 OR (v_rec.value->>'agentsCount')::int <> 0 THEN
      RAISE EXCEPTION 'T3 FALHOU: usuario sem fila viu %', v_rec.value;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_linhas
   FROM jsonb_array_elements(public.queue_waiting_counts()) elem
   WHERE (elem->>'waiting')::int <> 0;
  IF v_linhas <> 0 THEN
    RAISE EXCEPTION 'T3 FALHOU: usuario sem fila viu % fila(s) com espera', v_linhas;
  END IF;
  v_ok := v_ok + 1;

  -- Admin D: numeros reais das duas filas.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_d)::text, true);
  SELECT (elem->>'totalContacts')::bigint, (elem->>'totalMessages')::bigint
    INTO v_valor, v_linhas2
   FROM jsonb_array_elements(public.queue_comparison(v_p_from, v_p_to)) elem
   WHERE elem->>'id' = v_queue_a::text;
  IF v_valor <> v_total_a OR v_linhas2 <> v_msgs_a THEN
    RAISE EXCEPTION 'T3 FALHOU: admin viu a fila A como % contatos / % msgs', v_valor, v_linhas2;
  END IF;
  SELECT (elem->>'waiting')::bigint INTO v_valor
   FROM jsonb_array_elements(public.queue_waiting_counts()) elem
   WHERE elem->>'queueId' = v_queue_b::text;
  IF v_valor <> 3 THEN
    RAISE EXCEPTION 'T3 FALHOU: admin viu a fila B com % aguardando (esperado 3)', v_valor;
  END IF;
  v_ok := v_ok + 1;

  -- ================================================================ T4 (ACL)
  -- Estrutura: exatamente 4 assinaturas novas em public, todas SECURITY DEFINER com
  -- search_path fixo (overload criado por engano nasceria com EXECUTE para PUBLIC).
  SELECT count(*) INTO v_linhas
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname IN ('queue_comparison', 'queue_analytics_series',
                     'queue_waiting_counts', 'queue_contact_message_stats');
  IF v_linhas <> 4 THEN
    RAISE EXCEPTION 'T4 FALHOU: esperava 4 assinaturas e ha % (overload)', v_linhas;
  END IF;
  SELECT count(*) INTO v_linhas
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname IN ('queue_comparison', 'queue_analytics_series',
                     'queue_waiting_counts', 'queue_contact_message_stats')
     AND prosecdef
     AND proconfig IS NOT NULL;
  IF v_linhas <> 4 THEN
    RAISE EXCEPTION 'T4 FALHOU: % de 4 funcao(oes) sem SECURITY DEFINER ou sem search_path fixo', 4 - v_linhas;
  END IF;
  IF has_function_privilege('anon', 'public.queue_comparison(timestamp with time zone, timestamp with time zone)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.queue_analytics_series(uuid, timestamp with time zone, timestamp with time zone)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.queue_waiting_counts()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.queue_contact_message_stats(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'T4 FALHOU: anon com EXECUTE em RPC de agregacao de fila';
  END IF;
  IF has_function_privilege('authenticated', 'public.queue_comparison(timestamp with time zone, timestamp with time zone)', 'EXECUTE') = false
     OR has_function_privilege('authenticated', 'public.queue_analytics_series(uuid, timestamp with time zone, timestamp with time zone)', 'EXECUTE') = false
     OR has_function_privilege('authenticated', 'public.queue_waiting_counts()', 'EXECUTE') = false
     OR has_function_privilege('authenticated', 'public.queue_contact_message_stats(uuid[])', 'EXECUTE') = false THEN
    RAISE EXCEPTION 'T4 FALHOU: authenticated SEM EXECUTE em alguma RPC';
  END IF;
  IF has_function_privilege('service_role', 'public.queue_waiting_counts()', 'EXECUTE') = false THEN
    RAISE EXCEPTION 'T4 FALHOU: service_role SEM EXECUTE em queue_waiting_counts';
  END IF;

  -- anon e' barrado de verdade (insufficient_privilege), nao so' no catalogo
  PERFORM set_config('role', 'anon', true);
  v_barrado := false;
  BEGIN
    PERFORM 1 FROM public.queue_waiting_counts();
  EXCEPTION WHEN insufficient_privilege THEN
    v_barrado := true;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_barrado = false THEN
    RAISE EXCEPTION 'T4 FALHOU: anon conseguiu chamar queue_waiting_counts';
  END IF;

  -- authenticated sem sessao (auth.uid() nulo) chama, mas nao recebe dado nenhum
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM set_config('role', 'authenticated', true);
  IF public.queue_comparison(v_p_from, v_p_to) <> '[]'::jsonb THEN
    RAISE EXCEPTION 'T4 FALHOU: sem sessao, queue_comparison devolveu dado';
  END IF;
  IF public.queue_waiting_counts() <> '[]'::jsonb THEN
    RAISE EXCEPTION 'T4 FALHOU: sem sessao, queue_waiting_counts devolveu dado';
  END IF;
  IF public.queue_analytics_series(v_queue_a, NULL, NULL)->'days' <> '[]'::jsonb THEN
    RAISE EXCEPTION 'T4 FALHOU: sem sessao, queue_analytics_series devolveu dias';
  END IF;
  PERFORM set_config('role', 'none', true);
  v_ok := v_ok + 1;

  -- ================================================================ T9 (entrada invalida)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);
  SELECT count(*) INTO v_linhas FROM public.queue_contact_message_stats(ARRAY[]::uuid[]);
  IF v_linhas <> 0 THEN
    RAISE EXCEPTION 'T9 FALHOU: lista vazia devolveu % linha(s)', v_linhas;
  END IF;
  SELECT count(*) INTO v_linhas FROM public.queue_contact_message_stats(NULL::uuid[]);
  IF v_linhas <> 0 THEN
    RAISE EXCEPTION 'T9 FALHOU: lista NULL devolveu % linha(s)', v_linhas;
  END IF;
  SELECT count(*) INTO v_linhas
    FROM public.queue_contact_message_stats(ARRAY[NULL::uuid, '00000000-0000-0000-0000-000000000000'::uuid]);
  IF v_linhas <> 0 THEN
    RAISE EXCEPTION 'T9 FALHOU: fila inexistente/ID inexistente devolveu % linha(s)', v_linhas;
  END IF;
  -- fila inexistente NAO e' erro: volta o esqueleto do periodo (mesma janela padrao de 30
  -- dias) zerado, sem vazar nada e sem quebrar a tela.
  v_serie := public.queue_analytics_series('00000000-0000-0000-0000-000000000000'::uuid, NULL, NULL);
  IF jsonb_array_length(v_serie->'days') <> 30 OR v_serie->>'from' IS NULL OR v_serie->>'to' IS NULL THEN
    RAISE EXCEPTION 'T9 FALHOU: fila inexistente devolveu % dia(s), from=% to=% (esperado esqueleto de 30 dias)',
      jsonb_array_length(v_serie->'days'), v_serie->>'from', v_serie->>'to';
  END IF;
  FOR v_rec IN SELECT value FROM jsonb_array_elements(v_serie->'days') AS e(value) LOOP
    IF (v_rec.value->>'novos')::int <> 0 OR (v_rec.value->>'mensagens')::int <> 0
       OR (v_rec.value->>'resolvidos')::int <> 0 THEN
      RAISE EXCEPTION 'T9 FALHOU: fila inexistente trouxe dado em %', v_rec.value;
    END IF;
  END LOOP;
  -- periodo invertido nao inventa dia nenhum
  v_serie := public.queue_analytics_series(v_queue_a, '2026-10-15T23:59:59-03:00', '2026-10-13T00:00:00-03:00');
  IF jsonb_array_length(v_serie->'days') <> 0 THEN
    RAISE EXCEPTION 'T9 FALHOU: periodo invertido devolveu % dia(s)', jsonb_array_length(v_serie->'days');
  END IF;
  v_ok := v_ok + 1;

  RAISE NOTICE 'rpcs_agregacao_filas: suite OK (T1 teto contatos, T2 espera por fila, T3 visibilidade outro agente/sem fila/admin, T4 ACL anon/authenticated/sem sessao, T5 periodo coerente, T6 aguardando/soft delete, T7 serie diaria, T8 contagem+ultima, T9 entrada invalida) — % grupo(s) verificado(s)', v_ok;
END $rpcs_agregacao_filas$;

ROLLBACK;
