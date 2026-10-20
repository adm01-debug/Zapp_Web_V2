-- user_devices: unicidade por (user_id, device_fingerprint)
-- Duas abas abrindo juntas não podem criar duas linhas de "novo dispositivo" nem
-- dois e-mails de alerta. A garantia de banco é a UNIQUE
-- user_devices_user_id_device_fingerprint_key, criada na migration
-- 20251231123128 (linha 16, dentro do CREATE TABLE public.user_devices).
-- Este teste prende a garantia: se alguém remover a constraint, ele falha.
--
-- Roda no banco LOCAL reaproveitando as migrations REAIS (não recria schema):
--   zapp-db-local psql <cópia> <conjunto> < supabase/tests/user_devices_unique.sql
--
-- user_devices.user_id tem FK para auth.users (migration de integridade
-- referencial); o fixture cria o usuário. session_replication_role=replica
-- desliga os gatilhos de auth.users durante o fixture, sem afetar UNIQUE.

SET session_replication_role = replica;

DO $$
DECLARE
  v_tem_unique boolean;
  v_dups bigint;
  v_user uuid := gen_random_uuid();
  v_fp   text := 'fp-teste-unique-user-devices';
  v_bateu boolean := false;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_user);

  -- 1) A constraint existe em (user_id, device_fingerprint).
  SELECT exists (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.user_devices'::regclass
      AND c.contype = 'u'
      AND (
        c.conname = 'user_devices_user_id_device_fingerprint_key'
        OR pg_get_constraintdef(c.oid) = 'UNIQUE (user_id, device_fingerprint)'
      )
  ) INTO v_tem_unique;

  IF NOT v_tem_unique THEN
    RAISE EXCEPTION 'user_devices_unique T1 FALHOU: sem UNIQUE (user_id, device_fingerprint) em public.user_devices';
  END IF;

  -- 2) Nenhum grupo (user_id, device_fingerprint) duplicado.
  SELECT count(*) INTO v_dups
  FROM (
    SELECT user_id, device_fingerprint
    FROM public.user_devices
    GROUP BY 1, 2
    HAVING count(*) > 1
  ) d;

  IF v_dups <> 0 THEN
    RAISE EXCEPTION 'user_devices_unique T2 FALHOU: % grupo(s) duplicado(s)', v_dups;
  END IF;

  -- 3) Comportamento: a segunda inserção igual bate em unique_violation (23505).
  INSERT INTO public.user_devices (user_id, device_fingerprint, browser, os)
    VALUES (v_user, v_fp, 'Chrome', 'Linux');

  BEGIN
    INSERT INTO public.user_devices (user_id, device_fingerprint, browser, os)
      VALUES (v_user, v_fp, 'Firefox', 'Windows');
  EXCEPTION WHEN unique_violation THEN
    v_bateu := true;
  END;

  IF NOT v_bateu THEN
    RAISE EXCEPTION 'user_devices_unique T3 FALHOU: a segunda insercao igual foi aceita (sem 23505)';
  END IF;

  -- 4) Par diferente continua entrando (a UNIQUE não é ampla demais).
  INSERT INTO public.user_devices (user_id, device_fingerprint)
    VALUES (v_user, v_fp || '-outro');

  -- Limpa o que este teste criou (a base é descartável, mas não deixa lixo).
  DELETE FROM public.user_devices WHERE user_id = v_user;
  DELETE FROM auth.users WHERE id = v_user;

  RAISE NOTICE 'user_devices_unique: UNIQUE (user_id, device_fingerprint) ok; 2a insercao igual -> 23505; par diferente aceito';
END $$;

SET session_replication_role = origin;
