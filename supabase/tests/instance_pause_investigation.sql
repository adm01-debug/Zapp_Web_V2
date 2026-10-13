-- Teste SQL da INVESTIGACAO dos incidentes de pausa de instancia (cartao t_be6539cc).
-- Dados SINTETICOS, no banco LOCAL da tarefa. Grupos:
--   T1 admin investiga: colunas + UMA linha em public.audit_logs, SEM copiar o texto das notas;
--   T2 agente/anon/service_role -> 42501 SEM efeito (service_role nao substitui ator humano);
--   T3 validacao: limite/HTML/nota em branco na funcao e os CHECKs na tabela (23514);
--   T4 pausa inexistente -> P0002; T5 reinvestigar preserva o PRIMEIRO ator e ja_investigada=true;
--   T5b supervisor investiga com o perfil dele; T6 serie '24h' em baldes de 1 hora;
--   T7 serie '7d' em baldes de 1 dia (pega o evento de 30 h, deixa o de 9 dias; sem arg = '24h');
--   T8 a serie devolve so agregado (chaves exatas) e janela invalida -> 22023; T9 RLS/ACL;
--   T10 rollback executado e estado restaurado.
-- RODAR (banco LOCAL, nunca producao):
--   zapp-db-local psql . v2-26101315358410 -v ON_ERROR_STOP=1 < supabase/tests/instance_pause_investigation.sql
-- Vermelho antes da migration: quebra em T1 (funcoes e colunas nao existem).
-- PAPEL REAL: request.jwt.claims (sub + role) + set_config('role', <papel>) — o caminho do
-- PostgREST —, nunca como postgres dentro das assercoes. Tudo desfeito no ROLLBACK final.
BEGIN;

DO $pause_investigation$
DECLARE
  v_admin_user uuid := '44444444-4444-4444-4444-4444444444a1';
  v_sup_user   uuid := '44444444-4444-4444-4444-4444444444a2';
  v_agent_user uuid := '44444444-4444-4444-4444-4444444444b1';
  v_admin_prof uuid;
  v_sup_prof   uuid;
  v_agent_prof uuid;
  v_inst_a     text := 'inst-invest-teste-a';
  v_inst_b     text := 'inst-invest-teste-b';
  v_inst_sup   text := 'inst-invest-teste-supervisor';
  v_pause_1    uuid;
  v_pause_2    uuid;
  v_pause_3    uuid;
  v_pause_4    uuid;
  v_conn       uuid;
  v_ts0        timestamptz;
  v_orig       timestamptz := timestamptz '2000-01-01 00:00:00+00';
  v_out        jsonb;
  v_at1        timestamptz;
  v_by1        uuid;
  v_errcode    text;
  v_errmsg     text;
  v_n          int;
  v_total      numeric;
  v_af         numeric;
  v_disc       numeric;
  v_err        numeric;
  v_chaves     text[];
  v_ok         int := 0;
BEGIN
  -- ---------------------------------------------------------------- dados (postgres)
  INSERT INTO auth.users (id, email) VALUES
    (v_admin_user, 'invest-admin@local.test'),
    (v_sup_user,   'invest-supervisor@local.test'),
    (v_agent_user, 'invest-agent@local.test');

  INSERT INTO public.profiles (user_id, name)
  VALUES (v_admin_user, 'Admin investigacao (sintetico)'),
         (v_sup_user,   'Supervisor investigacao (sintetico)'),
         (v_agent_user, 'Agente investigacao (sintetico)')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;

  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_admin_user, 'admin'),
    (v_sup_user,   'supervisor'),
    (v_agent_user, 'agent')
  ON CONFLICT (user_id, role) DO NOTHING;

  SELECT id INTO v_admin_prof FROM public.profiles WHERE user_id = v_admin_user;
  SELECT id INTO v_sup_prof   FROM public.profiles WHERE user_id = v_sup_user;
  SELECT id INTO v_agent_prof FROM public.profiles WHERE user_id = v_agent_user;
  IF v_admin_prof IS NULL OR v_sup_prof IS NULL OR v_agent_prof IS NULL THEN
    RAISE EXCEPTION 'fixture invalida: perfil sintetico nao encontrado';
  END IF;

  INSERT INTO public.instance_pauses (instance, paused_until, reason, paused_by, auto)
  VALUES (v_inst_a, now() + interval '30 minutes', 'manutencao', v_admin_prof, false)
  RETURNING id INTO v_pause_1;
  INSERT INTO public.instance_pauses (instance, paused_until, reason, paused_by, auto)
  VALUES (v_inst_b, now() + interval '30 minutes', 'manutencao', v_admin_prof, false)
  RETURNING id INTO v_pause_2;
  INSERT INTO public.instance_pauses (instance, paused_until, reason, paused_by, auto, resumed_at, resumed_by)
  VALUES (v_inst_a, now() - interval '5 minutes', 'limite de envio', NULL, true,
          now() - interval '4 minutes', v_admin_prof)
  RETURNING id INTO v_pause_3;
  INSERT INTO public.instance_pauses (instance, paused_until, reason, paused_by, auto)
  VALUES (v_inst_sup, now() + interval '20 minutes', 'manutencao', v_admin_prof, false)
  RETURNING id INTO v_pause_4;

  -- ================================================================ T1 (admin investiga)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN
    v_out := public.mark_pause_investigated(v_pause_1, 'revisado o log do provedor: nada de errado no envio');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'none', true);

  IF v_errcode IS NOT NULL THEN
    RAISE EXCEPTION 'T1 FALHOU: admin deveria investigar a pausa, mas deu erro [%] %', v_errcode, v_errmsg;
  END IF;
  IF (v_out ->> 'investigated_by')::uuid IS DISTINCT FROM v_admin_prof THEN
    RAISE EXCEPTION 'T1 FALHOU: investigated_by=% esperado=%', v_out ->> 'investigated_by', v_admin_prof;
  END IF;
  IF (v_out ->> 'investigated_at') IS NULL
     OR (v_out ->> 'investigated_at')::timestamptz <= now() - interval '2 minutes' THEN
    RAISE EXCEPTION 'T1 FALHOU: investigated_at ausente ou no passado (%)', v_out ->> 'investigated_at';
  END IF;
  IF (v_out ->> 'investigation_notes') IS DISTINCT FROM 'revisado o log do provedor: nada de errado no envio' THEN
    RAISE EXCEPTION 'T1 FALHOU: notas nao gravadas (%)', v_out ->> 'investigation_notes';
  END IF;
  IF (v_out ->> 'instance') IS DISTINCT FROM v_inst_a OR (v_out ->> 'id')::uuid IS DISTINCT FROM v_pause_1 THEN
    RAISE EXCEPTION 'T1 FALHOU: retorno nao identifica a pausa (%)', v_out;
  END IF;
  IF (v_out ->> 'ja_investigada')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'T1 FALHOU: primeira investigacao deveria ter ja_investigada=false';
  END IF;

  SELECT investigated_at, investigated_by INTO v_at1, v_by1
    FROM public.instance_pauses WHERE id = v_pause_1;
  IF v_at1 IS NULL OR v_by1 IS DISTINCT FROM v_admin_prof THEN
    RAISE EXCEPTION 'T1 FALHOU: linha nao ficou marcada (at=%, by=%)', v_at1, v_by1;
  END IF;

  -- auditoria registrada com ator, sem copiar o texto livre
  SELECT count(*) INTO v_n FROM public.audit_logs
   WHERE entity_id = v_pause_1 AND action = 'instance_pause_investigated';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T1 FALHOU: esperava 1 linha de auditoria, achei %', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.audit_logs
   WHERE entity_id = v_pause_1
     AND user_id = v_admin_user
     AND entity_type = 'instance_pause'
     AND action = 'instance_pause_investigated';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T1 FALHOU: auditoria sem ator/tipo/acao esperados';
  END IF;
  SELECT count(*) INTO v_n FROM public.audit_logs
   WHERE entity_id = v_pause_1 AND details::text LIKE '%nada de errado no envio%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T1 FALHOU: as notas livres foram copiadas para a auditoria';
  END IF;
  v_ok := v_ok + 1;

  -- ================================================================ T2 (sem permissao = sem efeito)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN
    v_out := public.mark_pause_investigated(v_pause_2, 'tentativa sem permissao');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T2 FALHOU: agente nao-staff deveria dar 42501 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  SELECT count(*) INTO v_n FROM public.instance_pauses
   WHERE id = v_pause_2 AND investigated_at IS NULL AND investigation_notes IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T2 FALHOU: a pausa foi alterada apesar da falta de permissao';
  END IF;
  SELECT count(*) INTO v_n FROM public.audit_logs WHERE entity_id = v_pause_2;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T2 FALHOU: nasceu auditoria para uma tentativa negada';
  END IF;

  -- anon: sem EXECUTE
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  PERFORM set_config('role', 'anon', true);
  v_errcode := NULL;
  BEGIN
    v_out := public.mark_pause_investigated(v_pause_2, 'anon');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE;
  END;
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T2 FALHOU: anon deveria dar 42501 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;

  -- service_role: sem usuario humano, nao substitui o ator
  PERFORM set_config('role', 'service_role', true);
  v_errcode := NULL;
  BEGIN
    v_out := public.mark_pause_investigated(v_pause_2, 'sem ator humano');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T2 FALHOU: service_role sem ator deveria dar 42501 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  SELECT count(*) INTO v_n FROM public.audit_logs WHERE entity_id = v_pause_2;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T2 FALHOU: service_role sem ator deixou rastro na auditoria';
  END IF;
  v_ok := v_ok + 1;

  -- ================================================================ T3 (validacao)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN
    v_out := public.mark_pause_investigated(v_pause_3, repeat('a', 1001));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE;
  END;
  IF v_errcode IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'T3 FALHOU: notas com 1001 caracteres deveriam dar 22023 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;

  v_errcode := NULL;
  BEGIN
    v_out := public.mark_pause_investigated(v_pause_3, '<b>negrito</b>');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE;
  END;
  IF v_errcode IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'T3 FALHOU: notas com HTML deveriam dar 22023 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;

  -- nada aplicado pelas tentativas invalidas
  SELECT count(*) INTO v_n FROM public.instance_pauses
   WHERE id = v_pause_3 AND investigated_at IS NULL AND investigation_notes IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T3 FALHOU: entrada invalida aplicou parte da mudanca';
  END IF;
  SELECT count(*) INTO v_n FROM public.audit_logs WHERE entity_id = v_pause_3;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T3 FALHOU: entrada invalida gerou auditoria';
  END IF;

  -- notas em branco viram NULL e ainda marcam
  v_out := public.mark_pause_investigated(v_pause_3, '    ');
  PERFORM set_config('role', 'none', true);
  IF (v_out ->> 'investigation_notes') IS NOT NULL THEN
    RAISE EXCEPTION 'T3 FALHOU: notas em branco deveriam virar NULL (%)', v_out ->> 'investigation_notes';
  END IF;
  IF (v_out ->> 'investigated_by')::uuid IS DISTINCT FROM v_admin_prof THEN
    RAISE EXCEPTION 'T3 FALHOU: notas em branco impediram a marcacao';
  END IF;

  -- limite e "sem HTML" valem como CHECK no banco (nao so na funcao)
  v_errcode := NULL;
  BEGIN
    UPDATE public.instance_pauses SET investigation_notes = repeat('b', 1001) WHERE id = v_pause_3;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '23514' THEN
    RAISE EXCEPTION 'T3 FALHOU: CHECK de tamanho deveria dar 23514 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;

  v_errcode := NULL;
  BEGIN
    UPDATE public.instance_pauses SET investigation_notes = '<i>x</i>' WHERE id = v_pause_3;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '23514' THEN
    RAISE EXCEPTION 'T3 FALHOU: CHECK sem HTML deveria dar 23514 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;

  v_errcode := NULL;
  BEGIN
    UPDATE public.instance_pauses SET investigated_at = now(), investigated_by = NULL WHERE id = v_pause_3;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '23514' THEN
    RAISE EXCEPTION 'T3 FALHOU: CHECK de consistencia ator+data deveria dar 23514 (deu %)',
      coalesce(v_errcode, 'sem erro');
  END IF;
  v_ok := v_ok + 1;

  -- ================================================================ T4 (pausa inexistente)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN
    v_out := public.mark_pause_investigated('99999999-9999-9999-9999-999999999999'::uuid, 'nao existe');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS DISTINCT FROM 'P0002' THEN
    RAISE EXCEPTION 'T4 FALHOU: pausa inexistente deveria dar P0002 (deu % / %)',
      coalesce(v_errcode, 'sem erro'), coalesce(v_errmsg, '-');
  END IF;
  IF v_errmsg IS DISTINCT FROM 'pausa_nao_encontrada' THEN
    RAISE EXCEPTION 'T4 FALHOU: mensagem inesperada (%)', v_errmsg;
  END IF;
  v_ok := v_ok + 1;

  -- ================================================================ T5 (idempotencia + auditoria)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_out := public.mark_pause_investigated(v_pause_1, NULL);
  PERFORM set_config('role', 'none', true);
  IF (v_out ->> 'ja_investigada')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'T5 FALHOU: reinvestigar deveria devolver ja_investigada=true';
  END IF;
  IF (v_out ->> 'investigated_at')::timestamptz IS DISTINCT FROM v_at1
     OR (v_out ->> 'investigated_by')::uuid IS DISTINCT FROM v_by1 THEN
    RAISE EXCEPTION 'T5 FALHOU: reinvestigar reescreveu a auditoria (at=% by=%)',
      v_out ->> 'investigated_at', v_out ->> 'investigated_by';
  END IF;
  IF (v_out ->> 'investigation_notes') IS DISTINCT FROM 'revisado o log do provedor: nada de errado no envio' THEN
    RAISE EXCEPTION 'T5 FALHOU: reinvestigar sem notas deveria preservar as notas antigas (%)',
      v_out ->> 'investigation_notes';
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_out := public.mark_pause_investigated(v_pause_1, 'complemento: cliente reclamou de atraso');
  PERFORM set_config('role', 'none', true);
  IF (v_out ->> 'investigation_notes') IS DISTINCT FROM 'complemento: cliente reclamou de atraso' THEN
    RAISE EXCEPTION 'T5 FALHOU: notas novas deveriam substituir as antigas (%)', v_out ->> 'investigation_notes';
  END IF;
  IF (v_out ->> 'investigated_at')::timestamptz IS DISTINCT FROM v_at1
     OR (v_out ->> 'investigated_by')::uuid IS DISTINCT FROM v_by1 THEN
    RAISE EXCEPTION 'T5 FALHOU: a 2a reinvestigacao reescreveu ator/data';
  END IF;
  SELECT count(*) INTO v_n FROM public.audit_logs
   WHERE entity_id = v_pause_1 AND action = 'instance_pause_investigated';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'T5 FALHOU: esperava 3 linhas de auditoria (1 por chamada), achei %', v_n;
  END IF;
  v_ok := v_ok + 1;

  -- ================================================================ T5b (supervisor)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_sup_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_out := public.mark_pause_investigated(v_pause_4, 'supervisor conferiu');
  PERFORM set_config('role', 'none', true);
  IF (v_out ->> 'investigated_by')::uuid IS DISTINCT FROM v_sup_prof THEN
    RAISE EXCEPTION 'T5b FALHOU: investigated_by=% esperado=perfil do supervisor (%)',
      v_out ->> 'investigated_by', v_sup_prof;
  END IF;
  v_ok := v_ok + 1;

  -- ================================================================ fixture da serie de eventos
  INSERT INTO public.whatsapp_connections (name, phone_number)
  VALUES ('invest-teste-conexao', '+5511999990000') RETURNING id INTO v_conn;

  v_ts0 := date_bin(interval '1 hour', now(), v_orig);
  INSERT INTO public.connection_health_logs (connection_id, instance_id, status, error_message, checked_at)
  VALUES
    (v_conn, v_inst_a, 'no_credentials', 'HTTP 401: unauthorized',        v_ts0 - interval '1 hour'),
    (v_conn, v_inst_a, 'no_credentials', 'HTTP 403: forbidden',           v_ts0 - interval '2 hours'),
    (v_conn, v_inst_a, 'disconnected',   'sem resposta da instancia',     v_ts0 - interval '3 hours'),
    (v_conn, v_inst_a, 'healthy',        NULL,                            v_ts0 - interval '4 hours'),
    (v_conn, v_inst_b, 'error',          'HTTP 500: erro do provedor',    v_ts0 - interval '5 hours'),
    (v_conn, v_inst_b, 'timeout',        'sem resposta em 10s',           v_ts0 - interval '30 hours'),
    (v_conn, v_inst_a, 'no_credentials', 'HTTP 401: unauthorized',        v_ts0 - interval '4 days'),
    (v_conn, v_inst_b, 'healthy',        NULL,                            v_ts0 - interval '9 days');

  -- ================================================================ T6 (serie 24h, balde de 1 hora)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN
    SELECT count(*), sum(total) INTO v_n, v_total FROM public.instance_auth_event_series('24h');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  IF v_errcode IS NOT NULL THEN
    PERFORM set_config('role', 'none', true);
    RAISE EXCEPTION 'T6 FALHOU: admin deveria ler a serie de 24h, mas deu erro [%] %', v_errcode, v_errmsg;
  END IF;
  IF v_total <> 5 THEN
    PERFORM set_config('role', 'none', true);
    RAISE EXCEPTION 'T6 FALHOU: a janela de 24h deveria somar 5 eventos (somou %)', v_total;
  END IF;
  IF v_n < 5 THEN
    PERFORM set_config('role', 'none', true);
    RAISE EXCEPTION 'T6 FALHOU: baldes de 1 hora deveriam separar os eventos (achei % linha(s))', v_n;
  END IF;

  SELECT sum(total), sum(auth_failures), sum(disconnected), sum(errors)
    INTO v_total, v_af, v_disc, v_err
    FROM public.instance_auth_event_series('24h') WHERE instance = v_inst_a;
  PERFORM set_config('role', 'none', true);
  IF v_total <> 4 OR v_af <> 2 OR v_disc <> 1 OR v_err <> 0 THEN
    RAISE EXCEPTION 'T6 FALHOU: instancia A total=% auth=% disconnected=% erros=% (esperado 4/2/1/0)',
      v_total, v_af, v_disc, v_err;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT sum(total), sum(errors) INTO v_total, v_err
    FROM public.instance_auth_event_series('24h') WHERE instance = v_inst_b;
  PERFORM set_config('role', 'none', true);
  IF v_total <> 1 OR v_err <> 1 THEN
    RAISE EXCEPTION 'T6 FALHOU: instancia B total=% erros=% (esperado 1/1; o evento de 30 h atras nao entra em 24 h)',
      v_total, v_err;
  END IF;

  -- baldes de 1 hora alinhados na origem, ordenados, e o evento de 30 h fora
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_n FROM public.instance_auth_event_series('24h')
   WHERE (extract(epoch FROM bucket)::bigint % 3600) <> 0;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T6 FALHOU: % balde(s) fora do alinhamento de 1 hora', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.instance_auth_event_series('24h')
   WHERE bucket = date_bin(interval '1 hour', v_ts0 - interval '30 hours', v_orig);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T6 FALHOU: a serie de 24h trouxe um balde de 30 horas atras';
  END IF;
  SELECT count(*) INTO v_n FROM (
    SELECT bucket FROM public.instance_auth_event_series('24h')
     ORDER BY bucket ASC, instance ASC
  ) t;
  IF v_n <> (SELECT count(*) FROM public.instance_auth_event_series('24h')) THEN
    RAISE EXCEPTION 'T6 FALHOU: contagem instavel na serie';
  END IF;
  PERFORM set_config('role', 'none', true);
  v_ok := v_ok + 1;

  -- ================================================================ T7 (serie 7d, balde de 1 dia)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*), sum(total) INTO v_n, v_total FROM public.instance_auth_event_series('7d');
  IF v_total <> 7 THEN
    PERFORM set_config('role', 'none', true);
    RAISE EXCEPTION 'T7 FALHOU: a janela de 7d deveria somar 7 eventos (somou %)', v_total;
  END IF;
  SELECT sum(total), sum(auth_failures), sum(disconnected)
    INTO v_total, v_af, v_disc
    FROM public.instance_auth_event_series('7d') WHERE instance = v_inst_a;
  IF v_total <> 5 OR v_af <> 3 OR v_disc <> 1 THEN
    PERFORM set_config('role', 'none', true);
    RAISE EXCEPTION 'T7 FALHOU: instancia A em 7d total=% auth=% disconnected=% (esperado 5/3/1)',
      v_total, v_af, v_disc;
  END IF;
  SELECT sum(total), sum(errors) INTO v_total, v_err
    FROM public.instance_auth_event_series('7d') WHERE instance = v_inst_b;
  PERFORM set_config('role', 'none', true);
  IF v_total <> 2 OR v_err <> 2 THEN
    RAISE EXCEPTION 'T7 FALHOU: instancia B em 7d total=% erros=% (esperado 2/2: o evento de 30 h atras entra aqui)',
      v_total, v_err;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_n FROM public.instance_auth_event_series('7d')
   WHERE (extract(epoch FROM bucket)::bigint % 86400) <> 0;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T7 FALHOU: % balde(s) fora do alinhamento de 1 dia', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.instance_auth_event_series('7d')
   WHERE bucket = date_bin(interval '1 day', v_ts0 - interval '9 days', v_orig);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T7 FALHOU: a serie de 7d trouxe o evento de 9 dias atras';
  END IF;
  -- sem argumento = 24h
  SELECT sum(total) INTO v_total FROM public.instance_auth_event_series();
  PERFORM set_config('role', 'none', true);
  IF v_total <> 5 THEN
    RAISE EXCEPTION 'T7 FALHOU: a chamada sem argumento deveria ser a janela de 24h (somou %)', v_total;
  END IF;
  v_ok := v_ok + 1;

  -- ================================================================ T8 (agregado sem dado pessoal)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT array_agg(k ORDER BY k) INTO v_chaves
    FROM (SELECT * FROM public.instance_auth_event_series('24h') LIMIT 1) r,
         LATERAL jsonb_object_keys(to_jsonb(r)) k;
  PERFORM set_config('role', 'none', true);
  IF v_chaves IS DISTINCT FROM ARRAY['auth_failures','bucket','disconnected','errors','instance','total']::text[] THEN
    RAISE EXCEPTION 'T8 FALHOU: a serie devolveu campos inesperados (%) — pode vazar dado pessoal', v_chaves;
  END IF;

  -- papeis errados
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN
    PERFORM count(*) FROM public.instance_auth_event_series('24h');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T8 FALHOU: agente nao-staff nao deveria ler a serie (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  PERFORM set_config('role', 'anon', true);
  v_errcode := NULL;
  BEGIN
    PERFORM count(*) FROM public.instance_auth_event_series('24h');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T8 FALHOU: anon nao deveria ler a serie (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;

  -- janela invalida
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN
    PERFORM count(*) FROM public.instance_auth_event_series('30d');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'T8 FALHOU: janela ''30d'' deveria dar 22023 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  v_errcode := NULL;
  BEGIN
    PERFORM count(*) FROM public.instance_auth_event_series(NULL);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'T8 FALHOU: janela NULL deveria dar 22023 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  -- forma alternativa da entrada: '7D' (maiuscula) nao e aceita por acidente
  v_errcode := NULL;
  BEGIN
    PERFORM count(*) FROM public.instance_auth_event_series('7D');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'T8 FALHOU: janela ''7D'' deveria dar 22023 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  v_ok := v_ok + 1;

  -- ================================================================ T9 (RLS/ACL)
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.instance_pauses'::regclass) THEN
    RAISE EXCEPTION 'T9 FALHOU: RLS desligada na tabela de pausas';
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'instance_pauses';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T9 FALHOU: a migration nao deve mudar as policies da tabela de pausas (achei %)', v_n;
  END IF;

  IF has_function_privilege('anon', 'public.mark_pause_investigated(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.instance_auth_event_series(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T9 FALHOU: anon nao deveria ter EXECUTE nas funcoes novas';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.mark_pause_investigated(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.instance_auth_event_series(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T9 FALHOU: authenticated deveria ter EXECUTE nas funcoes novas';
  END IF;

  -- escrita direta segue negada ao papel de cliente
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN
    UPDATE public.instance_pauses SET investigation_notes = 'x' WHERE id = v_pause_1;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T9 FALHOU: UPDATE direto por authenticated deveria dar 42501 (deu %)',
      coalesce(v_errcode, 'sem erro');
  END IF;
  IF has_table_privilege('authenticated', 'public.instance_pauses', 'INSERT')
     OR has_table_privilege('authenticated', 'public.instance_pauses', 'DELETE') THEN
    RAISE EXCEPTION 'T9 FALHOU: a migration concedeu escrita direta na tabela de pausas';
  END IF;

  -- as 3 colunas existem e sao anulaveis
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'instance_pauses'
     AND column_name IN ('investigated_at','investigated_by','investigation_notes')
     AND is_nullable = 'YES';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'T9 FALHOU: colunas de investigacao ausentes ou nao anulaveis (achei %)', v_n;
  END IF;
  v_ok := v_ok + 1;

  RAISE NOTICE 'instance_pause_investigation: T1..T9 OK — % grupo(s)', v_ok;
END
$pause_investigation$;

-- ===================================================================== T10 (rollback)
-- Executa o bloco "-- Rollback" da migration (copiado do proprio arquivo) contra o schema
-- REAL, confere que tudo o que a migration criou some e desfaz com ROLLBACK TO SAVEPOINT.
SAVEPOINT investigation_rollback;

DROP FUNCTION IF EXISTS public.instance_auth_event_series(text);
DROP FUNCTION IF EXISTS public.mark_pause_investigated(uuid, text);
ALTER TABLE public.instance_pauses DROP CONSTRAINT IF EXISTS instance_pauses_investigacao_completa;
ALTER TABLE public.instance_pauses DROP CONSTRAINT IF EXISTS instance_pauses_notas_tamanho;
ALTER TABLE public.instance_pauses DROP CONSTRAINT IF EXISTS instance_pauses_notas_sem_html;
ALTER TABLE public.instance_pauses DROP COLUMN IF EXISTS investigation_notes;
ALTER TABLE public.instance_pauses DROP COLUMN IF EXISTS investigated_by;
ALTER TABLE public.instance_pauses DROP COLUMN IF EXISTS investigated_at;

DO $verifica_rollback$
BEGIN
  IF to_regprocedure('public.mark_pause_investigated(uuid,text)') IS NOT NULL
     OR to_regprocedure('public.instance_auth_event_series(text)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'instance_pauses'
                   AND column_name IN ('investigated_at','investigated_by','investigation_notes'))
     OR EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.instance_pauses'::regclass
                   AND conname IN ('instance_pauses_investigacao_completa',
                                   'instance_pauses_notas_tamanho',
                                   'instance_pauses_notas_sem_html')) THEN
    RAISE EXCEPTION 'T10 FALHOU: o rollback nao removeu tudo o que a migration criou';
  END IF;
END
$verifica_rollback$;

ROLLBACK TO SAVEPOINT investigation_rollback;

DO $confirma_restaurado$
BEGIN
  IF to_regprocedure('public.mark_pause_investigated(uuid,text)') IS NULL
     OR to_regprocedure('public.instance_auth_event_series(text)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'instance_pauses'
                       AND column_name = 'investigated_at') THEN
    RAISE EXCEPTION 'T10 FALHOU: ROLLBACK TO SAVEPOINT nao restaurou a migration';
  END IF;
  RAISE NOTICE 'instance_pause_investigation: suite OK — T1..T10 (investigacao com ator, negado sem efeito, validacao, pausa inexistente, idempotencia, supervisor, serie 24h, serie 7d, so agregado, RLS/ACL, rollback)';
END
$confirma_restaurado$;

ROLLBACK;
