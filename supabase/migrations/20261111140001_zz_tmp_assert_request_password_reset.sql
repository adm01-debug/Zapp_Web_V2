-- TEMPORÁRIO (não versionar): asserts de comportamento para o replay local.
DO $$
DECLARE u uuid := '00000000-0000-4000-8000-0000000000aa';
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role)
  VALUES (u, 'ana.teste@empresa.com', '{"name":"Ana"}'::jsonb, 'authenticated', 'authenticated')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (user_id, name, email) VALUES (u, 'Ana', 'ana.teste@empresa.com')
  ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;
END $$;

SET ROLE anon;
SELECT public.request_password_reset('  Ana.Teste@Empresa.com ', 'motivo', 'ua-teste');
SELECT public.request_password_reset('ana.teste@empresa.com', NULL, NULL);
SELECT public.request_password_reset('ninguem@empresa.com', NULL, NULL);
SELECT public.request_password_reset('lixo', NULL, NULL);
RESET ROLE;

DO $$
DECLARE n int; r record;
BEGIN
  SELECT count(*) INTO n FROM public.password_reset_requests WHERE email = 'ana.teste@empresa.com';
  IF n <> 1 THEN RAISE EXCEPTION 'ASSERT: esperado 1 pedido (dedupe 15 min), obtido %', n; END IF;
  SELECT * INTO r FROM public.password_reset_requests WHERE email = 'ana.teste@empresa.com';
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'ASSERT: pedido deveria nascer pending, veio %', r.status; END IF;
  IF r.reason IS DISTINCT FROM 'motivo' OR r.user_agent IS DISTINCT FROM 'ua-teste' THEN
    RAISE EXCEPTION 'ASSERT: motivo/user_agent não gravados';
  END IF;
  SELECT count(*) INTO n FROM public.password_reset_requests WHERE email IN ('ninguem@empresa.com', 'lixo');
  IF n <> 0 THEN RAISE EXCEPTION 'ASSERT: e-mail inexistente/inválido gerou pedido (%)', n; END IF;
END $$;

SET ROLE anon;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.password_reset_requests (user_id, email) VALUES ('00000000-0000-4000-8000-0000000000aa', 'x@y.com');
    RAISE EXCEPTION 'ASSERT: anon conseguiu inserir direto';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.password_reset_requests SET status = 'approved';
    IF FOUND THEN RAISE EXCEPTION 'ASSERT: anon conseguiu aprovar pedido'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.password_reset_requests WHERE status = 'approved';
  IF n <> 0 THEN RAISE EXCEPTION 'ASSERT: há pedido aprovado sem gestor'; END IF;
  DELETE FROM public.password_reset_requests WHERE user_id = '00000000-0000-4000-8000-0000000000aa';
  DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000000aa';
  RAISE NOTICE 'ASSERTS request_password_reset: OK';
END $$;
