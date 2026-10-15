-- instance_pause_investigation (IP2, filho do IP1): suite no banco LOCAL, papel real via
-- request.jwt.claims + set_config('role') (caminho do PostgREST); tudo desfeito no ROLLBACK final.
-- T1 investiga+audita sem copiar notas; T2 negado (3 papeis) sem efeito/auditoria;
-- T3 validacao funcao+CHECKs; T4 P0002; T5 3 auditorias (1/chamada), 1o ator congela;
-- T5b supervisor; T6 RLS/ACL; T7 rollback. (Serie 24h/7d separada no cartao-filho t_e75e24e9.)
-- RODAR: zapp-db-local psql . v2-26101315358410 -v ON_ERROR_STOP=1 < este arquivo
BEGIN;
-- atalho de papel (1 linha por troca).
CREATE TEMPORARY FUNCTION t_auth(p_sub uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  SELECT set_config('role', 'authenticated', true);
$$;

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
  v_out        jsonb;
  v_at1        timestamptz;
  v_by1        uuid;
  v_errcode    text;
  v_errmsg     text;
  v_n          int;
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

  -- T1 (admin investiga)
  PERFORM t_auth(v_admin_user);
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

  -- T2 (sem permissao = sem efeito)
  PERFORM t_auth(v_agent_user);
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

  -- T3 (validacao)
  PERFORM t_auth(v_admin_user);
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

  -- T4 (pausa inexistente)
  PERFORM t_auth(v_admin_user);
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

  -- T5 (idempotencia + auditoria)
  PERFORM t_auth(v_admin_user);
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

  PERFORM t_auth(v_admin_user);
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

  -- T5b (supervisor)
  PERFORM t_auth(v_sup_user);
  v_out := public.mark_pause_investigated(v_pause_4, 'supervisor conferiu');
  PERFORM set_config('role', 'none', true);
  IF (v_out ->> 'investigated_by')::uuid IS DISTINCT FROM v_sup_prof THEN
    RAISE EXCEPTION 'T5b FALHOU: investigated_by=% esperado=perfil do supervisor (%)',
      v_out ->> 'investigated_by', v_sup_prof;
  END IF;
  v_ok := v_ok + 1;

  -- T6 (RLS/ACL)
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.instance_pauses'::regclass) THEN
    RAISE EXCEPTION 'T6 FALHOU: RLS desligada na tabela de pausas';
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'instance_pauses';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T6 FALHOU: a migration nao deve mudar as policies da tabela de pausas (achei %)', v_n;
  END IF;

  IF has_function_privilege('anon', 'public.mark_pause_investigated(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T6 FALHOU: anon nao deveria ter EXECUTE na funcao nova';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.mark_pause_investigated(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T6 FALHOU: authenticated deveria ter EXECUTE na funcao nova';
  END IF;

  -- escrita direta segue negada ao papel de cliente
  PERFORM t_auth(v_admin_user);
  v_errcode := NULL;
  BEGIN
    UPDATE public.instance_pauses SET investigation_notes = 'x' WHERE id = v_pause_1;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errcode = RETURNED_SQLSTATE; END;
  PERFORM set_config('role', 'none', true);
  IF v_errcode IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'T6 FALHOU: UPDATE direto por authenticated deveria dar 42501 (deu %)',
      coalesce(v_errcode, 'sem erro');
  END IF;
  IF has_table_privilege('authenticated', 'public.instance_pauses', 'INSERT')
     OR has_table_privilege('authenticated', 'public.instance_pauses', 'DELETE') THEN
    RAISE EXCEPTION 'T6 FALHOU: a migration concedeu escrita direta na tabela de pausas';
  END IF;

  -- as 3 colunas existem e sao anulaveis
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'instance_pauses'
     AND column_name IN ('investigated_at','investigated_by','investigation_notes')
     AND is_nullable = 'YES';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'T6 FALHOU: colunas de investigacao ausentes ou nao anulaveis (achei %)', v_n;
  END IF;
  v_ok := v_ok + 1;

  RAISE NOTICE 'instance_pause_investigation: T1..T6 OK — % grupo(s)', v_ok;
END
$pause_investigation$;

-- T7 (rollback): executa o -- Rollback: da migration no schema REAL e desfaz com SAVEPOINT.
SAVEPOINT investigation_rollback;

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
     OR EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'instance_pauses'
                   AND column_name IN ('investigated_at','investigated_by','investigation_notes'))
     OR EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.instance_pauses'::regclass
                   AND conname IN ('instance_pauses_investigacao_completa',
                                   'instance_pauses_notas_tamanho',
                                   'instance_pauses_notas_sem_html')) THEN
    RAISE EXCEPTION 'T7 FALHOU: o rollback nao removeu tudo o que a migration criou';
  END IF;
END
$verifica_rollback$;

ROLLBACK TO SAVEPOINT investigation_rollback;

DO $confirma_restaurado$
BEGIN
  IF to_regprocedure('public.mark_pause_investigated(uuid,text)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'instance_pauses'
                       AND column_name = 'investigated_at') THEN
    RAISE EXCEPTION 'T7 FALHOU: ROLLBACK TO SAVEPOINT nao restaurou a migration';
  END IF;
  RAISE NOTICE 'instance_pause_investigation: suite OK — T1..T7 (investigacao com ator, negado sem efeito, validacao, pausa inexistente, idempotencia, supervisor, RLS/ACL, rollback)';
END
$confirma_restaurado$;

ROLLBACK;
