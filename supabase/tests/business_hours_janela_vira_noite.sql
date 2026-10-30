-- ============================================================================
-- business_hours_janela_vira_noite — janela de horário que cruza a meia-noite
--
-- DEFEITO QUE ESTE TESTE TRAVA: public.is_within_business_hours(uuid) decidia
-- com `agora >= open_time AND agora <= close_time`. Numa janela que vira a noite
-- (open_time > close_time, ex.: 18:00 -> 02:00) essa condição é impossível de
-- satisfazer: a função respondia FALSO o dia inteiro, inclusive às 19h e à 1h —
-- o horário de atendimento configurado nunca abria. O `<=` também tratava o
-- minuto do close_time como ABERTO.
--
-- O QUE PROVA (critério de pronto), na ordem:
--   T1  vira a noite e CONTÉM agora (open = agora+60') ....... true   [vermelho antes]
--   T2  vira a noite e CONTÉM agora (open = agora-30') ....... true   [vermelho antes]
--   T3  vira a noite e EXCLUI agora .......................... false
--   T4  janela normal (não vira a noite) contendo agora ...... true
--   T5  janela normal (não vira a noite) excluindo agora ..... false
--   T6  close_time == agora: fechamento EXCLUSIVO ............ false  [vermelho antes]
--   T7  open_time == agora: abertura INCLUSIVA ............... true
--   T8  is_open = false ..................................... false
--   T9  conexão sem configuração ............................. true (padrão preservado)
--   T10 authenticated SEM perfil ................... negado 42501 (guarda preservada)
--   T11 anon ....................................... negado (EXECUTE revogado)
--   T12 ACL: authenticated/service_role podem; anon/PUBLIC não
--   T13 estrutura: SECURITY DEFINER com pg_temp no search_path
--
-- DETERMINÍSTICO A QUALQUER HORA: as janelas são construídas em cima do minuto
-- atual de America/Sao_Paulo (a mesma zona que a função usa), então a prova não
-- depende da hora em que o arquivo roda. T1, T2 e T6 são o vermelho: com o corpo
-- antigo elas falham em qualquer hora do dia.
--
-- PAPEL REAL: as asserções rodam com `SET LOCAL ROLE` (authenticated / anon) e
-- request.jwt.claims sintético — nunca como postgres, que tem BYPASSRLS.
--
-- COMO RODA (a partir da RAIZ do repositório, contra o banco local da tarefa):
--   zapp-db-local psql . <nome-do-conjunto> < supabase/tests/business_hours_janela_vira_noite.sql
-- Tudo numa transação que termina em ROLLBACK: idempotente, sem efeito colateral.
-- ============================================================================
\set ON_ERROR_STOP on

BEGIN;

-- ------------------------------------------------------------------ fixtures
-- Janelas relativas ao minuto atual de São Paulo (mm), montadas para valer em
-- qualquer hora. mm+NNN e mm-NNN passam pelo módulo 1440 (minutos do dia).
CREATE TEMP TABLE w ON COMMIT DROP AS
SELECT
  mm,
  extract(dow from now() at time zone 'America/Sao_Paulo')::int AS dow,
  -- A1: vira a noite, CONTÉM agora pela ponta do close (open = agora+60, close = agora+30)
  ((mm + 60) % 1440)  AS a1_open,
  ((mm + 30) % 1440)  AS a1_close,
  -- A2: vira a noite, CONTÉM agora pela ponta do open (open = agora-30, close = agora-60)
  ((mm + 1410) % 1440) AS a2_open,
  ((mm + 1380) % 1440) AS a2_close,
  -- B: vira a noite, EXCLUI agora (open = agora+30, close = agora-30)
  ((mm + 30) % 1440)  AS b_open,
  ((mm + 1410) % 1440) AS b_close,
  -- C: normal, CONTÉM agora
  CASE WHEN mm >= 60 THEN mm - 60 ELSE 0 END AS c_open,
  -- D: normal, EXCLUI agora
  CASE WHEN mm <= 1437 THEN mm + 1 ELSE 0 END AS d_open,
  CASE WHEN mm <= 1437 THEN mm + 2 ELSE mm - 1 END AS d_close
FROM (
  SELECT extract(hour from now() at time zone 'America/Sao_Paulo')::int * 60
       + extract(minute from now() at time zone 'America/Sao_Paulo')::int AS mm
) s;

DO $fixture$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                  WHERE user_id = '00000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'fixture: identidade do admin semeado ausente; rode este arquivo no banco local da tarefa (zapp-db-local)';
  END IF;
END $fixture$;

-- Conexões sintéticas de WhatsApp (o fixture roda como postgres; a prova roda como papel real).
INSERT INTO public.whatsapp_connections (id, name, phone_number) VALUES
  ('a0000000-0000-4000-8000-000000000001','prova-a1','5500000000101'),
  ('a0000000-0000-4000-8000-000000000002','prova-a2','5500000000102'),
  ('a0000000-0000-4000-8000-000000000003','prova-b','5500000000103'),
  ('a0000000-0000-4000-8000-000000000004','prova-c','5500000000104'),
  ('a0000000-0000-4000-8000-000000000005','prova-d','5500000000105'),
  ('a0000000-0000-4000-8000-000000000006','prova-e','5500000000106'),
  ('a0000000-0000-4000-8000-000000000007','prova-f','5500000000107'),
  ('a0000000-0000-4000-8000-000000000008','prova-g','5500000000108');

-- A1/A2/B/C/D: linha do dia de hoje com a janela construída acima.
INSERT INTO public.business_hours (whatsapp_connection_id, day_of_week, is_open, open_time, close_time)
SELECT 'a0000000-0000-4000-8000-000000000001'::uuid, dow, true,
       make_time(((a1_open % 1440) / 60)::int, ((a1_open % 1440) % 60)::int, 0),
       make_time(((a1_close % 1440) / 60)::int, ((a1_close % 1440) % 60)::int, 0) FROM w
UNION ALL
SELECT 'a0000000-0000-4000-8000-000000000002'::uuid, dow, true,
       make_time(((a2_open % 1440) / 60)::int, ((a2_open % 1440) % 60)::int, 0),
       make_time(((a2_close % 1440) / 60)::int, ((a2_close % 1440) % 60)::int, 0) FROM w
UNION ALL
SELECT 'a0000000-0000-4000-8000-000000000003'::uuid, dow, true,
       make_time(((b_open % 1440) / 60)::int, ((b_open % 1440) % 60)::int, 0),
       make_time(((b_close % 1440) / 60)::int, ((b_close % 1440) % 60)::int, 0) FROM w
UNION ALL
SELECT 'a0000000-0000-4000-8000-000000000004'::uuid, dow, true,
       make_time(((c_open % 1440) / 60)::int, ((c_open % 1440) % 60)::int, 0),
       CASE WHEN mm <= 1379
            THEN make_time((((mm + 60) % 1440) / 60)::int, (((mm + 60) % 1440) % 60)::int, 0)
            ELSE TIME '23:59:59.999999' END FROM w
UNION ALL
SELECT 'a0000000-0000-4000-8000-000000000005'::uuid, dow, true,
       make_time(((d_open % 1440) / 60)::int, ((d_open % 1440) % 60)::int, 0),
       make_time(((d_close % 1440) / 60)::int, ((d_close % 1440) % 60)::int, 0) FROM w
UNION ALL
-- E: close_time é EXATAMENTE o agora (fechamento exclusivo)
SELECT 'a0000000-0000-4000-8000-000000000006'::uuid, dow, true,
       TIME '00:00', (now() at time zone 'America/Sao_Paulo')::time FROM w
UNION ALL
-- F: open_time é o minuto do agora (abertura inclusiva)
SELECT 'a0000000-0000-4000-8000-000000000007'::uuid, dow, true,
       make_time((mm / 60)::int, (mm % 60)::int, 0),
       CASE WHEN mm <= 1409
            THEN make_time((((mm + 30) % 1440) / 60)::int, (((mm + 30) % 1440) % 60)::int, 0)
            ELSE TIME '23:59:59.999999' END FROM w
UNION ALL
-- G: linha do dia com is_open = false
SELECT 'a0000000-0000-4000-8000-000000000008'::uuid, dow, false,
       TIME '00:00', TIME '23:59:59.999999' FROM w
;

-- ------------------------------------------------------------------ asserções
DO $prova$
DECLARE
  v_falhas integer := 0;
  v_bool   boolean;
  v_n      integer;
  v_txt    text;
  v_msg    text;
  v_negado boolean;
BEGIN
  ------------------------------------------------- T1 vira a noite, DENTRO
  -- [vermelho antes] com o corpo antigo (>= open AND <= close) isto é impossível: false
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
    SELECT public.is_within_business_hours('a0000000-0000-4000-8000-000000000001') INTO v_bool;
    RESET ROLE;
    IF v_bool IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'janela que vira a noite contendo o agora devolveu % (esperado true)', coalesce(v_bool::text,'NULL');
    END IF;
    RAISE NOTICE 'T1 OK  janela que vira a noite e contem o agora -> true (ponta do close)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T1 FALHOU: %', SQLERRM;
  END;

  ------------------------------------------------- T2 vira a noite, DENTRO
  -- [vermelho antes] mesma janela com o agora na ponta do open
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
    SELECT public.is_within_business_hours('a0000000-0000-4000-8000-000000000002') INTO v_bool;
    RESET ROLE;
    IF v_bool IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'janela que vira a noite (ponta do open) devolveu % (esperado true)', coalesce(v_bool::text,'NULL');
    END IF;
    RAISE NOTICE 'T2 OK  janela que vira a noite e contem o agora -> true (ponta do open)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T2 FALHOU: %', SQLERRM;
  END;

  ------------------------------------------------- T3 vira a noite, FORA
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
    SELECT public.is_within_business_hours('a0000000-0000-4000-8000-000000000003') INTO v_bool;
    RESET ROLE;
    IF v_bool IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'janela que vira a noite FORA do agora devolveu % (esperado false)', coalesce(v_bool::text,'NULL');
    END IF;
    RAISE NOTICE 'T3 OK  janela que vira a noite mas exclui o agora -> false';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T3 FALHOU: %', SQLERRM;
  END;

  ------------------------------------------------- T4 janela normal, DENTRO
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
    SELECT public.is_within_business_hours('a0000000-0000-4000-8000-000000000004') INTO v_bool;
    RESET ROLE;
    IF v_bool IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'janela normal contendo o agora devolveu % (esperado true)', coalesce(v_bool::text,'NULL');
    END IF;
    RAISE NOTICE 'T4 OK  janela normal (nao vira a noite) contendo o agora -> true';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T4 FALHOU: %', SQLERRM;
  END;

  ------------------------------------------------- T5 janela normal, FORA
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
    SELECT public.is_within_business_hours('a0000000-0000-4000-8000-000000000005') INTO v_bool;
    RESET ROLE;
    IF v_bool IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'janela normal fora do agora devolveu % (esperado false)', coalesce(v_bool::text,'NULL');
    END IF;
    RAISE NOTICE 'T5 OK  janela normal (nao vira a noite) excluindo o agora -> false';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T5 FALHOU: %', SQLERRM;
  END;

  ------------------------------------------- T6 close_time == agora: EXCLUSIVO
  -- [vermelho antes] com `<=` o instante do fechamento contava como ABERTO
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
    SELECT public.is_within_business_hours('a0000000-0000-4000-8000-000000000006') INTO v_bool;
    RESET ROLE;
    IF v_bool IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'no instante exato do close_time devolveu % (esperado false: fechamento exclusivo)', coalesce(v_bool::text,'NULL');
    END IF;
    RAISE NOTICE 'T6 OK  close_time == agora -> false (fechamento exclusivo)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T6 FALHOU: %', SQLERRM;
  END;

  -------------------------------------------- T7 open_time == agora: INCLUSIVO
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
    SELECT public.is_within_business_hours('a0000000-0000-4000-8000-000000000007') INTO v_bool;
    RESET ROLE;
    IF v_bool IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'no minuto do open_time devolveu % (esperado true: abertura inclusiva)', coalesce(v_bool::text,'NULL');
    END IF;
    RAISE NOTICE 'T7 OK  open_time == agora -> true (abertura inclusiva)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T7 FALHOU: %', SQLERRM;
  END;

  ---------------------------------------------------------------- T8 is_open
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
    SELECT public.is_within_business_hours('a0000000-0000-4000-8000-000000000008') INTO v_bool;
    RESET ROLE;
    IF v_bool IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'dia marcado como fechado (is_open=false) devolveu % (esperado false)', coalesce(v_bool::text,'NULL');
    END IF;
    RAISE NOTICE 'T8 OK  dia com is_open=false -> false';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T8 FALHOU: %', SQLERRM;
  END;

  ------------------------------------------- T9 conexão sem configuração
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
    SELECT public.is_within_business_hours('a0000000-0000-4000-8000-000000000009') INTO v_bool;
    RESET ROLE;
    IF v_bool IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'conexao sem configuracao devolveu % (esperado true: padrao preservado)', coalesce(v_bool::text,'NULL');
    END IF;
    RAISE NOTICE 'T9 OK  conexao sem configuracao -> true (padrao preservado)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T9 FALHOU: %', SQLERRM;
  END;

  --------------------------------- T10 authenticated SEM perfil: guarda viva
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"e0000000-0000-4000-8000-0000000000ee","role":"authenticated"}', true);
    v_negado := false; v_msg := NULL;
    BEGIN
      PERFORM public.is_within_business_hours('a0000000-0000-4000-8000-000000000001');
    EXCEPTION WHEN OTHERS THEN
      v_negado := true; v_msg := SQLERRM;
    END;
    RESET ROLE;
    IF NOT v_negado OR position('chamador sem sessao de usuario' IN coalesce(v_msg,'')) = 0 THEN
      RAISE EXCEPTION 'authenticated sem perfil nao foi negado pela guarda (negado=%, msg=%)', v_negado, coalesce(v_msg,'NULL');
    END IF;
    RAISE NOTICE 'T10 OK authenticated sem perfil negado pela guarda (42501)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T10 FALHOU: %', SQLERRM;
  END;

  --------------------------------------------------------------- T11 anon
  BEGIN
    SET LOCAL ROLE anon;
    v_negado := false; v_msg := NULL;
    BEGIN
      PERFORM public.is_within_business_hours('a0000000-0000-4000-8000-000000000001');
    EXCEPTION WHEN OTHERS THEN
      v_negado := true; v_msg := SQLERRM;
    END;
    RESET ROLE;
    IF NOT v_negado THEN
      RAISE EXCEPTION 'anon chamou is_within_business_hours';
    END IF;
    RAISE NOTICE 'T11 OK anon negado (EXECUTE nao concedido): %', v_msg;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T11 FALHOU: %', SQLERRM;
  END;

  -------------------------------------------------------- T12 ACL explicita
  BEGIN
    IF NOT has_function_privilege('authenticated','public.is_within_business_hours(uuid)','EXECUTE') THEN
      RAISE EXCEPTION 'authenticated NAO tem EXECUTE';
    END IF;
    IF NOT has_function_privilege('service_role','public.is_within_business_hours(uuid)','EXECUTE') THEN
      RAISE EXCEPTION 'service_role NAO tem EXECUTE';
    END IF;
    IF has_function_privilege('anon','public.is_within_business_hours(uuid)','EXECUTE') THEN
      RAISE EXCEPTION 'anon TEM EXECUTE';
    END IF;
    SELECT count(*) INTO v_n
      FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = 'public.is_within_business_hours(uuid)'::regprocedure
       AND a.grantee = 0 AND a.privilege_type = 'EXECUTE';
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'PUBLIC (grantee 0) tem EXECUTE na funcao';
    END IF;
    RAISE NOTICE 'T12 OK ACL: authenticated/service_role podem; anon e PUBLIC nao';
  EXCEPTION WHEN OTHERS THEN
    v_falhas := v_falhas + 1;
    RAISE NOTICE 'T12 FALHOU: %', SQLERRM;
  END;

  ------------------------------------------------------- T13 estrutura
  BEGIN
    SELECT p.prosecdef, array_to_string(p.proconfig, ',') INTO v_bool, v_txt
      FROM pg_proc p WHERE p.oid = 'public.is_within_business_hours(uuid)'::regprocedure;
    IF v_bool IS NOT TRUE THEN
      RAISE EXCEPTION 'a funcao deixou de ser SECURITY DEFINER';
    END IF;
    IF position('pg_temp' IN coalesce(v_txt,'')) = 0 THEN
      RAISE EXCEPTION 'search_path sem pg_temp: %', coalesce(v_txt,'NULL');
    END IF;
    RAISE NOTICE 'T13 OK SECURITY DEFINER e search_path com pg_temp (%)', v_txt;
  EXCEPTION WHEN OTHERS THEN
    v_falhas := v_falhas + 1;
    RAISE NOTICE 'T13 FALHOU: %', SQLERRM;
  END;

  IF v_falhas > 0 THEN
    RAISE EXCEPTION 'PROVA FALHOU: % de 13 verificacoes falharam', v_falhas;
  END IF;
  RAISE NOTICE 'PROVA OK: 13 de 13 verificacoes passaram';
END $prova$;

ROLLBACK;
\echo 'SUITE VERDE: business_hours_janela_vira_noite'
