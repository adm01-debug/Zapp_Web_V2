-- Prova de RLS/visibilidade: paridade da fila (SLA, follow-up, eventos, anexos).
-- Cartão t_5a169008. Achado conferido: membro ATIVO da fila do contato enxerga a conversa
-- (messages/conversations via is_contact_visible_to_user, 20260909200000 linhas 75-81), mas
-- conversation_sla / followup_executions / conversation_events (INSERT) e o INSERT em storage de
-- whatsapp-media/audio-messages só aceitavam a carteira (assigned_to) — 20260830110000,
-- 20260318121108, 20260409100431 e 20260511233306.
--
-- Pares: usa os papéis REAIS (authenticated, anon, service_role) via SET ROLE; nunca prova só como
-- postgres. Roda no banco LOCAL da tarefa, usuário postgres do stack:
--   zapp-db-local psql . v2-26101303167dce < supabase/tests/paridade_visibilidade_fila.sql
--
-- ANTES da migration 20261013210002: o bloco do agente da fila FALHA (leitura vazia / insert
-- recusado) e o psql sai != 0. DEPOIS: só [PASS] e "FIM" no fim.

\set ON_ERROR_STOP on
SET client_min_messages TO notice;

-- ------------------------------------------------------------------ carga mínima
SET session_replication_role = replica;
DELETE FROM storage.objects
 WHERE name LIKE 'c0000000-0000-0000-0000-000000000001/%'
    OR name LIKE 'c0000000-0000-0000-0000-000000000002/%'
    OR name LIKE '11111111-1111-1111-1111-111111111111/%';
DELETE FROM public.conversation_events WHERE contact_id IN ('c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002');
DELETE FROM public.followup_executions WHERE id IN ('f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002');
DELETE FROM public.followup_sequences WHERE id = 'e0000000-0000-0000-0000-000000000009';
DELETE FROM public.conversation_sla WHERE id IN ('b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002');
DELETE FROM public.queue_members WHERE queue_id = 'd0000000-0000-0000-0000-000000000009';
DELETE FROM public.contacts WHERE id IN ('c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002');
DELETE FROM public.queues WHERE id = 'd0000000-0000-0000-0000-000000000009';
DELETE FROM public.user_roles WHERE user_id IN ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333');
DELETE FROM public.profiles WHERE id IN ('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003');
DELETE FROM auth.users WHERE id IN ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333');

-- auth.users ainda sob replica (senão o gatilho handle_new_user tenta criar profile sem nome).
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333');
SET session_replication_role = origin;

INSERT INTO public.profiles (id, user_id, name, role) VALUES
  ('a0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','FABIO (membro da fila, sem atribuição)','agent'),
  ('a0000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','GUSTAVO (sem relação)','agent'),
  ('a0000000-0000-0000-0000-000000000003','33333333-3333-3333-3333-333333333333','HELENA (admin)','admin');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('33333333-3333-3333-3333-333333333333','admin');

INSERT INTO public.queues (id, name) VALUES ('d0000000-0000-0000-0000-000000000009','Fila Suporte');
INSERT INTO public.queue_members (queue_id, profile_id, is_active) VALUES
  ('d0000000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001', true);

-- c...01: contato NA FILA do FABIO, sem assigned_to. c...02: contato sem relação com ninguém.
INSERT INTO public.contacts (id, name, phone, assigned_to, queue_id) VALUES
  ('c0000000-0000-0000-0000-000000000001','Cliente na fila do Fabio','+550****0101', NULL, 'd0000000-0000-0000-0000-000000000009'),
  ('c0000000-0000-0000-0000-000000000002','Cliente sem relacao','+550****0102', NULL, NULL);

INSERT INTO public.conversation_sla (id, contact_id) VALUES
  ('b0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000002');

INSERT INTO public.followup_sequences (id, name) VALUES ('e0000000-0000-0000-0000-000000000009','Sequencia de teste');
INSERT INTO public.followup_executions (id, sequence_id, contact_id) VALUES
  ('f0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000009','c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-000000000009','c0000000-0000-0000-0000-000000000002');

INSERT INTO storage.buckets (id, name, public) VALUES
  ('whatsapp-media','whatsapp-media', false),
  ('audio-messages','audio-messages', false)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------ helper de assert
CREATE OR REPLACE FUNCTION public._t_assert(p_label text, p_ok boolean) RETURNS void
LANGUAGE plpgsql AS $f$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION '[FAIL] %', p_label;
  END IF;
  RAISE NOTICE '[PASS] %', p_label;
END;
$f$;
GRANT EXECUTE ON FUNCTION public._t_assert(text, boolean) TO authenticated, anon, service_role;

-- ================================================================== AGENTE DA FILA (FABIO)
SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);

-- LÊ o SLA do contato da fila, e só ele.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.conversation_sla
    WHERE id IN ('b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002');
  PERFORM public._t_assert('FILA lê conversation_sla do contato da fila (1, não 2)', n = 1);
END $$;

-- LÊ o follow-up do contato da fila, e só ele.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.followup_executions
    WHERE id IN ('f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002');
  PERFORM public._t_assert('FILA lê followup_executions do contato da fila (1, não 2)', n = 1);
END $$;

-- GRAVA evento do contato da fila.
DO $$
BEGIN
  INSERT INTO public.conversation_events (contact_id, event_type, performed_by)
    VALUES ('c0000000-0000-0000-0000-000000000001','t_paridade_fila','a0000000-0000-0000-0000-000000000001');
  PERFORM public._t_assert('FILA insere conversation_events do contato da fila', true);
EXCEPTION WHEN others THEN
  PERFORM public._t_assert('FILA insere conversation_events do contato da fila — negado por engano: ' || SQLERRM, false);
END $$;

-- ANEXA arquivo em pasta do contato da fila (whatsapp-media e audio-messages).
DO $$
BEGIN
  INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('whatsapp-media','c0000000-0000-0000-0000-000000000001/arquivo.jpg','11111111-1111-1111-1111-111111111111');
  PERFORM public._t_assert('FILA anexa em whatsapp-media na pasta do contato da fila', true);
EXCEPTION WHEN others THEN
  PERFORM public._t_assert('FILA anexa em whatsapp-media na pasta do contato da fila — recusado: ' || SQLERRM, false);
END $$;

DO $$
BEGIN
  INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('audio-messages','c0000000-0000-0000-0000-000000000001/audio.ogg','11111111-1111-1111-1111-111111111111');
  PERFORM public._t_assert('FILA anexa em audio-messages na pasta do contato da fila', true);
EXCEPTION WHEN others THEN
  PERFORM public._t_assert('FILA anexa em audio-messages na pasta do contato da fila — recusado: ' || SQLERRM, false);
END $$;

-- Mas NÃO anexa em pasta de contato que não enxerga.
DO $$
DECLARE inseriu boolean := false;
BEGIN
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner)
      VALUES ('whatsapp-media','c0000000-0000-0000-0000-000000000002/arquivo.jpg','11111111-1111-1111-1111-111111111111');
    inseriu := true;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  PERFORM public._t_assert('FILA NÃO anexa em pasta de contato que não enxerga', inseriu = false);
END $$;

-- E NÃO grava evento de contato que não enxerga.
DO $$
DECLARE inseriu boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.conversation_events (contact_id, event_type, performed_by)
      VALUES ('c0000000-0000-0000-0000-000000000002','t_paridade_fila','a0000000-0000-0000-0000-000000000001');
    inseriu := true;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  PERFORM public._t_assert('FILA NÃO insere conversation_events de contato que não enxerga', inseriu = false);
END $$;

RESET ROLE;

-- ================================================================== AGENTE SEM RELAÇÃO (GUSTAVO)
SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);

DO $$
DECLARE n_sla int; n_fe int;
BEGIN
  SELECT count(*) INTO n_sla FROM public.conversation_sla
    WHERE id IN ('b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002');
  SELECT count(*) INTO n_fe FROM public.followup_executions
    WHERE id IN ('f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002');
  PERFORM public._t_assert('SEM RELAÇÃO lê 0 conversation_sla', n_sla = 0);
  PERFORM public._t_assert('SEM RELAÇÃO lê 0 followup_executions', n_fe = 0);
END $$;

DO $$
DECLARE inseriu boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.conversation_events (contact_id, event_type)
      VALUES ('c0000000-0000-0000-0000-000000000001','t_paridade_fila');
    inseriu := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM public._t_assert('SEM RELAÇÃO NÃO insere conversation_events', inseriu = false);
END $$;

DO $$
DECLARE inseriu boolean := false;
BEGIN
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner)
      VALUES ('whatsapp-media','c0000000-0000-0000-0000-000000000001/x.jpg','22222222-2222-2222-2222-222222222222');
    inseriu := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM public._t_assert('SEM RELAÇÃO NÃO anexa em pasta de contato alheio', inseriu = false);
END $$;

RESET ROLE;

-- ================================================================== anon
SET ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', false);
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.conversation_sla
    WHERE id IN ('b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002');
  PERFORM public._t_assert('anon lê 0 conversation_sla (RLS ou sem GRANT)', n = 0);
EXCEPTION WHEN insufficient_privilege THEN
  PERFORM public._t_assert('anon negado a ler conversation_sla (sem GRANT SELECT)', true);
END $$;
RESET ROLE;

-- ================================================================== service_role (BYPASSRLS)
SET ROLE service_role;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.conversation_sla
    WHERE id IN ('b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002');
  PERFORM public._t_assert('service_role (BYPASSRLS) lê as 2 conversation_sla de teste', n = 2);
END $$;
RESET ROLE;

SELECT 'FIM: paridade da fila OK' AS resultado;
