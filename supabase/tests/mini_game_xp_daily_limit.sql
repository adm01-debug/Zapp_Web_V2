-- mini_game_xp_daily_limit — prova da RPC public.credit_agent_mini_game_xp e da
-- tabela public.agent_mini_game_xp_daily no banco REAL local da tarefa.
--
-- Roda SOMENTE no banco local (zapp-db-local), nunca em produção.
-- Tudo dentro de BEGIN ... ROLLBACK: nao deixa lixo no banco da tarefa.
-- Cada asserção falha com RAISE EXCEPTION (com ON_ERROR_STOP o comando sai != 0).
--
-- Como rodar (na raiz do workspace; NOME = DB_LOCAL do .hermes-tarefa):
--   { echo '\set ON_ERROR_STOP on'; cat supabase/tests/mini_game_xp_daily_limit.sql; } \
--     | zapp-db-local psql . <NOME>
--
-- A prova de CONCORRÊNCIA (duas sessões em paralelo) fica em
-- supabase/tests/mini_game_xp_daily_limit_race.sh.

BEGIN;

DO $$
DECLARE
  v_profile   uuid;
  v_xp0       bigint;
  v_xp        bigint;
  v_res       json;
  v_partidas  integer;
  v_xp_total  bigint;
  v_count     integer;
BEGIN
  -- Perfil de prova: o primeiro com agent_stats; se nao houver, cria stats para
  -- o primeiro profiles.id; se nem profiles existir, falha (proibido pular).
  SELECT s.profile_id INTO v_profile FROM public.agent_stats s LIMIT 1;
  IF v_profile IS NULL THEN
    SELECT p.id INTO v_profile FROM public.profiles p LIMIT 1;
    IF v_profile IS NULL THEN
      RAISE EXCEPTION 'setup FALHOU: nenhum profiles.id no banco local';
    END IF;
    INSERT INTO public.agent_stats (profile_id) VALUES (v_profile);
  END IF;

  SELECT s.xp INTO v_xp0 FROM public.agent_stats s WHERE s.profile_id = v_profile;
  RAISE NOTICE 'PASS|setup|perfil=% xp_inicial=%', v_profile, v_xp0;

  -- 1-2. cinco chamadas de 33 XP: todas creditam.
  FOR i IN 1..5 LOOP
    v_res := public.credit_agent_mini_game_xp(v_profile, 'quiz', 33);
    IF (v_res->>'credited')::boolean IS NOT TRUE
       OR (v_res->>'xpCreditado')::integer <> 33 THEN
      RAISE EXCEPTION '2 FALHOU: chamada %/5 deveria creditar 33, veio %', i, v_res;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS|1-2|cinco creditos de 33 XP aceitos';

  -- 3. xp = inicial + 165.
  SELECT s.xp INTO v_xp FROM public.agent_stats s WHERE s.profile_id = v_profile;
  IF v_xp <> v_xp0 + 165 THEN
    RAISE EXCEPTION '3 FALHOU: xp deveria ser inicial+165, delta=%', v_xp - v_xp0;
  END IF;
  RAISE NOTICE 'PASS|3|agent_stats.xp = inicial + 165';

  -- 4. 6a chamada do mesmo dia/jogo: daily_limit e xp inalterado.
  v_res := public.credit_agent_mini_game_xp(v_profile, 'quiz', 33);
  IF (v_res->>'credited')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'daily_limit' THEN
    RAISE EXCEPTION '4 FALHOU: 6a chamada deveria ser daily_limit, veio %', v_res;
  END IF;
  SELECT s.xp INTO v_xp FROM public.agent_stats s WHERE s.profile_id = v_profile;
  IF v_xp <> v_xp0 + 165 THEN
    RAISE EXCEPTION '4 FALHOU: 6a chamada alterou o xp, delta=%', v_xp - v_xp0;
  END IF;
  RAISE NOTICE 'PASS|4|6a chamada recusada (daily_limit) sem alterar xp';

  -- 5. outro mini-game no mesmo dia: o limite e POR mini-game, credita 12.
  v_res := public.credit_agent_mini_game_xp(v_profile, 'emoji-decode', 12);
  IF (v_res->>'credited')::boolean IS NOT TRUE
     OR (v_res->>'xpCreditado')::integer <> 12 THEN
    RAISE EXCEPTION '5 FALHOU: emoji-decode deveria creditar 12, veio %', v_res;
  END IF;
  SELECT s.xp INTO v_xp FROM public.agent_stats s WHERE s.profile_id = v_profile;
  IF v_xp <> v_xp0 + 177 THEN
    RAISE EXCEPTION '5 FALHOU: xp deveria ser inicial+177, delta=%', v_xp - v_xp0;
  END IF;
  RAISE NOTICE 'PASS|5|limite e por mini-game (emoji-decode creditou)';

  -- 6. xp=0: reason=zero_xp, nao credita e nao consome partida do dia.
  v_res := public.credit_agent_mini_game_xp(v_profile, 'quiz', 0);
  IF (v_res->>'credited')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'zero_xp' THEN
    RAISE EXCEPTION '6 FALHOU: xp=0 deveria ser zero_xp, veio %', v_res;
  END IF;
  SELECT s.xp INTO v_xp FROM public.agent_stats s WHERE s.profile_id = v_profile;
  IF v_xp <> v_xp0 + 177 THEN
    RAISE EXCEPTION '6 FALHOU: zero_xp alterou o xp, delta=%', v_xp - v_xp0;
  END IF;
  SELECT d.partidas INTO v_partidas FROM public.agent_mini_game_xp_daily d
   WHERE d.profile_id = v_profile AND d.game_id = 'quiz' AND d.dia = CURRENT_DATE;
  IF v_partidas <> 5 THEN
    RAISE EXCEPTION '6 FALHOU: zero_xp mexeu nas partidas do dia: %', v_partidas;
  END IF;
  RAISE NOTICE 'PASS|6|zero_xp nao credita nem consome partida';

  -- 7. linha do dia de 'quiz': partidas=5, xp_total=165.
  SELECT d.partidas, d.xp_total INTO v_partidas, v_xp_total
    FROM public.agent_mini_game_xp_daily d
   WHERE d.profile_id = v_profile AND d.game_id = 'quiz' AND d.dia = CURRENT_DATE;
  IF v_partidas <> 5 OR v_xp_total <> 165 THEN
    RAISE EXCEPTION '7 FALHOU: contador diario errado: partidas=% xp_total=%', v_partidas, v_xp_total;
  END IF;
  RAISE NOTICE 'PASS|7|contador diario: partidas=5, xp_total=165';

  -- 8. nenhuma linha passa do limite de 5.
  SELECT count(*) INTO v_count FROM public.agent_mini_game_xp_daily WHERE partidas > 5;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '8 FALHOU: % linha(s) com partidas > 5', v_count;
  END IF;
  RAISE NOTICE 'PASS|8|nenhuma linha acima de 5 partidas';

  -- 9. ACL: anon sem EXECUTE; authenticated com EXECUTE; tabela fechada para
  -- authenticated (sem SELECT/INSERT/UPDATE/DELETE).
  IF has_function_privilege('anon', 'public.credit_agent_mini_game_xp(uuid,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION '9 FALHOU: anon nao deveria ter EXECUTE na RPC';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.credit_agent_mini_game_xp(uuid,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION '9 FALHOU: authenticated deveria ter EXECUTE na RPC';
  END IF;
  IF has_table_privilege('authenticated', 'public.agent_mini_game_xp_daily', 'SELECT')
     OR has_table_privilege('authenticated', 'public.agent_mini_game_xp_daily', 'INSERT')
     OR has_table_privilege('authenticated', 'public.agent_mini_game_xp_daily', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.agent_mini_game_xp_daily', 'DELETE') THEN
    RAISE EXCEPTION '9 FALHOU: authenticated nao deveria ter privilegio na tabela';
  END IF;
  RAISE NOTICE 'PASS|9|ACL confere (anon sem EXECUTE, authenticated com EXECUTE, tabela fechada)';

  RAISE NOTICE 'mini_game_xp_daily_limit: suite OK';
END $$;

ROLLBACK;
