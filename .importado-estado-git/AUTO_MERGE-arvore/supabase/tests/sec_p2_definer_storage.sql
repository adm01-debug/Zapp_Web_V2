-- =====================================================================
-- SEC-DEFINER_GRANTS_STORAGE -02 / -03 / -04 — prova com o PAPEL REAL
-- =====================================================================
-- Roda no banco LOCAL da tarefa (Postgres de verdade, com as migrations
-- REAIS aplicadas, papéis anon/authenticated/service_role e auth.uid()
-- vindo de request.jwt.claims). Fixtures e asserções numa transação que
-- termina em ROLLBACK: zero efeito colateral, idempotente, roda quantas
-- vezes quiser. Nenhuma asserção executa como postgres: cada uma faz
-- SET LOCAL ROLE do papel real antes de tocar o objeto.
--
--   T1 (-03) agente A NÃO lê o papel de outro agente (nem id inexistente/NULL) . 0 linhas [vermelho antes]
--   T2 (-03) agente A lê o PRÓPRIO papel ...................... 1 linha
--   T3 (-03) supervisor lê o papel de outro ................... 1 linha
--   T4 (-03) uso legítimo: A atualiza o próprio perfil pela policy ... 1 linha
--   T5 (-04) TEMP TABLE business_hours hostil não sombreia a real ... true  [vermelho antes]
--   T6 (-04) TEMP TABLE profiles hostil não burla o guarda ......... nega  [vermelho antes]
--   T7 (-04) as 9 funções DEFINER com pg_temp no search_path ......... 9/9  [vermelho antes]
--   T8 (-02) agente A NÃO lê objeto com `%` de outro contato ... 0 linhas [vermelho antes]
--   T9 (-02) uso legítimo: A lê o objeto da pasta do SEU contato ...... 1 linha
--
-- Uso: zapp-db-local psql . <nome-do-banco> < supabase/tests/sec_p2_definer_storage.sql
-- (sai != 0 com "PROVA FALHOU" quando qualquer verificação falha)
\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------- fixtures
-- Inseridos como postgres (papel de serviço da sessão); a prova em si roda
-- como authenticated. UUIDs e host sintéticos (example.test).
-- O gatilho on_auth_user_created já cria a linha de public.profiles: aqui ela é
-- completada e recebe um id conhecido (nenhuma outra tabela a referencia ainda).
-- prevent_privilege_escalation exige is_admin(auth.uid()) para gravar
-- role/access_level/permissions: a fixture assume os claims do admin SEMEADO pelo
-- banco local (00000000-…-0001) APENAS enquanto grava estas linhas.
DO $fixture$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = '00000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'fixture: identidade do admin semeado ausente; rode este arquivo no banco local da tarefa (zapp-db-local)';
  END IF;
END $fixture$;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

INSERT INTO auth.users (id, email, is_sso_user, is_anonymous) VALUES
  ('11111111-1111-4111-8111-111111111111','agente.a@example.test',false,false),
  ('22222222-2222-4222-8222-222222222222','agente.b@example.test',false,false),
  ('33333333-3333-4333-8333-333333333333','supervisor.c@example.test',false,false);

UPDATE public.profiles SET name='Agente A', role='agent',
       access_level='basic', permissions='[]'::jsonb, can_download=false
 WHERE user_id='11111111-1111-4111-8111-111111111111';
UPDATE public.profiles SET name='Agente B', role='agent',
       access_level='basic', permissions='[]'::jsonb, can_download=false
 WHERE user_id='22222222-2222-4222-8222-222222222222';
UPDATE public.profiles SET name='Supervisor C', role='supervisor',
       access_level='basic', permissions='[]'::jsonb, can_download=false
 WHERE user_id='33333333-3333-4333-8333-333333333333';

INSERT INTO public.user_roles (user_id, role) VALUES ('33333333-3333-4333-8333-333333333333','supervisor');

SELECT set_config('request.jwt.claims','', true);

INSERT INTO public.contacts (id, name, phone, conversation_status, is_lid_legacy, assigned_to, created_at, updated_at) VALUES
  ('c0000000-0000-4000-8000-00000000000a','Contato A','5500000000001','open',false,
   (SELECT id FROM public.profiles WHERE user_id='11111111-1111-4111-8111-111111111111'), now(), now()),
  ('c0000000-0000-4000-8000-00000000000b','Contato B','5500000000002','open',false,
   (SELECT id FROM public.profiles WHERE user_id='22222222-2222-4222-8222-222222222222'), now(), now());

-- Mensagem do PRÓPRIO agente A (contato dele) cuja media_url casa com o
-- curinga da policy defeituosa: o objeto alvo chama-se `image/msg%1.jpg` e o
-- padrão `'%/' || objects.name` = `%/image/msg%1.jpg` casa com `.../msgZ1.jpg`.
INSERT INTO public.messages (id, contact_id, sender, content, message_type, media_url, created_at, updated_at) VALUES
  ('70000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-00000000000a','agent','prova -02','image',
   'https://example.test/storage/v1/object/whatsapp-media/image/msgZ1.jpg', now(), now());

-- Objetos: (1) ALVO — mídia do contato B, com `%` no nome; (2) LEGÍTIMO — na
-- pasta do contato A (do próprio agente).
INSERT INTO storage.objects (id, bucket_id, name, owner, created_at, updated_at) VALUES
  ('0b000000-0000-4000-8000-000000000001','whatsapp-media','image/msg%1.jpg','22222222-2222-4222-8222-222222222222', now(), now()),
  ('0b000000-0000-4000-8000-000000000002','whatsapp-media','c0000000-0000-4000-8000-00000000000a/image/ok1.jpg','11111111-1111-4111-8111-111111111111', now(), now());

-- ---------------------------------------------------------------- asserções
DO $prova$
DECLARE
  v_falhas integer := 0;
  v_n      integer;
  v_bool   boolean;
  v_txt    text;
  v_negado boolean;
  v_msg    text;
BEGIN
  ------------------------------------------------------- T1 (-03) negativo
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
    SELECT count(*) INTO v_n FROM public.get_profile_role_for_check('22222222-2222-4222-8222-222222222222');
    IF v_n <> 0 THEN RAISE EXCEPTION 'devolveu % linha(s) de OUTRO usuario', v_n; END IF;
    -- sem oraculo: id inexistente e entrada invalida (NULL) respondem igual (zero linhas)
    SELECT count(*) INTO v_n FROM public.get_profile_role_for_check('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
    IF v_n <> 0 THEN RAISE EXCEPTION 'id inexistente devolveu % linha(s)', v_n; END IF;
    SELECT count(*) INTO v_n FROM public.get_profile_role_for_check(NULL);
    IF v_n <> 0 THEN RAISE EXCEPTION 'p_user_id NULL devolveu % linha(s)', v_n; END IF;
    RESET ROLE;
    RAISE NOTICE 'T1 OK    (-03) agente A nao le papel de outro usuario, de id inexistente nem de NULL (0 linhas)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T1 FALHOU (-03): %', SQLERRM;
  END;

  ------------------------------------------------------- T2 (-03) positivo
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
    SELECT count(*) INTO v_n FROM public.get_profile_role_for_check('11111111-1111-4111-8111-111111111111');
    RESET ROLE;
    IF v_n <> 1 THEN RAISE EXCEPTION 'proprio papel devolveu % linha(s), esperado 1', v_n; END IF;
    RAISE NOTICE 'T2 OK    (-03) agente A le o proprio papel (1 linha)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T2 FALHOU (-03): %', SQLERRM;
  END;

  ------------------------------------------------------- T3 (-03) supervisor
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
    SELECT count(*) INTO v_n FROM public.get_profile_role_for_check('22222222-2222-4222-8222-222222222222');
    RESET ROLE;
    IF v_n <> 1 THEN RAISE EXCEPTION 'supervisor devolveu % linha(s) do agente B, esperado 1', v_n; END IF;
    RAISE NOTICE 'T3 OK    (-03) supervisor le o papel de outro usuario (1 linha)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T3 FALHOU (-03): %', SQLERRM;
  END;

  ------------------------------------------------- T4 (-03) uso legitimo
  -- A policy "Users can update own profile secure" chama get_profile_role_for_check(auth.uid()):
  -- provar que o caminho legítimo de atualizar o PRÓPRIO perfil continua passando.
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
    UPDATE public.profiles SET name = 'Agente A (prova)' WHERE user_id = '11111111-1111-4111-8111-111111111111';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RESET ROLE;
    IF v_n <> 1 THEN RAISE EXCEPTION 'atualizar o proprio perfil afetou % linha(s), esperado 1', v_n; END IF;
    RAISE NOTICE 'T4 OK    (-03) agente A atualiza o proprio perfil pela policy (1 linha)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T4 FALHOU (-03): %', SQLERRM;
  END;

  --------------------------------------- T5 (-04) temp business_hours hostil
  -- Sem pg_temp no search_path, o schema temporário é procurado PRIMEIRO: a
  -- tabela hostil da sessão substitui public.business_hours dentro da função.
  BEGIN
    SET LOCAL ROLE authenticated;
    CREATE TEMP TABLE business_hours (
      id uuid, whatsapp_connection_id uuid, day_of_week integer,
      is_open boolean, open_time time, close_time time
    ) ON COMMIT DROP;
    INSERT INTO business_hours (id, whatsapp_connection_id, day_of_week, is_open, open_time, close_time)
    VALUES ('0c000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000009',
            extract(dow from now() at time zone 'America/Sao_Paulo')::int, false, '00:00', '00:00');
    SELECT public.is_within_business_hours('90000000-0000-4000-8000-000000000009') INTO v_bool;
    DROP TABLE business_hours;
    RESET ROLE;
    IF v_bool IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'is_within_business_hours leu a TEMP TABLE hostil (devolveu %); public.business_hours nao tem configuracao e o retorno correto e true', v_bool;
    END IF;
    RAISE NOTICE 'T5 OK    (-04) TEMP TABLE business_hours hostil nao sombreia a tabela real (true)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T5 FALHOU (-04): %', SQLERRM;
  END;

  ------------------------------------------- T6 (-04) temp profiles hostil
  -- A TEMP TABLE profiles forjada declara que um profile_id QUE NAO E do chamador
  -- pertence a ele. Sem pg_temp no search_path o guarda de grant_agent_achievement
  -- le a tabela forjada e libera a chamada (escalada de escrita).
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
    CREATE TEMP TABLE profiles (id uuid, user_id uuid) ON COMMIT DROP;
    INSERT INTO profiles (id, user_id) VALUES
      ('de000000-0000-4000-8000-0000000000de','11111111-1111-4111-8111-111111111111');
    v_negado := false; v_msg := NULL;
    BEGIN
      PERFORM public.grant_agent_achievement('de000000-0000-4000-8000-0000000000de','daily_goal','Prova T6','prova',1);
    EXCEPTION WHEN OTHERS THEN
      v_negado := true; v_msg := SQLERRM;
    END;
    RESET ROLE;
    IF NOT v_negado THEN
      RAISE EXCEPTION 'grant_agent_achievement ACEITOU um profile_id que nao e do chamador: o guarda leu a TEMP TABLE profiles forjada';
    END IF;
    IF position('permission denied' IN coalesce(v_msg,'')) = 0 THEN
      RAISE EXCEPTION 'negou por outro motivo (nao pelo guarda de identidade): %', v_msg;
    END IF;
    RAISE NOTICE 'T6 OK    (-04) grant_agent_achievement leu a tabela REAL e negou o id de terceiro';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T6 FALHOU (-04): %', SQLERRM;
  END;

  ------------------------------------------- T7 (-04) estado das 9 funções
  BEGIN
    SELECT count(*) INTO v_n
      FROM (VALUES ('is_within_business_hours(uuid)'),
                   ('get_profile_role_for_check(uuid)'),
                   ('update_own_profile(text,text,text,text,text,text)'),
                   ('reassign_overloaded_agents()'),
                   ('reassign_absent_agents(integer)'),
                   ('grant_agent_achievement(uuid,text,text,text,integer)'),
                   ('update_agent_streak(uuid,boolean)'),
                   ('increment_agent_resolutions(uuid)'),
                   ('get_own_lockout_status(text)')) AS esperada(sig)
      JOIN pg_proc p ON p.oid::regprocedure::text = esperada.sig
     WHERE p.prosecdef AND array_to_string(p.proconfig, ',') LIKE '%pg_temp%';
    IF v_n <> 9 THEN
      RAISE EXCEPTION 'apenas % de 9 funcoes SECURITY DEFINER com pg_temp no search_path', v_n;
    END IF;
    RAISE NOTICE 'T7 OK    (-04) 9 de 9 funcoes DEFINER com search_path = public, pg_temp';
  EXCEPTION WHEN OTHERS THEN
    v_falhas := v_falhas + 1;
    RAISE NOTICE 'T7 FALHOU (-04): %', SQLERRM;
  END;

  ------------------------------------- T8 (-02) exploit: curinga no nome
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
    SELECT count(*) INTO v_n FROM storage.objects
     WHERE id = '0b000000-0000-4000-8000-000000000001';
    RESET ROLE;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'agente A LEU o objeto de outro contato (nome com curinga): % linha(s) visiveis', v_n;
    END IF;
    RAISE NOTICE 'T8 OK    (-02) agente A nao le objeto com curinga de outro contato (0 linhas)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T8 FALHOU (-02): %', SQLERRM;
  END;

  ------------------------------------- T9 (-02) uso legítimo: pasta do contato
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
    SELECT count(*) INTO v_n FROM storage.objects
     WHERE id = '0b000000-0000-4000-8000-000000000002';
    RESET ROLE;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'agente A NAO leu a midia da pasta do proprio contato: % linha(s)', v_n;
    END IF;
    RAISE NOTICE 'T9 OK    (-02) agente A le a midia da pasta do proprio contato (1 linha)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_falhas := v_falhas + 1;
    RAISE NOTICE 'T9 FALHOU (-02): %', SQLERRM;
  END;

  IF v_falhas > 0 THEN
    RAISE EXCEPTION 'PROVA FALHOU: % de 9 verificacoes falharam', v_falhas;
  END IF;
  RAISE NOTICE 'PROVA OK: 9 de 9 verificacoes passaram';
END $prova$;

ROLLBACK;
