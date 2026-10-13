-- Teste SQL da RPC public.contact_response_stats (PE-22).
--
-- O que prova (o contrato que src/services/contact.service.ts#fetchStats passa a
-- consumir, substituindo 4 consultas e a leitura enviesada das 200 primeiras
-- mensagens):
--   T1  visibilidade: contato de outro atendente NÃO devolve linha, e contato
--       inexistente devolve o MESMO conjunto vazio (sem oráculo de existência);
--   T2  ACL: anon/PUBLIC sem EXECUTE (a chamada real é barrada), authenticated e
--       service_role com EXECUTE (controle positivo);
--   T3  contagens de mensagens por janela (total / recente / anterior) e a
--       variação percentual (default p_days = 30);
--   T4  TEMPO DE RESPOSTA com LEAD sobre TODO o histórico — 300 pares, acima do
--       teto de 200 do código antigo: a média (3,67) e a amostra (300) provam que
--       a leitura não para no "começo da história" (o valor antigo seria 1,00 com
--       100 pares); a MEDIANA (5,00) vem no mesmo retorno;
--   T5  contato visível SEM dado devolve UMA linha zerada (não some do painel);
--   T6  contagens de conversas por janela (conversation_sla.first_message_at) e
--       média/contagem de CSAT;
--   T7  p_days é honrado (não ignorado).
--
-- COMO RODAR (banco LOCAL da tarefa, nunca produção):
--   zapp-db-local psql . <conjunto> -v ON_ERROR_STOP=1 < supabase/tests/contact_response_stats.sql
--
-- Dados SINTÉTICOS; tudo desfeito no ROLLBACK final. Sem EXCEPTION = suíte verde.
BEGIN;

DO $contact_response_stats$
DECLARE
  v_user_a          uuid := '11111111-1111-1111-1111-1111111111a1';
  v_user_b          uuid := '11111111-1111-1111-1111-1111111111b2';
  v_profile_a       uuid;
  v_profile_b       uuid;
  v_contact_resp    uuid := '33333333-3333-3333-3333-3333333333d1';
  v_contact_janela  uuid := '33333333-3333-3333-3333-3333333333d2';
  v_contact_oculto  uuid := '33333333-3333-3333-3333-3333333333d3';
  v_contact_vazio   uuid := '33333333-3333-3333-3333-3333333333d4';
  v_inexistente     uuid := '33333333-3333-3333-3333-3333333333ef';
  v_resp_base       timestamptz := now() - interval '90 days';
  v_ok              int := 0;
  v_linhas          int;
  -- resposta (contato_resp)
  v_tot_m          bigint;
  v_rec_m          bigint;
  v_prev_m         bigint;
  v_chg_m          numeric;
  v_samp           bigint;
  v_avg            numeric;
  v_avg_old        numeric;
  v_med            numeric;
  -- janela (contato_janela)
  v_j_tot_m        bigint;
  v_j_rec_m        bigint;
  v_j_prev_m       bigint;
  v_j_chg_m        numeric;
  v_c_tot          bigint;
  v_c_rec          bigint;
  v_c_prev         bigint;
  v_c_chg          numeric;
  v_csat_avg       numeric;
  v_csat_cnt       bigint;
  v_pd_rec         bigint;
  v_pd_prev        bigint;
  v_pd_chg         numeric;
  -- vazio
  v_v_tot_m        bigint;
  v_v_c_tot        bigint;
  v_v_chg          numeric;
  v_v_samp         bigint;
  v_v_avg          numeric;
  v_v_med          numeric;
  -- ACL
  v_barrado        boolean;
  v_matou          boolean;
BEGIN
  -- ---------------------------------------------------------------- dados
  INSERT INTO auth.users (id, email) VALUES
    (v_user_a, 'contact-response-stats-a@local.test'),
    (v_user_b, 'contact-response-stats-b@local.test');

  -- O gatilho on_auth_user_created já cria o perfil; o upsert cobre os dois mundos.
  INSERT INTO public.profiles (user_id, name) VALUES
    (v_user_a, 'Agente A (sintetico)'),
    (v_user_b, 'Agente B (sintetico)')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;

  SELECT id INTO v_profile_a FROM public.profiles WHERE user_id = v_user_a;
  SELECT id INTO v_profile_b FROM public.profiles WHERE user_id = v_user_b;
  IF v_profile_a IS NULL OR v_profile_b IS NULL THEN
    RAISE EXCEPTION 'fixture invalida: perfil sintetico nao encontrado (% / %)', v_profile_a, v_profile_b;
  END IF;

  INSERT INTO public.contacts (id, name, phone, assigned_to) VALUES
    (v_contact_resp,   'Contato A resposta', '5511000000951', v_profile_a),
    (v_contact_janela, 'Contato A janela',   '5511000000952', v_profile_a),
    (v_contact_oculto, 'Contato B oculto',   '5511000000953', v_profile_b),
    (v_contact_vazio,  'Contato A vazio',    '5511000000954', v_profile_a);

  -- 300 pares "mensagem do contato -> resposta do agente" (600 mensagens), bem
  -- acima das 200 linhas que o código antigo lia. Pares 1..100 respondidos em
  -- 1 minuto; pares 101..300 em 5 minutos. Tudo a 90 dias, fora das janelas.
  INSERT INTO public.messages (contact_id, sender, content, message_type, created_at)
  SELECT
    v_contact_resp,
    CASE WHEN g % 2 = 1 THEN 'contact' ELSE 'agent' END,
    'resp ' || g,
    'text',
    v_resp_base
      + make_interval(hours => (g - 1) / 2)
      + CASE WHEN g % 2 = 0
             THEN CASE WHEN (g - 1) / 2 < 100 THEN interval '1 minute' ELSE interval '5 minutes' END
             ELSE interval '0' END
  FROM generate_series(1, 600) AS g;

  -- Duas mensagens do contato em sequência, sem resposta: não formam par
  -- (o "próximo" de uma mensagem do contato é outra do contato).
  INSERT INTO public.messages (contact_id, sender, content, message_type, created_at) VALUES
    (v_contact_resp, 'contact', 'sem resposta 1', 'text', v_resp_base + interval '400 hours'),
    (v_contact_resp, 'contact', 'sem resposta 2', 'text', v_resp_base + interval '400 hours 1 minute');

  -- Contato da janela: 5 mensagens do contato, nenhuma resposta do agente.
  --   2 na janela anterior (45 e 35 dias), 3 na recente (10, 5 e 1 dia).
  INSERT INTO public.messages (contact_id, sender, content, message_type, created_at) VALUES
    (v_contact_janela, 'contact', 'j anterior 1', 'text', now() - interval '45 days'),
    (v_contact_janela, 'contact', 'j anterior 2', 'text', now() - interval '35 days'),
    (v_contact_janela, 'contact', 'j recente 1',  'text', now() - interval '10 days'),
    (v_contact_janela, 'contact', 'j recente 2',  'text', now() - interval '5 days'),
    (v_contact_janela, 'contact', 'j recente 3',  'text', now() - interval '1 day');

  -- Conversas (conversation_sla) do contato da janela: 1 anterior, 2 recentes.
  -- Só UMA pode ficar "aberta" (first_response_at nulo) por causa do índice único
  -- parcial ux_conversation_sla_open_per_contact.
  INSERT INTO public.conversation_sla (contact_id, first_message_at, first_response_at) VALUES
    (v_contact_janela, now() - interval '40 days', now() - interval '40 days' + interval '1 hour'),
    (v_contact_janela, now() - interval '10 days', now() - interval '10 days' + interval '1 hour'),
    (v_contact_janela, now() - interval '2 days',  NULL);

  -- CSAT do contato da janela: média (4+5)/2 = 4,5 em 2 respostas.
  INSERT INTO public.csat_surveys (contact_id, agent_id, rating) VALUES
    (v_contact_janela, v_profile_a, 4),
    (v_contact_janela, v_profile_a, 5);

  -- Chamadas como authenticated (o papel real do painel).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- ---------------------------------------------------------------- T1
  SELECT count(*) INTO v_linhas FROM public.contact_response_stats(v_contact_resp);
  IF v_linhas <> 1 THEN
    RAISE EXCEPTION 'T1 FALHOU: contato visivel devolveu % linha(s), esperava 1', v_linhas;
  END IF;

  SELECT count(*) INTO v_linhas FROM public.contact_response_stats(v_contact_oculto);
  IF v_linhas <> 0 THEN
    RAISE EXCEPTION 'T1 FALHOU: contato de outro atendente devolveu % linha(s)', v_linhas;
  END IF;

  SELECT count(*) INTO v_linhas FROM public.contact_response_stats(v_inexistente);
  IF v_linhas <> 0 THEN
    RAISE EXCEPTION 'T1 FALHOU: contato inexistente devolveu % linha(s) (oraculo de existencia)', v_linhas;
  END IF;

  -- Como B, o contato de A nao aparece.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b)::text, true);
  SELECT count(*) INTO v_linhas FROM public.contact_response_stats(v_contact_resp);
  IF v_linhas <> 0 THEN
    RAISE EXCEPTION 'T1 FALHOU: a visibilidade do chamador B nao foi respeitada (% linha(s))', v_linhas;
  END IF;

  -- Volta como A.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T4
  SELECT total_messages, messages_recent, messages_previous, messages_change_percent,
         response_samples, avg_response_minutes, median_response_minutes
    INTO v_tot_m, v_rec_m, v_prev_m, v_chg_m, v_samp, v_avg, v_med
    FROM public.contact_response_stats(v_contact_resp);

  IF v_tot_m <> 602 THEN
    RAISE EXCEPTION 'T4 FALHOU: total_messages esperava 602 (600 dos pares + 2 sem resposta), veio %', v_tot_m;
  END IF;
  IF v_samp <> 300 THEN
    RAISE EXCEPTION 'T4 FALHOU: response_samples esperava 300 (todo o historico), veio % — a leitura parou no comeco da historia', v_samp;
  END IF;
  IF v_avg <> 3.67 THEN
    RAISE EXCEPTION 'T4 FALHOU: avg_response_minutes esperava 3.67 (media dos 300 pares), veio %', v_avg;
  END IF;
  IF v_avg = 1.00 THEN
    RAISE EXCEPTION 'T4 FALHOU: avg_response_minutes voltou 1.00, a media das 100 PRIMEIRAS respostas (o vies do limite de 200)';
  END IF;
  IF v_med <> 5.00 THEN
    RAISE EXCEPTION 'T4 FALHOU: median_response_minutes esperava 5.00, veio %', v_med;
  END IF;

  -- Vermelho do defeito: a leitura ANTIGA (200 mensagens mais antigas, em ordem
  -- crescente) só enxergava 100 pares, todos de 1 minuto -> média 1.00. A RPC
  -- tem de devolver um número DIFERENTE disso (o do histórico completo).
  SELECT round(avg(minutos), 2) INTO v_avg_old FROM (
    SELECT extract(epoch FROM (lead(m.created_at) OVER (ORDER BY m.created_at) - m.created_at)) / 60.0 AS minutos,
           m.sender,
           lead(m.sender) OVER (ORDER BY m.created_at) AS next_sender
    FROM (
      SELECT sender, created_at
      FROM public.messages
      WHERE contact_id = v_contact_resp
      ORDER BY created_at ASC
      LIMIT 200
    ) m
  ) x
  WHERE x.sender = 'contact' AND x.next_sender = 'agent';

  IF v_avg_old <> 1.00 THEN
    RAISE EXCEPTION 'fixture invalida: a leitura antiga (200 linhas) deveria dar 1.00 e deu %', v_avg_old;
  END IF;
  IF v_avg = v_avg_old THEN
    RAISE EXCEPTION 'T4 FALHOU: a RPC devolveu a media viesada das 200 primeiras mensagens (%)', v_avg;
  END IF;
  -- Tudo a 90 dias: janelas zeradas e variacao NULL (nao inventa numero).
  IF v_rec_m <> 0 OR v_prev_m <> 0 OR v_chg_m IS NOT NULL THEN
    RAISE EXCEPTION 'T4 FALHOU: janelas do historico antigo deveriam ser 0/0/NULL, veio %/%/%', v_rec_m, v_prev_m, v_chg_m;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T3
  SELECT total_messages, messages_recent, messages_previous, messages_change_percent
    INTO v_j_tot_m, v_j_rec_m, v_j_prev_m, v_j_chg_m
    FROM public.contact_response_stats(v_contact_janela);

  IF v_j_tot_m <> 5 OR v_j_rec_m <> 3 OR v_j_prev_m <> 2 OR v_j_chg_m <> 50 THEN
    RAISE EXCEPTION 'T3 FALHOU: mensagens esperava 5/3/2/50, veio %/%/%/%', v_j_tot_m, v_j_rec_m, v_j_prev_m, v_j_chg_m;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T6
  SELECT total_conversations, conversations_recent, conversations_previous,
         conversations_change_percent, response_samples, avg_response_minutes,
         median_response_minutes, csat_average, csat_count
    INTO v_c_tot, v_c_rec, v_c_prev, v_c_chg, v_samp, v_avg, v_med, v_csat_avg, v_csat_cnt
    FROM public.contact_response_stats(v_contact_janela);

  IF v_c_tot <> 3 OR v_c_rec <> 2 OR v_c_prev <> 1 OR v_c_chg <> 100 THEN
    RAISE EXCEPTION 'T6 FALHOU: conversas esperava 3/2/1/100, veio %/%/%/%', v_c_tot, v_c_rec, v_c_prev, v_c_chg;
  END IF;
  IF v_csat_avg <> 4.5 OR v_csat_cnt <> 2 THEN
    RAISE EXCEPTION 'T6 FALHOU: csat esperava 4.5 em 2, veio % em %', v_csat_avg, v_csat_cnt;
  END IF;
  IF v_samp <> 0 OR v_avg IS NOT NULL OR v_med IS NOT NULL THEN
    RAISE EXCEPTION 'T6 FALHOU: contato sem par contato->agente deveria ter amostra 0 e media/mediana NULL, veio %/%/%', v_samp, v_avg, v_med;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T7
  SELECT messages_recent, messages_previous, messages_change_percent
    INTO v_pd_rec, v_pd_prev, v_pd_chg
    FROM public.contact_response_stats(v_contact_janela, 20);

  IF v_pd_rec <> 3 OR v_pd_prev <> 1 OR v_pd_chg <> 200 THEN
    RAISE EXCEPTION 'T7 FALHOU: p_days=20 esperava 3/1/200, veio %/%/%', v_pd_rec, v_pd_prev, v_pd_chg;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T5
  SELECT total_messages, messages_change_percent, total_conversations, conversations_change_percent,
         response_samples, avg_response_minutes, median_response_minutes, csat_average, csat_count
    INTO v_v_tot_m, v_v_chg, v_v_c_tot, v_chg_m, v_v_samp, v_v_avg, v_v_med, v_csat_avg, v_csat_cnt
    FROM public.contact_response_stats(v_contact_vazio);

  IF v_v_tot_m <> 0 OR v_v_c_tot <> 0 OR v_v_chg IS NOT NULL OR v_chg_m IS NOT NULL THEN
    RAISE EXCEPTION 'T5 FALHOU: contato visivel sem dado esperava 0/0/NULL/NULL, veio %/%/%/%', v_v_tot_m, v_v_c_tot, v_v_chg, v_chg_m;
  END IF;
  IF v_v_samp <> 0 OR v_v_avg IS NOT NULL OR v_v_med IS NOT NULL OR v_csat_cnt <> 0 THEN
    RAISE EXCEPTION 'T5 FALHOU: contato vazio deveria ter amostra 0, media/mediana NULL e csat 0, veio %/%/%/%', v_v_samp, v_v_avg, v_v_med, v_csat_cnt;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T2
  -- ACL (postgres enxerga os GRANTs): anon/PUBLIC sem EXECUTE, authenticated e
  -- service_role com EXECUTE.
  IF has_function_privilege('anon', 'public.contact_response_stats(uuid, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T2 FALHOU: anon com EXECUTE na RPC';
  END IF;
  IF has_function_privilege('authenticated', 'public.contact_response_stats(uuid, integer)', 'EXECUTE') = false THEN
    RAISE EXCEPTION 'T2 FALHOU: authenticated SEM EXECUTE na RPC';
  END IF;
  IF has_function_privilege('service_role', 'public.contact_response_stats(uuid, integer)', 'EXECUTE') = false THEN
    RAISE EXCEPTION 'T2 FALHOU: service_role SEM EXECUTE na RPC';
  END IF;

  -- A prova funcional: como anon a chamada e barrada de verdade.
  PERFORM set_config('role', 'anon', true);
  v_barrado := false;
  BEGIN
    PERFORM 1 FROM public.contact_response_stats(v_contact_resp);
  EXCEPTION WHEN insufficient_privilege THEN
    v_barrado := true;
  END;
  PERFORM set_config('role', 'authenticated', true);
  IF v_barrado = false THEN
    RAISE EXCEPTION 'T2 FALHOU: anon conseguiu chamar a RPC';
  END IF;

  -- Controle positivo: como authenticated a RPC responde (GRANT correto).
  v_matou := false;
  BEGIN
    SELECT count(*) INTO v_linhas FROM public.contact_response_stats(v_contact_resp);
  EXCEPTION WHEN OTHERS THEN
    v_matou := true;
  END;
  IF v_matou OR v_linhas <> 1 THEN
    RAISE EXCEPTION 'T2 FALHOU: authenticated nao conseguiu chamar a RPC (erro=%, linhas=%)', v_matou, v_linhas;
  END IF;
  v_ok := v_ok + 1;

  RAISE NOTICE 'contact_response_stats: suite OK — % grupo(s) verificado(s)', v_ok;
END $contact_response_stats$;

ROLLBACK;
