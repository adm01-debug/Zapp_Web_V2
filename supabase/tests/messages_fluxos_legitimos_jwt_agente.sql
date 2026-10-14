-- supabase/tests/messages_fluxos_legitimos_jwt_agente.sql
--
-- PONTOS 1 e 3 da recusa do [refazer 1] (revisor 13/10/2026) do cartao
-- "messages sem escrita direta do cliente": com a migration 20261012151936
-- aplicada, os fluxos LEGITIMOS continuam passando.
--
-- RODA SO NO BANCO LOCAL DA TAREFA (esquema real, todas as migrations):
--   zapp-db-local psql . <conjunto> -f supabase/tests/messages_fluxos_legitimos_jwt_agente.sql
-- Termina em ROLLBACK: zero efeito colateral. Nao roda em Postgres
-- descartavel (precisa do esquema real: profiles, contacts, permissoes,
-- conexoes, RPCs de entrega e RLS).
--
-- O QUE PROVA (cada linha sai PASS/FAIL em prova_res):
--   P0: enqueue/claim/complete/fail_outbound_message sao postgres + SECURITY
--       DEFINER, logo a trigger nova (que so barra current_user cliente) nao
--       as barra (ponto 1: "se alguma dessas funcoes tiver dono diferente de
--       postgres ou for SECURITY INVOKER, a trigger a barra").
--   P4: anon e PUBLIC nao tem nenhum GRANT em messages (ponto 4: o Rollback
--       nao precisa devolver o que nunca existiu).
--   P1: enqueue_outbound_message como agente real (SET ROLE authenticated +
--       request.jwt.claims com sub do profile agente) PASSA e enfileira com
--       status de envio (ponto 1).
--   P1N: o mesmo enqueue SEM permissao send_messages falha 42501 (a prova e
--       sensivel: sem o fixture certo ela falha).
--   P3: UPDATE is_read=true como agente COM claims que enxerga o contato
--       afeta 1 linha (ponto 3: sem JWT a RLS filtra para 0 linhas).
--   P3R: o mesmo UPDATE SEM claims afeta 0 linhas (prova que a prova antiga,
--       sem JWT, era vacua).
--   P3N: UPDATE direto de status como agente falha 42501 (a trava continua).
--   P1N2: INSERT direto como agente falha 42501 (o bloqueio continua).
--   P2: claim_outbound_message + complete_outbound_message como service_role
--       passam e o status muda para 'sent' (a trigger nova nao quebra a
--       entrega; ponto 1, segunda metade).

BEGIN;

CREATE TEMP TABLE prova_res(
  id text PRIMARY KEY,
  status text NOT NULL,
  detalhe text NOT NULL
);
-- a prova grava o veredito como os proprios papeis cliente (authenticated) e
-- service_role; a temp table e da sessao, entao o GRANT nao vaza.
GRANT ALL ON prova_res TO authenticated, service_role, anon;

-- ============ F0: fixture (postgres) ============
INSERT INTO auth.users(id, email)
VALUES ('a1111111-1111-4111-8111-111111111111', 'prova-refazer1@local');

-- a trigger handle_new_user() cria um profile automatico para todo auth.users
-- (com dependentes como agent_stats); a prova usa o id real dele.
SELECT id AS pid FROM public.profiles
WHERE user_id = 'a1111111-1111-4111-8111-111111111111' \gset

UPDATE public.profiles SET name = 'Agente Prova Refazer1'
WHERE user_id = 'a1111111-1111-4111-8111-111111111111';

INSERT INTO public.user_roles(user_id, role)
VALUES ('a1111111-1111-4111-8111-111111111111', 'agent');

INSERT INTO public.whatsapp_connections(id, name, phone_number, status, instance_id)
VALUES ('c3333333-3333-4333-8333-333333333333',
        'Conexao Prova', '+5511888880002', 'connected', 'prova-inst-1');

INSERT INTO public.contacts(id, name, phone, assigned_to, whatsapp_connection_id)
VALUES ('d4444444-4444-4444-8444-444444444444',
        'Contato Prova', '+5511999990002',
        :'pid',
        'c3333333-3333-4333-8333-333333333333');

-- mensagem inbound (de contact) para o teste de "marcar como lida"
INSERT INTO public.messages(id, contact_id, sender, content)
VALUES ('e5555555-5555-4555-8555-555555555555',
        'd4444444-4444-4444-8444-444444444444',
        'contact', 'oi, preciso de ajuda');

-- ============ P0: dono + SECURITY das RPCs de entrega ============
INSERT INTO prova_res
SELECT 'P0-' || proname,
       CASE WHEN pg_get_userbyid(proowner) = 'postgres' AND prosecdef
            THEN 'PASS' ELSE 'FAIL' END,
       'dono=' || pg_get_userbyid(proowner)
       || ' seg=' || CASE WHEN prosecdef THEN 'DEFINER' ELSE 'INVOKER' END
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('enqueue_outbound_message', 'claim_outbound_message',
                  'complete_outbound_message', 'fail_outbound_message');

-- ============ P4: anon/PUBLIC sem grants em messages ============
INSERT INTO prova_res
SELECT 'P4-grants-anon-public',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       'linhas_de_grant_para_anon_ou_PUBLIC=' || COUNT(*)::text
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'messages'
  AND grantee IN ('anon', 'PUBLIC');

-- ============ P1: enqueue como agente real (com JWT) ============
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}';

CREATE TEMP TABLE t_enq ON COMMIT DROP AS
SELECT * FROM public.enqueue_outbound_message(
  'd4444444-4444-4444-8444-444444444444',
  gen_random_uuid(),
  'ping prova refazer1',
  'text');

GRANT SELECT ON t_enq TO service_role;

RESET ROLE;

INSERT INTO prova_res
SELECT 'P1-enqueue-agente',
       CASE WHEN COUNT(*) = 1 AND bool_and(status IN ('queued', 'sending'))
            THEN 'PASS' ELSE 'FAIL' END,
       'linhas=' || COUNT(*)::text || ' status=' || string_agg(status, ',')
FROM t_enq;

-- ============ P1N: enqueue SEM permissao falha (sensibilidade) ============
DO $$
BEGIN
  DELETE FROM public.user_roles
  WHERE user_id = 'a1111111-1111-4111-8111-111111111111';
EXCEPTION WHEN OTHERS THEN
  INSERT INTO prova_res VALUES ('P1N-setup',
    'FAIL', 'nao removeu user_roles: ' || SQLERRM);
END;
$$;

SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}';
DO $$
BEGIN
  PERFORM public.enqueue_outbound_message(
    'd4444444-4444-4444-8444-444444444444',
    gen_random_uuid(), 'nao deveria passar', 'text');
  INSERT INTO prova_res VALUES ('P1N-enqueue-sem-permissao',
    'FAIL', 'passou sem send_messages');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO prova_res VALUES ('P1N-enqueue-sem-permissao',
    CASE WHEN SQLSTATE = '42501' THEN 'PASS' ELSE 'FAIL' END,
    'SQLSTATE=' || SQLSTATE || ' ' || SQLERRM);
END;
$$;
RESET ROLE;

INSERT INTO public.user_roles(user_id, role)
VALUES ('a1111111-1111-4111-8111-111111111111', 'agent');

-- ============ P3R: is_read SEM claims = 0 linhas (prova antiga era vacua) ============
SET ROLE authenticated;
RESET request.jwt.claims;
DO $$
DECLARE v_n integer;
BEGIN
  UPDATE public.messages SET is_read = true
  WHERE id = 'e5555555-5555-4555-8555-555555555555';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO prova_res VALUES ('P3R-is_read-sem-claims',
    CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END,
    'ROW_COUNT=' || v_n::text || ' (esperado 0: RLS filtra sem JWT)');
END;
$$;
RESET ROLE;

-- ============ P3: is_read COM claims = 1 linha ============
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}';
DO $$
DECLARE v_n integer;
BEGIN
  UPDATE public.messages SET is_read = true
  WHERE id = 'e5555555-5555-4555-8555-555555555555';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO prova_res VALUES ('P3-is_read-com-claims',
    CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END,
    'ROW_COUNT=' || v_n::text || ' (esperado 1)');
END;
$$;

-- ============ P3N: UPDATE de status direto continua negado ============
DO $$
BEGIN
  UPDATE public.messages SET status = 'sent'
  WHERE id = 'e5555555-5555-4555-8555-555555555555';
  INSERT INTO prova_res VALUES ('P3N-update-status-direto',
    'FAIL', 'UPDATE de status passou no cliente');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO prova_res VALUES ('P3N-update-status-direto',
    CASE WHEN SQLSTATE = '42501' THEN 'PASS' ELSE 'FAIL' END,
    'SQLSTATE=' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

-- ============ P1N2: INSERT direto continua negado ============
DO $$
BEGIN
  INSERT INTO public.messages(contact_id, sender, content)
  VALUES ('d4444444-4444-4444-8444-444444444444', 'agent', 'forjada');
  INSERT INTO prova_res VALUES ('P1N2-insert-direto',
    'FAIL', 'INSERT direto passou no cliente');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO prova_res VALUES ('P1N2-insert-direto',
    CASE WHEN SQLSTATE = '42501' THEN 'PASS' ELSE 'FAIL' END,
    'SQLSTATE=' || SQLSTATE || ' ' || SQLERRM);
END;
$$;
RESET ROLE;

-- ============ P2: claim + complete como service_role ============
SET ROLE service_role;
SET request.jwt.claims = '{"role":"service_role"}';

CREATE TEMP TABLE t_claim ON COMMIT DROP AS
SELECT * FROM public.claim_outbound_message(
  (SELECT id FROM t_enq),
  :'pid',
  'prova-refazer1');

RESET ROLE;

INSERT INTO prova_res
SELECT 'P2-claim-service_role',
       CASE WHEN COUNT(*) = 1 AND bool_and(claim_token IS NOT NULL)
            THEN 'PASS' ELSE 'FAIL' END,
       'linhas=' || COUNT(*)::text
FROM t_claim;

SET ROLE service_role;
SET request.jwt.claims = '{"role":"service_role"}';
DO $$
DECLARE v_tok uuid;
BEGIN
  SELECT claim_token INTO v_tok FROM t_claim;
  PERFORM public.complete_outbound_message(
    (SELECT id FROM t_enq), v_tok, 'wa-prova-1', 'sent');
  INSERT INTO prova_res VALUES ('P2-complete-service_role', 'PASS',
    'complete executou sem erro da trigger nova');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO prova_res VALUES ('P2-complete-service_role', 'FAIL',
    'SQLSTATE=' || SQLSTATE || ' ' || SQLERRM);
END;
$$;
RESET ROLE;

INSERT INTO prova_res
SELECT 'P2-status-sent',
       CASE WHEN status = 'sent' THEN 'PASS' ELSE 'FAIL' END,
       'status=' || COALESCE(status, 'NULL')
FROM public.messages
WHERE id = (SELECT id FROM t_enq);

-- ============ resultado ============
SELECT id, status, detalhe FROM prova_res ORDER BY id;

SELECT CASE WHEN COUNT(*) FILTER (WHERE status <> 'PASS') = 0
            THEN 'TODAS AS PROVAS PASSARAM'
            ELSE 'HA PROVA COM FALHA' END AS veredito,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status = 'PASS') AS pass
FROM prova_res;

ROLLBACK;
