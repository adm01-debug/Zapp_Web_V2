-- Prova de RLS: autoria das reações em `public.message_reactions`.
-- Achado: docs/audits/SEGURANCA_RLS_CONTATOS_MENSAGENS_2026-10-07.md:112-129 (SEC-RLS_CONTATOS_MENSAGENS-04).
-- Pares: usa os papéis REAIS (authenticated, anon) via SET ROLE; nunca prova só como postgres.
--
-- Rodar (banco LOCAL da tarefa, usuário postgres do stack):
--   zapp-db-local psql . < supabase/tests/rls_message_reactions_autoria.sql
--
-- Esperado: só linhas [PASS]; qualquer [FAIL] provoca exceção e aborta.

SET client_min_messages TO notice;

-- ------------------------------------------------------------------ carga mínima
SET session_replication_role = replica;
DELETE FROM public.message_reactions
  WHERE id IN ('e0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002');
DELETE FROM public.messages
  WHERE id IN ('d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002');
DELETE FROM public.contacts
  WHERE id IN ('c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002');
DELETE FROM public.profiles
  WHERE id IN ('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003');
DELETE FROM public.user_roles
  WHERE user_id IN ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333');
DELETE FROM auth.users
  WHERE id IN ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333');

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333');
SET session_replication_role = origin;

INSERT INTO public.profiles (id, user_id, name, role) VALUES
  ('a0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','ATILA (agente A)','agent'),
  ('a0000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','BETO (agente B)','agent'),
  ('a0000000-0000-0000-0000-000000000003','33333333-3333-3333-3333-333333333333','CHEFE (admin)','admin');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('33333333-3333-3333-3333-333333333333','admin');

INSERT INTO public.contacts (id, name, phone, assigned_to) VALUES
  ('c0000000-0000-0000-0000-000000000001','Cliente do A','+5500000000001','a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002','Cliente do B','+5500000000002','a0000000-0000-0000-0000-000000000002');

INSERT INTO public.messages (id, contact_id, sender, content) VALUES
  ('d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','contact','oi do cliente do A'),
  ('d0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000002','contact','oi do cliente do B');

-- ------------------------------------------------------------------ helpers
CREATE OR REPLACE FUNCTION public._t_assert(p_label text, p_ok boolean) RETURNS void
LANGUAGE plpgsql AS $f$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION '[FAIL] %', p_label;
  END IF;
  RAISE NOTICE '[PASS] %', p_label;
END;
$f$;

-- ------------------------------------------------------------------ AGENTE A
SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);

-- A1 legítimo: reação própria, com o contact_id da própria mensagem -> PASSA
DO $$
BEGIN
  INSERT INTO public.message_reactions (id, message_id, user_id, contact_id, emoji)
    VALUES ('e0000000-0000-0000-0000-000000000001',
            'd0000000-0000-0000-0000-000000000001',
            'a0000000-0000-0000-0000-000000000001',
            'c0000000-0000-0000-0000-000000000001', '👍');
  PERFORM public._t_assert('A1 atendente A grava a PRÓPRIA reação (caminho do app)', true);
EXCEPTION WHEN others THEN
  PERFORM public._t_assert('A1 atendente A grava a PRÓPRIA reação (caminho do app) — negado por engano: ' || SQLERRM, false);
END $$;

-- A2 personificação: user_id do colega B -> NEGADO
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.message_reactions (message_id, user_id, contact_id, emoji)
      VALUES ('d0000000-0000-0000-0000-000000000001',
              'a0000000-0000-0000-0000-000000000002',
              'c0000000-0000-0000-0000-000000000001', '🔥');
    ok := true;
  EXCEPTION WHEN others THEN ok := false; END;
  PERFORM public._t_assert('A2 user_id de COLEGA é negado (personificação)', NOT ok);
END $$;

-- A3 reação de cliente pelo autenticado: user_id nulo + contact_id -> NEGADO
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.message_reactions (message_id, user_id, contact_id, emoji)
      VALUES ('d0000000-0000-0000-0000-000000000001', NULL,
              'c0000000-0000-0000-0000-000000000001', '❤️');
    ok := true;
  EXCEPTION WHEN others THEN ok := false; END;
  PERFORM public._t_assert('A3 user_id nulo (reação "de cliente") é negado', NOT ok);
END $$;

-- A4 contact_id de OUTRO contato (mas user_id = eu) -> NEGADO
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.message_reactions (message_id, user_id, contact_id, emoji)
      VALUES ('d0000000-0000-0000-0000-000000000001',
              'a0000000-0000-0000-0000-000000000001',
              'c0000000-0000-0000-0000-000000000002', '🤔');
    ok := true;
  EXCEPTION WHEN others THEN ok := false; END;
  PERFORM public._t_assert('A4 contact_id de contato alheio é negado', NOT ok);
END $$;

-- A5 mensagem fora do meu alcance (contato do B) -> NEGADO
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.message_reactions (message_id, user_id, contact_id, emoji)
      VALUES ('d0000000-0000-0000-0000-000000000002',
              'a0000000-0000-0000-0000-000000000001',
              'c0000000-0000-0000-0000-000000000002', '👀');
    ok := true;
  EXCEPTION WHEN others THEN ok := false; END;
  PERFORM public._t_assert('A5 reagir a mensagem de contato alheio é negado', NOT ok);
END $$;

-- A6 reação de terceiro: B grava a própria; A tenta apagar -> afeta 0 linhas
SELECT set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
INSERT INTO public.message_reactions (id, message_id, user_id, contact_id, emoji)
  VALUES ('e0000000-0000-0000-0000-000000000002',
          'd0000000-0000-0000-0000-000000000002',
          'a0000000-0000-0000-0000-000000000002',
          'c0000000-0000-0000-0000-000000000002', '👍');

SELECT set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
DO $$
DECLARE n int;
BEGIN
  DELETE FROM public.message_reactions WHERE id = 'e0000000-0000-0000-0000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM public._t_assert('A6 apagar reação de TERCEIRO não apaga nada (0 linhas)', n = 0);
END $$;

-- A7 reação própria: apagar -> PASSA (1 linha)
DO $$
DECLARE n int;
BEGIN
  DELETE FROM public.message_reactions WHERE id = 'e0000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM public._t_assert('A7 apagar a PRÓPRIA reação funciona (1 linha)', n = 1);
END $$;

-- A8 UPDATE da reação de terceiro -> afeta 0 linhas
DO $$
DECLARE n int;
BEGIN
  UPDATE public.message_reactions SET emoji = '💥'
    WHERE id = 'e0000000-0000-0000-0000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM public._t_assert('A8 trocar o emoji da reação de TERCEIRO afeta 0 linhas', n = 0);
END $$;

-- ------------------------------------------------------------------ ANON
RESET ROLE;
SET ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', false);
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.message_reactions (message_id, user_id, contact_id, emoji)
      VALUES ('d0000000-0000-0000-0000-000000000001',
              'a0000000-0000-0000-0000-000000000001',
              'c0000000-0000-0000-0000-000000000001', '🚫');
    ok := true;
  EXCEPTION WHEN others THEN ok := false; END;
  PERFORM public._t_assert('ANON não insere reação', NOT ok);
END $$;

-- ------------------------------------------------------------------ ADMIN (moderação)
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
DO $$
DECLARE n int;
BEGIN
  UPDATE public.message_reactions SET emoji = '🛡️'
    WHERE id = 'e0000000-0000-0000-0000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM public._t_assert('ADMIN troca a reação de terceiro (moderação, 1 linha)', n = 1);
END $$;

DO $$
DECLARE n int;
BEGIN
  DELETE FROM public.message_reactions WHERE id = 'e0000000-0000-0000-0000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM public._t_assert('ADMIN apaga a reação de terceiro (1 linha)', n = 1);
END $$;

-- ------------------------------------------------------------------ forma final das policies
RESET ROLE;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname='public' AND tablename='message_reactions' AND cmd IN ('INSERT','UPDATE','DELETE');
  PERFORM public._t_assert('restam exatamente 3 policies de escrita (INSERT/UPDATE/DELETE)', n = 3);

  SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname='public' AND tablename='message_reactions' AND cmd IN ('INSERT','UPDATE','DELETE')
      AND roles = '{authenticated}';
  PERFORM public._t_assert('as 3 são TO authenticated', n = 3);

  SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname='public' AND tablename='message_reactions'
      AND policyname IN ('Users can insert reactions for assigned contacts',
                         'Users can delete their own reactions',
                         'Users can add reactions',
                         'Users can update reactions');
  PERFORM public._t_assert('nenhuma policy redundante sobreviveu', n = 0);

  SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname='public' AND tablename='message_reactions' AND cmd='INSERT'
      AND with_check LIKE '%get_profile_id_for_user%';
  PERFORM public._t_assert('a de INSERT amarra o autor (get_profile_id_for_user)', n = 1);
END $$;

-- ------------------------------------------------------------------ limpeza
SET session_replication_role = replica;
DELETE FROM public.message_reactions
  WHERE id IN ('e0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002');
DELETE FROM public.messages
  WHERE id IN ('d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002');
DELETE FROM public.contacts
  WHERE id IN ('c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002');
DELETE FROM public.profiles
  WHERE id IN ('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003');
DELETE FROM public.user_roles
  WHERE user_id IN ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333');
DELETE FROM auth.users
  WHERE id IN ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333');
SET session_replication_role = origin;

RESET ROLE;
DROP FUNCTION IF EXISTS public._t_assert(text, boolean);
