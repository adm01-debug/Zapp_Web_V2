-- Teste SQL de public.inbox_unread_total() (selo de nao lidas do Chat / shell).
--
-- O que prova:
--   T1  agente conta SO as conversas que enxerga (contato de outro agente nao entra);
--       com 3 nao lidas num contato o total e 1 CONVERSA, nao 3 mensagens (T4);
--   T2  admin/supervisor ve todas as conversas com nao lida (visibilidade ampla);
--   T3  marcar como lida reduz a contagem (a conversa sai do total);
--   T2b ACL: anon NAO pode chamar (permissao negada de verdade); authenticated e
--       service_role tem EXECUTE (controle positivo);
--   T4  "nao lida" com is_read NULO conta (mesma semantica do cliente);
--   T5  contato visivel SEM mensagem nao entra no total;
--   T7  escala: 3.650 contatos com 1 nao lida cada -> total exato e medicao de tempo
--       (o indice parcial idx_messages_unread_conversas e' o caminho esperado).
--
-- COMO RODAR (banco LOCAL da tarefa, nunca producao):
--   zapp-db-local psql . <conjunto> -v ON_ERROR_STOP=1 < supabase/tests/inbox_unread_total.sql
--
-- Cria dados SINTETICOS e desfaz tudo no ROLLBACK final: nao sobra linha no banco.
-- Sem EXCEPTION = suite verde.
BEGIN;

DO $inbox_unread_total$
DECLARE
  v_user_a        uuid := '11111111-1111-1111-1111-1111111111a1';
  v_user_b        uuid := '11111111-1111-1111-1111-1111111111b2';
  v_user_admin    uuid := '11111111-1111-1111-1111-1111111111ad';
  v_profile_a     uuid;
  v_profile_b     uuid;
  v_contact_vis   uuid := '33333333-3333-3333-3333-3333333333c1';
  v_contact_oculto uuid := '33333333-3333-3333-3333-3333333333c2';
  v_contact_vazio uuid := '33333333-3333-3333-3333-3333333333c3';
  v_msg_m1        uuid := '44444444-4444-4444-4444-444444444401';
  v_msg_m2        uuid := '44444444-4444-4444-4444-444444444402';
  v_msg_m3        uuid := '44444444-4444-4444-4444-444444444403';
  v_msg_m4        uuid := '44444444-4444-4444-4444-444444444404';
  v_msg_m5        uuid := '44444444-4444-4444-4444-444444444405';
  v_msg_b1        uuid := '44444444-4444-4444-4444-4444444444b1';
  v_t_base        timestamptz := '2026-10-05T12:00:00Z';
  v_total         bigint;
  v_base_a        bigint;
  v_base_admin    bigint;
  v_barrado       boolean;
  v_ms            numeric;
  v_ok            int := 0;
BEGIN
  -- ---------------------------------------------------------------- dados
  INSERT INTO auth.users (id, email) VALUES
    (v_user_a,     'inbox-total-a@local.test'),
    (v_user_b,     'inbox-total-b@local.test'),
    (v_user_admin, 'inbox-total-admin@local.test');

  -- O gatilho on_auth_user_created cria o perfil; o upsert cobre os dois mundos.
  INSERT INTO public.profiles (user_id, name) VALUES
    (v_user_a,     'Agente A (sintetico)'),
    (v_user_b,     'Agente B (sintetico)'),
    (v_user_admin, 'Admin (sintetico)')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;

  SELECT id INTO v_profile_a FROM public.profiles WHERE user_id = v_user_a;
  SELECT id INTO v_profile_b FROM public.profiles WHERE user_id = v_user_b;
  IF v_profile_a IS NULL OR v_profile_b IS NULL THEN
    RAISE EXCEPTION 'fixture invalida: perfil sintetico nao encontrado';
  END IF;

  -- admin/supervisor: e' o que da visibilidade ampla em is_contact_visible_to_user
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_admin, 'admin');

  -- Linha de base: o banco LOCAL ja' vem com o seed (contatos com nao lidas de
  -- outros agentes). O agente A e' novo, entao sua base e' 0; a do admin nao.
  -- As assercoes usam base + delta, para nao depender do que o seed traz.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_admin)::text, true);
  SELECT public.inbox_unread_total() INTO v_base_admin;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);
  SELECT public.inbox_unread_total() INTO v_base_a;
  RAISE NOTICE 'bases do seed: agente A=% admin=%', v_base_a, v_base_admin;

  INSERT INTO public.contacts (id, name, phone, assigned_to) VALUES
    (v_contact_vis,    'Contato A visivel',   '5511000000941', v_profile_a),
    (v_contact_oculto, 'Contato B oculto',    '5511000000942', v_profile_b),
    (v_contact_vazio,  'Contato A sem msgs',  '5511000000943', v_profile_a);

  -- m1: contato, is_read NULO  -> CONTA
  -- m2: contato, is_read false -> conta
  -- m3: agent,   is_read true  -> NAO conta
  -- m4: contato, is_read true  -> nao conta
  -- m5: contato, is_read NULO  -> conta   (3 nao lidas no MESMO contato -> 1 conversa)
  INSERT INTO public.messages (id, contact_id, sender, content, message_type, is_read, created_at) VALUES
    (v_msg_m1, v_contact_vis, 'contact', 'm1 nao lida (nulo)', 'text', NULL,  v_t_base - interval '2 hours'),
    (v_msg_m2, v_contact_vis, 'contact', 'm2 nao lida',        'text', false, v_t_base - interval '1 hour'),
    (v_msg_m3, v_contact_vis, 'agent',   'm3 do agente',       'text', true,  v_t_base - interval '30 minutes'),
    (v_msg_m4, v_contact_vis, 'contact', 'm4 lida',            'text', true,  v_t_base - interval '15 minutes'),
    (v_msg_m5, v_contact_vis, 'contact', 'm5 nao lida (nulo)', 'text', NULL,  v_t_base);
  -- contato do agente B: 1 nao lida, so visivel para B (e para o admin)
  INSERT INTO public.messages (id, contact_id, sender, content, message_type, is_read, created_at) VALUES
    (v_msg_b1, v_contact_oculto, 'contact', 'b1 nao lida', 'text', NULL, v_t_base);

  -- ---------------------------------------------------------------- T1/T4/T5
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);
  SELECT public.inbox_unread_total() INTO v_total;
  IF v_total <> v_base_a + 1 THEN
    RAISE EXCEPTION 'T1/T4 FALHOU: agente A esperava % (base+1) e veio %', v_base_a + 1, v_total;
  END IF;
  v_ok := v_ok + 1;

  -- T5: contato visivel sem mensagem nao infla (ja' coberto: contato_vazio existe e
  -- o total acima continua base+1). Prova explicita: so o contato vazio -> 0 se nada
  -- mais houvesse. Aqui apenas confirmamos que ele nao somou (o total acima e' base+1).

  -- T2: admin ve as duas conversas com nao lida (do A e do B) alem da base do seed.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_admin)::text, true);
  SELECT public.inbox_unread_total() INTO v_total;
  IF v_total <> v_base_admin + 2 THEN
    RAISE EXCEPTION 'T2 FALHOU: admin esperava % (base+2) e veio %', v_base_admin + 2, v_total;
  END IF;
  v_ok := v_ok + 1;

  -- T3: marcar como lida a conversa do A reduz o total do admin para base+1 (so' B).
  UPDATE public.messages SET is_read = true
   WHERE contact_id = v_contact_vis AND sender = 'contact' AND is_read IS NOT TRUE;
  SELECT public.inbox_unread_total() INTO v_total;
  IF v_total <> v_base_admin + 1 THEN
    RAISE EXCEPTION 'T3 FALHOU: apos marcar como lida o admin esperava % e veio %', v_base_admin + 1, v_total;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);
  SELECT public.inbox_unread_total() INTO v_total;
  IF v_total <> v_base_a THEN
    RAISE EXCEPTION 'T3 FALHOU: agente A apos marcar como lida esperava % e veio %', v_base_a, v_total;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T2b ACL
  IF has_function_privilege('anon', 'public.inbox_unread_total()', 'EXECUTE') THEN
    RAISE EXCEPTION 'T2b FALHOU: anon com EXECUTE na RPC';
  END IF;
  IF has_function_privilege('authenticated', 'public.inbox_unread_total()', 'EXECUTE') = false THEN
    RAISE EXCEPTION 'T2b FALHOU: authenticated SEM EXECUTE na RPC';
  END IF;
  IF has_function_privilege('service_role', 'public.inbox_unread_total()', 'EXECUTE') = false THEN
    RAISE EXCEPTION 'T2b FALHOU: service_role SEM EXECUTE na RPC';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);
  PERFORM set_config('role', 'anon', true);
  v_barrado := false;
  BEGIN
    PERFORM public.inbox_unread_total();
  EXCEPTION WHEN insufficient_privilege THEN
    v_barrado := true;
  END;
  PERFORM set_config('role', 'none', true);
  IF v_barrado = false THEN
    RAISE EXCEPTION 'T2b FALHOU: anon conseguiu chamar a RPC';
  END IF;

  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    SELECT public.inbox_unread_total() INTO v_total;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role', 'none', true);
    RAISE EXCEPTION 'T2b FALHOU: authenticated nao conseguiu chamar a RPC';
  END;
  PERFORM set_config('role', 'none', true);
  IF v_total <> v_base_a THEN
    RAISE EXCEPTION 'T2b FALHOU: authenticated esperava % e veio %', v_base_a, v_total;
  END IF;
  v_ok := v_ok + 1;

  -- ---------------------------------------------------------------- T7 escala
  -- 3.650 contatos do agente A, cada um com 1 nao lida (mesma regra do cliente).
  INSERT INTO public.contacts (id, name, phone, assigned_to)
  SELECT ('55555555-5555-5555-5555-' || lpad(g::text, 12, '0'))::uuid,
         'Contato escala ' || g,
         '55119' || lpad(g::text, 8, '0'),
         v_profile_a
  FROM generate_series(1, 3650) AS g;

  INSERT INTO public.messages (id, contact_id, sender, content, message_type, is_read, created_at)
  SELECT ('66666666-6666-6666-6666-' || lpad(g::text, 12, '0'))::uuid,
         ('55555555-5555-5555-5555-' || lpad(g::text, 12, '0'))::uuid,
         'contact', 'escala', 'text', NULL, v_t_base
  FROM generate_series(1, 3650) AS g;

  -- Agente A: 3.650 da escala (as dele ja' foram lidas no T3) + base (0) = 3.650.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a)::text, true);
  v_ms := extract(epoch FROM clock_timestamp());
  SELECT public.inbox_unread_total() INTO v_total;
  v_ms := (extract(epoch FROM clock_timestamp()) - v_ms) * 1000;
  IF v_total <> v_base_a + 3650 THEN
    RAISE EXCEPTION 'T7 FALHOU: agente A com 3.650 contatos esperava % e veio %', v_base_a + 3650, v_total;
  END IF;
  RAISE NOTICE 'T7 escala (agente A, 3.650 contatos): total=% em % ms', v_total, round(v_ms, 1);

  -- Admin: base + 3.650 (escala) + 1 (contato do B, ainda nao lido) = base + 3.651.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_admin)::text, true);
  v_ms := extract(epoch FROM clock_timestamp());
  SELECT public.inbox_unread_total() INTO v_total;
  v_ms := (extract(epoch FROM clock_timestamp()) - v_ms) * 1000;
  IF v_total <> v_base_admin + 3651 THEN
    RAISE EXCEPTION 'T7 FALHOU: admin com 3.650 contatos esperava % e veio %', v_base_admin + 3651, v_total;
  END IF;
  RAISE NOTICE 'T7 escala (admin, % conversas): total=% em % ms', v_base_admin + 3651, v_total, round(v_ms, 1);
  v_ok := v_ok + 1;

  RAISE NOTICE 'inbox_unread_total: suite OK (T1 visibilidade do agente, T2 admin ve todas, T3 ler reduz, T2b ACL, T4 is_read nulo, T5 contato sem mensagem, T7 escala 3.650) — % grupo(s)', v_ok;
END $inbox_unread_total$;

ROLLBACK;
