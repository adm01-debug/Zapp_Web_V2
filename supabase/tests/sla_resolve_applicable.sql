-- sla_resolve_applicable
-- PB-39 (paridade V2/V3): prova no BANCO LOCAL da tarefa, com PAPEL REAL
-- (authenticated/anon/service_role), que:
--   1) public.resolve_applicable_sla(uuid) resolve o prazo de 1a resposta na
--      hierarquia unica (contato > empresa > cargo > tipo > fila > agente >
--      sla_configurations.is_default > 5 min) e devolve minutos, nivel e regra;
--   2) register_first_response_internal usa esse prazo (regra de 30 min NAO
--      estoura aos 10 min), no lugar do `interval '5 minutes'` fixo;
--   3) authenticated (que ve o contato) recebe o prazo; quem NAO ve recebe 42501;
--      anon nao tem EXECUTE.
-- Roda como postgres e troca de papel com SET LOCAL ROLE. Tudo em UMA transacao
-- com ROLLBACK ao fim: nao deixa residuo no banco.
--
-- Roda com: zapp-db-local psql . v2-26101222220aaa < supabase/tests/sla_resolve_applicable.sql

BEGIN;
SET LOCAL session_replication_role = replica;  -- desliga gatilhos so na fixture

-- Fixture sintetica (banco local descartavel da tarefa; nada de dado real).
INSERT INTO auth.users (id) VALUES
  ('f0000000-0000-0000-0000-000000000001'),  -- admin (ve tudo)
  ('f0000000-0000-0000-0000-000000000002');  -- agente sem acesso ao contato
INSERT INTO public.profiles (id, user_id, name, updated_at) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Admin Teste', now()),
  ('e0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', 'Fora Teste', now());
INSERT INTO public.user_roles (user_id, role) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'admin');

INSERT INTO public.contacts (id, name, phone, company, job_title, contact_type, queue_id, assigned_to) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Contato SLA', '+5500000000000',
   'ACME', 'Diretor', 'lead', NULL, NULL);

INSERT INTO public.queues (id, name) VALUES ('a0000000-0000-0000-0000-000000000001', 'Fila Teste SLA');

INSERT INTO public.sla_rules (name, first_response_minutes, resolution_minutes, priority, queue_id, is_active)
  VALUES ('regra-global-fila-30', 30, 60, 0, 'a0000000-0000-0000-0000-000000000001', true);

SET LOCAL session_replication_role = origin;

-- (1) hierarquia + fallback: como postgres (sem JWT = caminho do job de varredura)
DO $$
DECLARE r record;
BEGIN
  -- sem regra para este contato: cai no padrao de 5 min (global ou sistema),
  -- nunca com id de regra
  SELECT * INTO r FROM public.resolve_applicable_sla('c0000000-0000-0000-0000-000000000001');
  IF r.matched_level NOT IN ('global_default', 'system_default')
     OR r.first_response_minutes <> 5 OR r.rule_id IS NOT NULL THEN
    RAISE EXCEPTION 'sem regra deveria cair no padrao de 5 min, veio %/%/%', r.matched_level, r.first_response_minutes, r.rule_name;
  END IF;

  -- sem nenhum padrao ativo: padrao do sistema
  UPDATE public.sla_configurations SET is_default = false, is_active = false;
  SELECT * INTO r FROM public.resolve_applicable_sla('c0000000-0000-0000-0000-000000000001');
  IF r.matched_level <> 'system_default' OR r.first_response_minutes <> 5 THEN
    RAISE EXCEPTION 'esperava system_default/5, veio %/%', r.matched_level, r.first_response_minutes;
  END IF;

  -- padrao global (sla_configurations.is_default) quando nao ha regra
  INSERT INTO public.sla_configurations (name, first_response_minutes, resolution_minutes, is_default, is_active)
    VALUES ('padrao-teste', 22, 60, true, true);
  SELECT * INTO r FROM public.resolve_applicable_sla('c0000000-0000-0000-0000-000000000001');
  IF r.matched_level <> 'global_default' OR r.first_response_minutes <> 22 THEN
    RAISE EXCEPTION 'esperava global_default/22, veio %/%', r.matched_level, r.first_response_minutes;
  END IF;

  -- regra por CONTATO vence o padrao global
  INSERT INTO public.sla_rules (name, first_response_minutes, priority, contact_id)
    VALUES ('regra-contato-15', 15, 0, 'c0000000-0000-0000-0000-000000000001');
  SELECT * INTO r FROM public.resolve_applicable_sla('c0000000-0000-0000-0000-000000000001');
  IF r.matched_level <> 'contact' OR r.first_response_minutes <> 15 OR r.rule_id IS NULL THEN
    RAISE EXCEPTION 'esperava contact/15 com id, veio %/%/%', r.matched_level, r.first_response_minutes, r.rule_id;
  END IF;
  DELETE FROM public.sla_rules WHERE name = 'regra-contato-15';
END $$;

-- (2) register usa o prazo da regra: 30 min, resposta aos 10 min NAO estoura
UPDATE public.contacts SET queue_id = 'a0000000-0000-0000-0000-000000000001'
  WHERE id = 'c0000000-0000-0000-0000-000000000001';
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.resolve_applicable_sla('c0000000-0000-0000-0000-000000000001');
  IF r.matched_level <> 'queue' OR r.first_response_minutes <> 30 THEN
    RAISE EXCEPTION 'a regra da fila deveria vencer o padrao global, veio %/%', r.matched_level, r.first_response_minutes;
  END IF;
END $$;
INSERT INTO public.messages (contact_id, sender, content, status, created_at, status_updated_at) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'contact', 'ola', 'delivered',
   '2026-10-12 12:00:00+00', '2026-10-12 12:00:00+00'),
  ('c0000000-0000-0000-0000-000000000001', 'agent', 'bom dia', 'sent',
   '2026-10-12 12:01:00+00', '2026-10-12 12:10:00+00');
DO $$
DECLARE v_breached boolean;
BEGIN
  SELECT first_response_breached INTO v_breached FROM public.conversation_sla
    WHERE contact_id = 'c0000000-0000-0000-0000-000000000001';
  IF v_breached IS NULL OR v_breached THEN
    RAISE EXCEPTION 'com a regra de 30 min, 10 min nao pode estourar (breached=%)', v_breached;
  END IF;
END $$;

-- (3a) authenticated que VE o contato (admin) recebe o prazo
SET LOCAL request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000001"}';
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_min integer;
BEGIN
  SELECT first_response_minutes INTO v_min
    FROM public.resolve_applicable_sla('c0000000-0000-0000-0000-000000000001');
  IF v_min IS NULL THEN
    RAISE EXCEPTION 'admin deveria receber o prazo';
  END IF;
END $$;
RESET ROLE;

-- (3b) authenticated que NAO ve o contato recebe 42501 (nao o resultado)
SET LOCAL request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000002"}';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM * FROM public.resolve_applicable_sla('c0000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'usuario sem acesso NAO pode receber o prazo';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;  -- esperado: 42501
END $$;

-- (3c) anon nao tem EXECUTE
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM * FROM public.resolve_applicable_sla('c0000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'anon NAO pode executar a RPC';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;  -- esperado: permission denied for function
END $$;

RESET ROLE;
SELECT 'PASSOU' AS resultado;
ROLLBACK;
