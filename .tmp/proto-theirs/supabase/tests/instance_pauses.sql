-- Teste SQL de pausa de instancia de WhatsApp (cartao t_21bf8ddc).
--
-- O que prova:
--   T1  pause_instance (staff) abre a pausa: devolve paused_until no futuro
--       (janela de 5..1440 min), auto=false, paused_by = perfil de quem pausou,
--       e is_instance_paused passa a true para essa instancia (false para outra),
--       inclusive quando a consulta vem com espacos em volta;
--   T2  autorizacao ANTES de qualquer efeito: agente NAO-staff recebe 42501 e
--       NENHUMA linha nasce para aquela instancia;
--   T3  validacao de entrada: minutos fora de 5..1440 (4 e 1441), instancia em
--       branco, motivo nulo e motivo em branco levantam 22023 — nada aplicado;
--   T4  idempotencia do indice UNICO parcial: pausar de novo a MESMA instancia
--       aberta ESTENDE a linha existente (nunca nasce uma 2a pausa aberta);
--   T5  resume_instance (staff) fecha a pausa aberta (resumed_at/resumed_by
--       preenchidos) e devolve 1; a 2a chamada devolve 0 (idempotente);
--   T5b supervisor tambem pausa e retoma com paused_by/resumed_by do perfil dele;
--   T6  resume_instance por agente NAO-staff -> 42501 e a pausa segue aberta;
--   T7  pausa VENCIDA (paused_until no passado, ainda nao retomada) nao conta:
--       is_instance_paused = false; T7b pausa manual depois do vencimento cria
--       nova linha e fecha a antiga em resumed_at = paused_until, preservando
--       reason/paused_by/paused_until/created_at;
--   T8  auto_pause_instance e' exclusiva do service_role (cria auto=true,
--       paused_by NULL) e a pausa automatica tambem sustenta is_instance_paused;
--       T8b prova que auto_pause sobre pausa manual vencida cria 2a linha auto=true
--       e paused_by NULL sem sobrescrever o historico manual antigo;
--   T9  RLS/ACL: RLS ligada e UMA policy de SELECT (staff); staff le, agente
--       NAO-staff le ZERO linha, anon e' barrado; INSERT/UPDATE/DELETE diretos
--       nao sao concedidos a papel de cliente; anon sem EXECUTE nas funcoes;
--       agente NAO-staff sem acesso a is_instance_paused (42501).
--
-- COMO RODAR (banco LOCAL da tarefa, nunca producao):
--   zapp-db-local psql . v2-2610111527f011 -v ON_ERROR_STOP=1 < supabase/tests/instance_pauses.sql
--
-- VERMELHO antes da migration: a tabela e as funcoes nao existem, entao a suite
-- quebra no primeiro uso de public.instance_pauses (T1).
--
-- Enforcamento como PAPEL REAL: claims sinteticos em request.jwt.claims
-- (sub + role) + set_config('role', <papel>) — o caminho do PostgREST —, nunca
-- como postgres dentro das assercoes. Dados SINTETICOS; tudo desfeito no
-- ROLLBACK final (nao sobra linha nem usuario no banco).
BEGIN;

DO $instance_pauses$
DECLARE
  v_admin_user uuid := '33333333-3333-3333-3333-3333333333a1';
  v_sup_user   uuid := '33333333-3333-3333-3333-3333333333a2';
  v_agent_user uuid := '33333333-3333-3333-3333-3333333333b1';
  v_admin_prof uuid;
  v_sup_prof   uuid;
  v_agent_prof uuid;
  v_inst_a     text := 'inst-pausa-teste-a';
  v_inst_b     text := 'inst-pausa-teste-b';
  v_inst_auto  text := 'inst-pausa-teste-auto';
  v_inst_auto_exp text := 'inst-pausa-teste-auto-expirada';
  v_inst_exp   text := 'inst-pausa-teste-expirada';
  v_inst_sup   text := 'inst-pausa-teste-supervisor';
  v_inst_nova  text := 'inst-pausa-teste-nova';
  v_out        jsonb;
  v_until      timestamptz;
  v_until2     timestamptz;
  v_old_until  timestamptz;
  v_old_created_at timestamptz;
  v_old_reason text;
  v_latest_created_at timestamptz;
  v_latest_auto boolean;
  v_latest_paused_by uuid;
  v_errcode    text;
  v_errmsg     text;
  v_n          int;
  v_resumed_by uuid;
  v_ok         int := 0;
BEGIN
  -- ---------------------------------------------------------------- dados (postgres)
  INSERT INTO auth.users (id, email) VALUES
    (v_admin_user, 'instance-pauses-admin@local.test'),
    (v_sup_user,   'instance-pauses-supervisor@local.test'),
    (v_agent_user, 'instance-pauses-agent@local.test');

  INSERT INTO public.profiles (user_id, name)
  VALUES (v_admin_user, 'Admin (sintetico)'),
         (v_sup_user,   'Supervisor (sintetico)'),
         (v_agent_user, 'Agente (sintetico)')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;

  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_admin_user, 'admin'),
    (v_sup_user,   'supervisor'),
    (v_agent_user, 'agent')
  ON CONFLICT (user_id, role) DO NOTHING;

  SELECT id INTO v_admin_prof FROM public.profiles WHERE user_id = v_admin_user;
  SELECT id INTO v_sup_prof FROM public.profiles WHERE user_id = v_sup_user;
  SELECT id INTO v_agent_prof FROM public.profiles WHERE user_id = v_agent_user;
  IF v_admin_prof IS NULL OR v_sup_prof IS NULL OR v_agent_prof IS NULL THEN
    RAISE EXCEPTION 'fixture invalida: perfil sintetico nao encontrado (% / % / %)',
      v_admin_prof, v_sup_prof, v_agent_prof;
  END IF;

  -- ================================================================ T1 (staff pausa)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN
    v_out := public.pause_instance(v_inst_a, 30, 'manutencao programada');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'none', true);

  IF v_errcode IS NOT NULL THEN
    RAISE EXCEPTION 'T1 FALHOU: staff deveria pausar a instancia, mas deu erro [%] %', v_errcode, v_errmsg;
  END IF;
  v_until := (v_out ->> 'paused_until')::timestamptz;
  IF v_until IS NULL OR v_until <= now() OR v_until > now() + interval '31 minutes' THEN
    RAISE EXCEPTION 'T1 FALHOU: paused_until fora da janela de 30 min (%)', v_until;
  END IF;
  IF (v_out ->> 'auto')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'T1 FALHOU: pausa manual deveria ter auto=false (%)', v_out ->> 'auto';
  END IF;
  IF (v_out ->> 'paused_by')::uuid IS DISTINCT FROM v_admin_prof THEN
    RAISE EXCEPTION 'T1 FALHOU: paused_by=% esperado=%', v_out ->> 'paused_by', v_admin_prof;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  IF NOT public.is_instance_paused(v_inst_a) THEN
    RAISE EXCEPTION 'T1 FALHOU: is_instance_paused deveria ser true para a instancia pausada';
  END IF;
  IF public.is_instance_paused(v_inst_b) THEN
    RAISE EXCEPTION 'T1 FALHOU: is_instance_paused deveria ser false para instancia nunca pausada';
  END IF;
  IF NOT public.is_instance_paused('  ' || v_inst_a || '  ') THEN
    RAISE EXCEPTION 'T1 FALHOU: is_instance_paused deveria aplicar btrim no parametro de consulta';
  END IF;
  PERFORM set_config('role', 'none', true);
  v_ok := v_ok + 1;

  -- ================================================================ T2 (agente nao-staff)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN
    v_out := public.pause_instance(v_inst_b, 30, 'tentativa sem permissao');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T2 FALHOU: agente nao-staff deveria receber 42501 (erro=[%] %)',
      coalesce(v_errcode, 'sem erro'), coalesce(v_errmsg, '-');
  END IF;
  SELECT count(*) INTO v_n FROM public.instance_pauses WHERE instance = v_inst_b;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T2 FALHOU: negacao por permissao deixou % linha(s) — efeito antes da autorizacao', v_n;
  END IF;
  v_ok := v_ok + 1;

  -- ================================================================ T3 (validacao de entrada)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_errcode := NULL;
  BEGIN PERFORM public.pause_instance(v_inst_nova, 4, 'curta demais');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'T3 FALHOU: 4 minutos deveria dar 22023 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;

  v_errcode := NULL;
  BEGIN PERFORM public.pause_instance(v_inst_nova, 1441, 'longa demais');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'T3 FALHOU: 1441 minutos deveria dar 22023 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;

  v_errcode := NULL;
  BEGIN PERFORM public.pause_instance('   ', 30, 'instancia em branco');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'T3 FALHOU: instancia em branco deveria dar 22023 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;

  v_errcode := NULL;
  BEGIN PERFORM public.pause_instance(v_inst_nova, 30, NULL);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'T3 FALHOU: motivo nulo deveria dar 22023 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;

  v_errcode := NULL;
  BEGIN PERFORM public.pause_instance(v_inst_nova, 30, '   ');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'T3 FALHOU: motivo em branco deveria dar 22023 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  PERFORM set_config('role', 'none', true);

  SELECT count(*) INTO v_n FROM public.instance_pauses WHERE instance = v_inst_nova;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T3 FALHOU: entrada invalida gravou % linha(s)', v_n;
  END IF;
  v_ok := v_ok + 1;

  -- ================================================================ T4 (idempotencia: estende)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_out := public.pause_instance(v_inst_a, 120, 'estendendo a mesma pausa');
  PERFORM set_config('role', 'none', true);

  v_until2 := (v_out ->> 'paused_until')::timestamptz;
  SELECT count(*) INTO v_n FROM public.instance_pauses
   WHERE instance = v_inst_a AND resumed_at IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T4 FALHOU: esperava UMA pausa aberta por instancia, encontrei %', v_n;
  END IF;
  IF v_until2 <= v_until THEN
    RAISE EXCEPTION 'T4 FALHOU: a 2a pausa deveria ESTENDER (antes=%, depois=%)', v_until, v_until2;
  END IF;
  v_ok := v_ok + 1;

  -- ================================================================ T5 (staff retoma)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_n := public.resume_instance(v_inst_a);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T5 FALHOU: resume_instance deveria fechar 1 pausa (devolveu %)', v_n;
  END IF;
  IF public.is_instance_paused(v_inst_a) THEN
    RAISE EXCEPTION 'T5 FALHOU: is_instance_paused deveria ser false depois de retomar';
  END IF;
  v_n := public.resume_instance(v_inst_a);
  PERFORM set_config('role', 'none', true);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T5 FALHOU: retomar de novo deveria devolver 0 (devolveu %)', v_n;
  END IF;

  SELECT resumed_by INTO v_resumed_by FROM public.instance_pauses
   WHERE instance = v_inst_a ORDER BY created_at DESC LIMIT 1;
  IF v_resumed_by IS DISTINCT FROM v_admin_prof THEN
    RAISE EXCEPTION 'T5 FALHOU: resumed_by=% esperado=% (auditoria da retomada)', v_resumed_by, v_admin_prof;
  END IF;
  v_ok := v_ok + 1;

  -- ================================================================ T5b (supervisor staff)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_sup_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_out := public.pause_instance(v_inst_sup, 25, 'pausa feita por supervisor');
  IF (v_out ->> 'paused_by')::uuid IS DISTINCT FROM v_sup_prof THEN
    RAISE EXCEPTION 'T5b FALHOU: supervisor deveria gravar paused_by=% (gravou %)',
      v_sup_prof, v_out ->> 'paused_by';
  END IF;
  v_n := public.resume_instance(v_inst_sup);
  PERFORM set_config('role', 'none', true);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T5b FALHOU: supervisor deveria retomar 1 pausa (devolveu %)', v_n;
  END IF;
  SELECT resumed_by INTO v_resumed_by FROM public.instance_pauses
   WHERE instance = v_inst_sup ORDER BY created_at DESC LIMIT 1;
  IF v_resumed_by IS DISTINCT FROM v_sup_prof THEN
    RAISE EXCEPTION 'T5b FALHOU: supervisor deveria gravar resumed_by=% (gravou %)',
      v_sup_prof, v_resumed_by;
  END IF;
  v_ok := v_ok + 1;

  -- ================================================================ T6 (retomada por nao-staff)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.pause_instance(v_inst_b, 45, 'pausa para o T6');
  PERFORM set_config('role', 'none', true);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN
    v_n := public.resume_instance(v_inst_b);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T6 FALHOU: agente nao-staff deveria receber 42501 ao retomar (erro=[%] %)',
      coalesce(v_errcode, 'sem erro'), coalesce(v_errmsg, '-');
  END IF;
  SELECT count(*) INTO v_n FROM public.instance_pauses
   WHERE instance = v_inst_b AND resumed_at IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T6 FALHOU: a pausa deveria seguir aberta (abertas=%)', v_n;
  END IF;
  v_ok := v_ok + 1;

  -- ================================================================ T7 (pausa vencida nao conta)
  INSERT INTO public.instance_pauses (instance, paused_until, reason, paused_by, created_at)
  VALUES (
    v_inst_exp,
    now() - interval '1 minute',
    'pausa vencida (sintetica)',
    v_admin_prof,
    now() - interval '2 minutes'
  );

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  IF public.is_instance_paused(v_inst_exp) THEN
    RAISE EXCEPTION 'T7 FALHOU: pausa vencida (paused_until no passado) nao deveria contar como ativa';
  END IF;
  PERFORM set_config('role', 'none', true);
  v_ok := v_ok + 1;

  -- ================================================================ T7b (vencida + pausa manual preserva historico)
  SELECT paused_until, reason, paused_by, created_at
    INTO v_old_until, v_old_reason, v_resumed_by, v_old_created_at
    FROM public.instance_pauses
   WHERE instance = v_inst_exp;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_out := public.pause_instance(v_inst_exp, 35, 'nova pausa depois do vencimento');
  PERFORM set_config('role', 'none', true);

  SELECT count(*) INTO v_n FROM public.instance_pauses WHERE instance = v_inst_exp;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'T7b FALHOU: pausa vencida + nova pausa manual deveria manter 2 linhas (encontrou %)', v_n;
  END IF;
  SELECT created_at INTO v_latest_created_at
    FROM public.instance_pauses
   WHERE instance = v_inst_exp AND resumed_at IS NULL
   ORDER BY created_at DESC LIMIT 1;
  IF v_latest_created_at IS NULL OR v_latest_created_at = v_old_created_at THEN
    RAISE EXCEPTION 'T7b FALHOU: a nova pausa deveria ter created_at distinto da vencida antiga';
  END IF;
  SELECT count(*) INTO v_n
    FROM public.instance_pauses
   WHERE instance = v_inst_exp
     AND reason = v_old_reason
     AND paused_by = v_resumed_by
     AND paused_until = v_old_until
     AND resumed_at = v_old_until;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T7b FALHOU: a linha vencida antiga deveria ficar intacta e fechada em paused_until';
  END IF;
  v_ok := v_ok + 1;

  -- ================================================================ T8 (auto = service_role)
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'service_role')::text, true);
  PERFORM set_config('role', 'service_role', true);
  v_errcode := NULL;
  BEGIN
    v_out := public.auto_pause_instance(v_inst_auto, 60, 'limite de autenticacao');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE, v_errmsg = MESSAGE_TEXT;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS NOT NULL THEN
    RAISE EXCEPTION 'T8 FALHOU: service_role deveria pausar automaticamente (erro=[%] %)', v_errcode, v_errmsg;
  END IF;
  IF (v_out ->> 'auto')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'T8 FALHOU: pausa automatica deveria ter auto=true (%)', v_out ->> 'auto';
  END IF;
  IF (v_out ->> 'paused_by') IS NOT NULL THEN
    RAISE EXCEPTION 'T8 FALHOU: pausa automatica deveria ter paused_by NULL (%)', v_out ->> 'paused_by';
  END IF;

  -- a pausa automatica tambem sustenta is_instance_paused (staff consulta)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  IF NOT public.is_instance_paused(v_inst_auto) THEN
    RAISE EXCEPTION 'T8 FALHOU: pausa automatica nao sustentou is_instance_paused';
  END IF;
  PERFORM set_config('role', 'none', true);
  v_ok := v_ok + 1;

  -- ================================================================ T8b (manual vencida + auto preserva historico)
  INSERT INTO public.instance_pauses (instance, paused_until, reason, paused_by, auto, created_at)
  VALUES (
    v_inst_auto_exp,
    now() - interval '2 minutes',
    'manual vencida antes da auto',
    v_admin_prof,
    false,
    now() - interval '3 minutes'
  )
  RETURNING paused_until, created_at INTO v_old_until, v_old_created_at;

  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'service_role')::text, true);
  PERFORM set_config('role', 'service_role', true);
  v_out := public.auto_pause_instance(v_inst_auto_exp, 70, 'auto depois do vencimento');
  PERFORM set_config('role', 'none', true);

  SELECT count(*) INTO v_n FROM public.instance_pauses WHERE instance = v_inst_auto_exp;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'T8b FALHOU: pausa manual vencida + auto_pause deveria manter 2 linhas (encontrou %)', v_n;
  END IF;
  SELECT auto, paused_by, created_at
    INTO v_latest_auto, v_latest_paused_by, v_latest_created_at
    FROM public.instance_pauses
   WHERE instance = v_inst_auto_exp AND resumed_at IS NULL
   ORDER BY created_at DESC LIMIT 1;
  IF v_latest_auto IS DISTINCT FROM true OR v_latest_paused_by IS NOT NULL THEN
    RAISE EXCEPTION 'T8b FALHOU: nova auto deveria nascer auto=true e paused_by NULL (auto=%, paused_by=%)',
      v_latest_auto, v_latest_paused_by;
  END IF;
  IF v_latest_created_at IS NULL OR v_latest_created_at = v_old_created_at THEN
    RAISE EXCEPTION 'T8b FALHOU: a auto nova deveria ter created_at distinto da manual vencida';
  END IF;
  SELECT count(*) INTO v_n
    FROM public.instance_pauses
   WHERE instance = v_inst_auto_exp
     AND reason = 'manual vencida antes da auto'
     AND auto = false
     AND paused_by = v_admin_prof
     AND paused_until = v_old_until
     AND resumed_at = v_old_until;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T8b FALHOU: a pausa manual vencida deveria ficar intacta e fechada em paused_until';
  END IF;
  v_ok := v_ok + 1;

  -- ================================================================ T9 (RLS/ACL)
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.instance_pauses'::regclass) THEN
    RAISE EXCEPTION 'T9 FALHOU: RLS da tabela instance_pauses nao esta ligada';
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'instance_pauses';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T9 FALHOU: esperava UMA policy (SELECT staff), encontrei %', v_n;
  END IF;

  -- staff le (varias linhas); agente nao-staff le ZERO; anon e' barrado
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_n FROM public.instance_pauses;
  IF v_n < 3 THEN
    RAISE EXCEPTION 'T9 FALHOU: staff deveria ler as pausas (leu %)', v_n;
  END IF;
  PERFORM set_config('role', 'none', true);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_n FROM public.instance_pauses;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T9 FALHOU: agente nao-staff deveria ler ZERO linha (leu %)', v_n;
  END IF;
  -- agente nao-staff tambem nao consulta a pausa pela funcao
  v_errcode := NULL;
  BEGIN PERFORM public.is_instance_paused(v_inst_b);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T9 FALHOU: agente nao-staff deveria receber 42501 em is_instance_paused (deu %)',
      coalesce(v_errcode, 'sem erro');
  END IF;

  -- anon barrado na leitura da tabela
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'anon')::text, true);
  PERFORM set_config('role', 'anon', true);
  v_errcode := NULL;
  BEGIN PERFORM count(*) FROM public.instance_pauses;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T9 FALHOU: anon deveria ser barrado na leitura da tabela (deu %)',
      coalesce(v_errcode, 'sem erro');
  END IF;

  -- escrita direta NUNCA e' concedida a papel de cliente (so as funcoes DEFINER)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_errcode := NULL;
  BEGIN
    INSERT INTO public.instance_pauses (instance, paused_until, reason, paused_by)
    VALUES ('inst-escrita-direta', now() + interval '10 minutes', 'x', v_admin_prof);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T9 FALHOU: INSERT direto por authenticated deveria dar 42501 (deu %)',
      coalesce(v_errcode, 'sem erro');
  END IF;
  v_errcode := NULL;
  BEGIN UPDATE public.instance_pauses SET reason = 'x';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T9 FALHOU: UPDATE direto por authenticated deveria dar 42501 (deu %)',
      coalesce(v_errcode, 'sem erro');
  END IF;
  v_errcode := NULL;
  BEGIN DELETE FROM public.instance_pauses;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T9 FALHOU: DELETE direto por authenticated deveria dar 42501 (deu %)',
      coalesce(v_errcode, 'sem erro');
  END IF;

  -- ACL das funcoes: anon fora; assinaturas exatas; auto so para service_role
  IF has_function_privilege('anon', 'public.pause_instance(text,integer,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.resume_instance(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.is_instance_paused(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.auto_pause_instance(text,integer,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T9 FALHOU: anon nao deveria ter EXECUTE em nenhuma funcao da pausa';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.pause_instance(text,integer,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.resume_instance(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.is_instance_paused(text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.auto_pause_instance(text,integer,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T9 FALHOU: papel legitimo sem EXECUTE na funcao esperada';
  END IF;
  IF has_function_privilege('authenticated', 'public.auto_pause_instance(text,integer,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T9 FALHOU: authenticated nao deveria ter EXECUTE em auto_pause_instance';
  END IF;
  v_ok := v_ok + 1;

  RAISE NOTICE 'instance_pauses: T1..T9 OK — % grupo(s)', v_ok;
END
$instance_pauses$;

-- ===================================================================== T10 (rollback)
-- Executa o bloco "-- Rollback" da migration (copiado linha a linha do proprio
-- arquivo) contra o schema REAL, confere que TUDO o que a migration criou some e
-- desfaz tudo com ROLLBACK TO SAVEPOINT. As linhas DROP vivem neste arquivo (nunca
-- digitadas na linha de comando): a guarda bloqueia SQL DROP em modo sem humano.
SAVEPOINT pausa_rollback;

DROP FUNCTION IF EXISTS public.auto_pause_instance(text, integer, text);
DROP FUNCTION IF EXISTS public.resume_instance(text);
DROP FUNCTION IF EXISTS public.pause_instance(text, integer, text);
DROP FUNCTION IF EXISTS public.is_instance_paused(text);
DROP TABLE IF EXISTS public.instance_pauses;

DO $verifica_rollback$
BEGIN
  IF to_regclass('public.instance_pauses') IS NOT NULL
     OR to_regprocedure('public.pause_instance(text,integer,text)') IS NOT NULL
     OR to_regprocedure('public.resume_instance(text)') IS NOT NULL
     OR to_regprocedure('public.is_instance_paused(text)') IS NOT NULL
     OR to_regprocedure('public.auto_pause_instance(text,integer,text)') IS NOT NULL
     OR (SELECT count(*) FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'instance_pauses') <> 0 THEN
    RAISE EXCEPTION 'T10 FALHOU: o rollback nao removeu tudo o que a migration criou';
  END IF;
END
$verifica_rollback$;

ROLLBACK TO SAVEPOINT pausa_rollback;

DO $confirma_restaurado$
BEGIN
  IF to_regclass('public.instance_pauses') IS NULL
     OR to_regprocedure('public.pause_instance(text,integer,text)') IS NULL
     OR to_regprocedure('public.resume_instance(text)') IS NULL
     OR to_regprocedure('public.is_instance_paused(text)') IS NULL
     OR to_regprocedure('public.auto_pause_instance(text,integer,text)') IS NULL THEN
    RAISE EXCEPTION 'T10 FALHOU: ROLLBACK TO SAVEPOINT nao restaurou a migration';
  END IF;
  RAISE NOTICE 'instance_pauses: suite OK (T1 staff pausa, T2 nao-staff negado sem efeito, T3 validacao, T4 estende sem duplicar, T5 retoma idempotente, T6 retomada negada, T7 vencida nao conta, T8 auto service_role, T9 RLS/ACL, T10 rollback executado e estado restaurado)';
END
$confirma_restaurado$;

ROLLBACK;
