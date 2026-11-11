-- TEMPORÁRIO (não versionar): asserts de talkx_block_recipient no replay local.
DO $$
DECLARE
  u_admin uuid := '00000000-0000-4000-8000-0000000000a1';
  u_agent uuid := '00000000-0000-4000-8000-0000000000a2';
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role) VALUES
    (u_admin, 'gestor.teste@empresa.com', '{"name":"Gestor"}'::jsonb, 'authenticated', 'authenticated'),
    (u_agent, 'atendente.teste@empresa.com', '{"name":"Atendente"}'::jsonb, 'authenticated', 'authenticated')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, user_id, name, is_active) VALUES
    ('00000000-0000-4000-8000-0000000000b1', u_admin, 'Gestor', true),
    ('00000000-0000-4000-8000-0000000000b2', u_agent, 'Atendente', true)
  ON CONFLICT (user_id) DO UPDATE SET is_active = true;
  DELETE FROM public.user_roles WHERE user_id IN (u_admin, u_agent);
  INSERT INTO public.user_roles (user_id, role) VALUES (u_admin, 'admin'), (u_agent, 'agent');
  INSERT INTO public.contacts (id, name, phone, consent_status)
    VALUES ('00000000-0000-4000-8000-0000000000c1', 'Cliente', '+55 (11) 90000-0001', 'unknown');
  INSERT INTO public.talkx_campaigns (id, name, message_template, status)
    VALUES ('00000000-0000-4000-8000-0000000000d1', 'Campanha teste', 'Oi', 'completed');
  INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, status)
    VALUES ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', 'failed');
END $$;

-- 1) anon: sem EXECUTE
SELECT set_config('request.jwt.claim.role', 'anon', false);
SET ROLE anon;
DO $$
BEGIN
  PERFORM public.talkx_block_recipient('00000000-0000-4000-8000-0000000000e1');
  RAISE EXCEPTION 'ASSERT: anon conseguiu bloquear';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;

-- 2) atendente comum: recusado por papel
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', false);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
DO $$
BEGIN
  PERFORM public.talkx_block_recipient('00000000-0000-4000-8000-0000000000e1');
  RAISE EXCEPTION 'ASSERT: atendente comum conseguiu bloquear';
EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM <> 'talkx_block_role_required' THEN RAISE EXCEPTION 'ASSERT: recusa errada para atendente: %', SQLERRM; END IF;
END $$;
-- atendente também não lê nem grava talkx_blacklist direto (policy)
DO $$
BEGIN
  INSERT INTO public.talkx_blacklist (contact_id, origin) VALUES ('00000000-0000-4000-8000-0000000000c1', 'manual');
  RAISE EXCEPTION 'ASSERT: atendente gravou talkx_blacklist direto';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;

-- 3) gestor: bloqueia; repetir devolve NULL (idempotente)
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', false);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
DO $$
DECLARE v1 uuid; v2 uuid;
BEGIN
  v1 := public.talkx_block_recipient('00000000-0000-4000-8000-0000000000e1');
  IF v1 IS NULL THEN RAISE EXCEPTION 'ASSERT: gestor não conseguiu bloquear'; END IF;
  v2 := public.talkx_block_recipient('00000000-0000-4000-8000-0000000000e1');
  IF v2 IS NOT NULL THEN RAISE EXCEPTION 'ASSERT: segundo bloqueio não foi idempotente'; END IF;
  BEGIN
    PERFORM public.talkx_block_recipient('00000000-0000-4000-8000-0000000000ff');
    RAISE EXCEPTION 'ASSERT: destinatário inexistente não foi recusado';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT set_config('request.jwt.claim.role', '', false);

-- 4) conteúdo gravado e efeitos colaterais
DO $$
DECLARE r record; n int; c text;
BEGIN
  SELECT count(*) INTO n FROM public.talkx_blacklist WHERE contact_id = '00000000-0000-4000-8000-0000000000c1' AND removed_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'ASSERT: esperada 1 supressão ativa, obtidas %', n; END IF;
  SELECT * INTO r FROM public.talkx_blacklist WHERE contact_id = '00000000-0000-4000-8000-0000000000c1';
  IF r.origin <> 'manual' OR r.reason_code::text <> 'manual' THEN RAISE EXCEPTION 'ASSERT: origin/reason_code errados: % / %', r.origin, r.reason_code; END IF;
  IF r.phone IS DISTINCT FROM '5511900000001' THEN RAISE EXCEPTION 'ASSERT: telefone não normalizado: %', r.phone; END IF;
  IF r.campaign_id IS DISTINCT FROM '00000000-0000-4000-8000-0000000000d1'::uuid THEN RAISE EXCEPTION 'ASSERT: campanha não veio do destinatário'; END IF;
  IF r.blocked_by IS DISTINCT FROM '00000000-0000-4000-8000-0000000000b1'::uuid THEN RAISE EXCEPTION 'ASSERT: blocked_by não é o perfil do gestor: %', r.blocked_by; END IF;
  SELECT consent_status INTO c FROM public.contacts WHERE id = '00000000-0000-4000-8000-0000000000c1';
  IF c IS DISTINCT FROM 'unknown' THEN RAISE EXCEPTION 'ASSERT: bloqueio manual alterou consentimento para %', c; END IF;

  DELETE FROM public.talkx_blacklist WHERE contact_id = '00000000-0000-4000-8000-0000000000c1';
  DELETE FROM public.talkx_recipients WHERE id = '00000000-0000-4000-8000-0000000000e1';
  DELETE FROM public.talkx_campaigns WHERE id = '00000000-0000-4000-8000-0000000000d1';
  DELETE FROM public.contacts WHERE id = '00000000-0000-4000-8000-0000000000c1';
  DELETE FROM public.user_roles WHERE user_id IN ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2');
  DELETE FROM auth.users WHERE id IN ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2');
  RAISE NOTICE 'ASSERTS talkx_block_recipient: OK';
END $$;
