-- Teste SQL da RPC public.delivery_stats (estatistica de entrega por hora) — cartao t_bfec4bd2.
--
-- Rode com:  zapp-db-local psql . <conjunto> -v ON_ERROR_STOP=1 < supabase/tests/delivery_stats.sql
--
-- O que este arquivo prova, com linha sintetica propria (nao depende de dado de producao):
--   T1 CONTAGENS  — sent/delivered/read/failed/received/total_messages batem com as linhas
--                   de messages do contato (inclusive: apagada fora, status NULL/pending
--                   nao conta como enviada, recebida nao conta como enviada);
--   T2 TIMELINE   — a soma dos buckets por hora e igual ao total; bucket sempre na hora cheia;
--   T3 JANELA     — p_hours estreita a janela; p_hours < 1 e recusado com 22023;
--   T4 GRUPO      — is_group reconhece as DUAS formas reais (telefone <digitos>-<digitos> e
--                   contato que casa com public.whatsapp_groups);
--   T5 VISIBILIDADE — quem nao pode ver o contato recebe NULL (e o inexistente/apagado idem,
--                   para nao virar oraculo de existencia);
--   T6 ACL        — EXECUTE so para authenticated; anon negado de verdade (42501);
--                   no papel real authenticated as contagens continuam as mesmas;
--   T7 SEGURANCA  — SECURITY DEFINER, search_path fixo, assinatura (uuid, integer).
--   T8 LACUNA     — `participants` nao existe no contrato: a V2 nao grava o autor da mensagem
--                   de grupo (prova: o CHECK messages_sender_check recusa sender de membro).
--                   Este T8 vira vermelho no dia em que o autor passar a ser gravado — de
--                   proposito: e o sinal para reabrir o recorte por participante.
--
-- Tudo dentro de um bloco com ROLLBACK: nada fica no banco.

BEGIN;

DO $delivery_stats$
DECLARE
  u_a uuid := 'd0000000-0000-4000-8000-0000000000a1';
  u_b uuid := 'd0000000-0000-4000-8000-0000000000b1';
  v_c1       uuid := 'd0000000-0000-4000-8000-0000000000c1';  -- individual, do agente A
  v_g_jid    uuid := 'd0000000-0000-4000-8000-0000000000c2';  -- grupo (cadastro whatsapp_groups)
  v_g_legado uuid := 'd0000000-0000-4000-8000-0000000000c3';  -- grupo (telefone com hifen)
  v_b1       uuid := 'd0000000-0000-4000-8000-0000000000c4';  -- individual, do agente B
  v_apagado  uuid := 'd0000000-0000-4000-8000-0000000000c5';  -- contato apagado
  v_zerado   uuid := 'd0000000-0000-4000-8000-0000000000c6';  -- contato visivel sem mensagem

  v          jsonb;
  v_ok       integer := 0;
  v_gatilho_desligado boolean := false;
  v_recusou  boolean;
  v_papel_original text := current_user;
  v_perfil_a uuid;
  v_perfil_b uuid;
BEGIN
  -- ── Fixture ────────────────────────────────────────────────────────────────
  -- O gatilho trg_normalize_contact_phone apaga TUDO que nao e digito (inclusive o hifen
  -- do JID de grupo). Para criar o contato de grupo no formato antigo <digitos>-<digitos>
  -- ele precisa estar desligado. Isso exige ser dono da tabela (roda no banco local como
  -- postgres); se nao der, o teste segue e marca o caso como nao exercitado.
  BEGIN
    ALTER TABLE public.contacts DISABLE TRIGGER trg_normalize_contact_phone;
    v_gatilho_desligado := true;
  EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
    v_gatilho_desligado := false;
  END;

  INSERT INTO auth.users (id, email)
  VALUES (u_a, 'delivery-stats-a@local.test'), (u_b, 'delivery-stats-b@local.test')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (user_id, name)
  VALUES (u_a, 'Agente A (delivery_stats)'), (u_b, 'Agente B (delivery_stats)')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;

  -- contacts.assigned_to aponta para profiles.id (FK contacts_assigned_to_fkey).
  SELECT id INTO v_perfil_a FROM public.profiles WHERE user_id = u_a;
  SELECT id INTO v_perfil_b FROM public.profiles WHERE user_id = u_b;
  IF v_perfil_a IS NULL OR v_perfil_b IS NULL THEN
    RAISE EXCEPTION 'fixture invalida: perfil sintetico nao encontrado (% / %)', v_perfil_a, v_perfil_b;
  END IF;

  INSERT INTO public.contacts (id, name, phone, assigned_to, conversation_status, updated_at, deleted_at)
  VALUES
    (v_c1,       'Cliente delivery_stats', '5511000000001',      v_perfil_a, 'open', now(), null),
    (v_zerado,   'Cliente sem mensagem',   '5511000000002',      v_perfil_a, 'open', now(), null),
    (v_b1,       'Cliente do agente B',    '5511000000003',      v_perfil_b, 'open', now(), null),
    (v_apagado,  'Cliente apagado',        '5511000000004',      v_perfil_a, 'open', now(), now()),
    (v_g_jid,    'Grupo delivery_stats',   '120363295648424210', v_perfil_a, 'open', now(), null);

  IF v_gatilho_desligado THEN
    INSERT INTO public.contacts (id, name, phone, assigned_to, conversation_status, updated_at, deleted_at)
    VALUES (v_g_legado, 'Grupo legado delivery_stats', '5511000000001-1680000000', v_perfil_a, 'open', now(), null);
  END IF;

  -- O cadastro de grupos e a segunda forma real de reconhecer grupo (JID moderno sem hifen).
  INSERT INTO public.whatsapp_groups (id, group_id, name, created_at, updated_at)
  VALUES (gen_random_uuid(), '120363295648424210@g.us', 'Grupo delivery_stats', now(), now());

  -- contato individual: uma linha por caso de contagem
  INSERT INTO public.messages (id, contact_id, sender, status, content, message_type, created_at, is_deleted)
  VALUES
    (gen_random_uuid(), v_c1, 'agent',   'sent',      'c1', 'text', now() - interval '300 minutes', false),
    (gen_random_uuid(), v_c1, 'agent',   'delivered', 'c2', 'text', now() - interval '240 minutes', false),
    (gen_random_uuid(), v_c1, 'agent',   'read',      'c3', 'text', now() - interval '180 minutes', false),
    (gen_random_uuid(), v_c1, 'agent',   'played',    'c4', 'text', now() - interval '119 minutes', false),
    (gen_random_uuid(), v_c1, 'agent',   'failed',    'c5', 'text', now() - interval '100 minutes', false),
    (gen_random_uuid(), v_c1, 'agent',   'pending',   'c6', 'text', now() - interval  '80 minutes', false),
    (gen_random_uuid(), v_c1, 'agent',   NULL,        'c7', 'text', now() - interval  '50 minutes', false),
    (gen_random_uuid(), v_c1, 'contact', 'received',  'c8', 'text', now() - interval  '40 minutes', false),
    (gen_random_uuid(), v_c1, 'agent',   'read',      'c9', 'text', now() - interval  '30 minutes', true),
    (gen_random_uuid(), v_c1, 'agent',   'sent',     'c10', 'text', now() - interval '30 hours',   false),
    (gen_random_uuid(), v_zerado, 'agent', 'sent',    'z1', 'text', now() - interval '10 minutes', false);

  -- contato de grupo: o que a V2 realmente guarda (nosso envio + recebida sem autor)
  INSERT INTO public.messages (id, contact_id, sender, status, content, message_type, created_at, is_deleted)
  VALUES
    (gen_random_uuid(), v_g_jid, 'agent',   'sent',      'g1', 'text', now() - interval '200 minutes', false),
    (gen_random_uuid(), v_g_jid, 'agent',   'delivered', 'g2', 'text', now() - interval '150 minutes', false),
    (gen_random_uuid(), v_g_jid, 'contact', 'received',  'g3', 'text', now() - interval '120 minutes', false),
    (gen_random_uuid(), v_g_jid, 'agent',   'read',      'g4', 'text', now() - interval  '20 minutes', true);

  -- ── T1 CONTAGENS ───────────────────────────────────────────────────────────
  -- Papel: nenhum claim ainda (auth.uid() fica para o T6); aqui o assunto e a conta.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_a)::text, true);

  v := public.delivery_stats(v_c1);
  IF v IS NULL THEN
    RAISE EXCEPTION 'T1: delivery_stats(contato visivel) devolveu NULL';
  END IF;

  IF (v ->> 'is_group')::boolean THEN
    RAISE EXCEPTION 'T1: contato individual marcado como grupo';
  END IF;
  IF (v ->> 'window_hours')::integer <> 24 THEN
    RAISE EXCEPTION 'T1: window_hours default nao e 24 (%)', v ->> 'window_hours';
  END IF;
  IF v -> 'totals' ->> 'sent' <> '4' THEN
    RAISE EXCEPTION 'T1: sent=% (esperado 4: sent+delivered+read+played)', v -> 'totals' ->> 'sent';
  END IF;
  IF v -> 'totals' ->> 'delivered' <> '3' THEN
    RAISE EXCEPTION 'T1: delivered=% (esperado 3)', v -> 'totals' ->> 'delivered';
  END IF;
  IF v -> 'totals' ->> 'read' <> '2' THEN
    RAISE EXCEPTION 'T1: read=% (esperado 2)', v -> 'totals' ->> 'read';
  END IF;
  IF v -> 'totals' ->> 'failed' <> '1' THEN
    RAISE EXCEPTION 'T1: failed=% (esperado 1)', v -> 'totals' ->> 'failed';
  END IF;
  IF v -> 'totals' ->> 'received' <> '1' THEN
    RAISE EXCEPTION 'T1: received=% (esperado 1: mensagem recebida nao e entrega nossa)', v -> 'totals' ->> 'received';
  END IF;
  IF v -> 'totals' ->> 'total_messages' <> '8' THEN
    RAISE EXCEPTION 'T1: total_messages=% (esperado 8: a apagada saiu, a de 30h saiu, as 8 restantes ficam)',
      v -> 'totals' ->> 'total_messages';
  END IF;
  -- O total tem de bater com as linhas de messages do contato na janela.
  IF (v -> 'totals' ->> 'total_messages')::integer <> (
      SELECT count(*) FROM public.messages m
       WHERE m.contact_id = v_c1
         AND m.created_at >= now() - interval '24 hours'
         AND coalesce(m.is_deleted, false) = false
    ) THEN
    RAISE EXCEPTION 'T1: total_messages nao bate com as linhas de messages';
  END IF;
  -- last_* e o MAXIMO de created_at do conjunto correspondente.
  IF (v -> 'totals' ->> 'last_sent_at')::timestamptz <> (
      SELECT max(m.created_at) FROM public.messages m
       WHERE m.contact_id = v_c1 AND m.sender = 'agent'
         AND coalesce(m.is_deleted, false) = false
         AND m.status IN ('sent','delivered','read','played')
    ) THEN
    RAISE EXCEPTION 'T1: last_sent_at=% mas o maximo das enviadas e %',
      v -> 'totals' ->> 'last_sent_at',
      (SELECT max(m.created_at) FROM public.messages m
        WHERE m.contact_id = v_c1 AND m.sender = 'agent'
          AND coalesce(m.is_deleted, false) = false
          AND m.status IN ('sent','delivered','read','played'));
  END IF;
  IF (v -> 'totals' ->> 'last_read_at')::timestamptz <> (
      SELECT max(m.created_at) FROM public.messages m
       WHERE m.contact_id = v_c1 AND m.sender = 'agent'
         AND coalesce(m.is_deleted, false) = false
         AND m.status IN ('read','played')
    ) THEN
    RAISE EXCEPTION 'T1: last_read_at=% mas o maximo das lidas e %',
      v -> 'totals' ->> 'last_read_at',
      (SELECT max(m.created_at) FROM public.messages m
        WHERE m.contact_id = v_c1 AND m.sender = 'agent'
          AND coalesce(m.is_deleted, false) = false
          AND m.status IN ('read','played'));
  END IF;
  v_ok := v_ok + 1; RAISE NOTICE 'T1 OK: contagens do contato individual';

  -- Contato visivel sem nenhuma mensagem: objeto com zeros (nao NULL).
  v := public.delivery_stats(v_zerado);
  IF v IS NULL OR (v -> 'totals' ->> 'total_messages') <> '1' THEN
    RAISE EXCEPTION 'T1b: contato com 1 mensagem devolveu %', v;
  END IF;
  IF (v -> 'totals' ->> 'sent') <> '1' THEN
    RAISE EXCEPTION 'T1b: sent=% (esperado 1)', v -> 'totals' ->> 'sent';
  END IF;
  v_ok := v_ok + 1; RAISE NOTICE 'T1b OK: contagem de contato vizinho';

  -- ── T2 TIMELINE ────────────────────────────────────────────────────────────
  v := public.delivery_stats(v_c1);
  IF (SELECT coalesce(sum((e ->> 'sent')::integer), 0) FROM jsonb_array_elements(v -> 'timeline') e) <> 4
     OR (SELECT coalesce(sum((e ->> 'delivered')::integer), 0) FROM jsonb_array_elements(v -> 'timeline') e) <> 3
     OR (SELECT coalesce(sum((e ->> 'read')::integer), 0) FROM jsonb_array_elements(v -> 'timeline') e) <> 2 THEN
    RAISE EXCEPTION 'T2: a soma da timeline nao fecha com o total: %', v -> 'timeline';
  END IF;
  IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v -> 'timeline') e
       WHERE (e ->> 'hour') IS NULL
         OR extract(minute FROM (e ->> 'hour')::timestamptz) <> 0
         OR extract(second FROM (e ->> 'hour')::timestamptz) <> 0
    ) THEN
    RAISE EXCEPTION 'T2: bucket de hora nao esta na hora cheia: %', v -> 'timeline';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(v -> 'timeline') e) NOT BETWEEN 1 AND 6 THEN
    RAISE EXCEPTION 'T2: numero de buckets fora do esperado (janela de ~5h): %',
      (SELECT count(*) FROM jsonb_array_elements(v -> 'timeline') e);
  END IF;
  v_ok := v_ok + 1; RAISE NOTICE 'T2 OK: timeline por hora fecha com o total';

  -- ── T3 JANELA (p_hours) ────────────────────────────────────────────────────
  v := public.delivery_stats(v_c1, 1);
  IF (v ->> 'window_hours')::integer <> 1 THEN
    RAISE EXCEPTION 'T3: window_hours=% (esperado 1)', v ->> 'window_hours';
  END IF;
  -- ultima hora: so a agente sem status (-50m) e a recebida (-40m); a apagada (-30m) sai.
  IF v -> 'totals' ->> 'total_messages' <> '2'
     OR v -> 'totals' ->> 'sent' <> '0'
     OR v -> 'totals' ->> 'received' <> '1' THEN
    RAISE EXCEPTION 'T3: janela de 1h errada: %', v -> 'totals';
  END IF;

  v := public.delivery_stats(v_c1, 2);
  IF v -> 'totals' ->> 'total_messages' <> '5'
     OR v -> 'totals' ->> 'sent' <> '1'
     OR v -> 'totals' ->> 'delivered' <> '1'
     OR v -> 'totals' ->> 'failed' <> '1' THEN
    RAISE EXCEPTION 'T3: janela de 2h errada: %', v -> 'totals';
  END IF;

  v_recusou := false;
  BEGIN
    PERFORM public.delivery_stats(v_c1, 0);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_recusou := true;
  END;
  IF NOT v_recusou THEN
    RAISE EXCEPTION 'T3: p_hours = 0 nao foi recusado';
  END IF;
  v_ok := v_ok + 1; RAISE NOTICE 'T3 OK: p_hours estreita a janela e recusa valor invalido';

  -- ── T4 GRUPO ───────────────────────────────────────────────────────────────
  v := public.delivery_stats(v_g_jid);   -- grupo reconhecido pelo cadastro whatsapp_groups
  IF NOT (v ->> 'is_group')::boolean THEN
    RAISE EXCEPTION 'T4: contato que casa com whatsapp_groups nao foi marcado como grupo';
  END IF;
  IF v -> 'totals' ->> 'sent' <> '2'
     OR v -> 'totals' ->> 'delivered' <> '1'
     OR v -> 'totals' ->> 'received' <> '1'
     OR v -> 'totals' ->> 'total_messages' <> '3' THEN
    RAISE EXCEPTION 'T4: contagens do grupo erradas: %', v -> 'totals';
  END IF;

  IF v_gatilho_desligado THEN
    v := public.delivery_stats(v_g_legado);  -- grupo no formato antigo <digitos>-<digitos>
    IF NOT (v ->> 'is_group')::boolean THEN
      RAISE EXCEPTION 'T4: telefone <digitos>-<digitos> nao foi marcado como grupo';
    END IF;
    v_ok := v_ok + 1; RAISE NOTICE 'T4b OK: as duas formas de grupo reconhecidas';
  ELSE
    RAISE NOTICE 'T4b PULADO: sem permissao para desligar trg_normalize_contact_phone nesta conexao';
  END IF;
  v_ok := v_ok + 1; RAISE NOTICE 'T4 OK: is_group pelo cadastro de grupos';

  -- ── T5 VISIBILIDADE ────────────────────────────────────────────────────────
  IF public.delivery_stats(v_b1) IS NOT NULL THEN
    RAISE EXCEPTION 'T5: contato de outro agente devolveu dado';
  END IF;
  IF public.delivery_stats('d0000000-0000-4000-8000-0000000000ff') IS NOT NULL THEN
    RAISE EXCEPTION 'T5: contato inexistente devolveu dado';
  END IF;
  IF public.delivery_stats(v_apagado) IS NOT NULL THEN
    RAISE EXCEPTION 'T5: contato apagado devolveu dado';
  END IF;
  IF public.delivery_stats(NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'T5: p_contact_id NULL devolveu dado';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_b)::text, true);
  IF public.delivery_stats(v_c1) IS NOT NULL THEN
    RAISE EXCEPTION 'T5: o agente B viu o contato do agente A';
  END IF;
  IF public.delivery_stats(v_g_jid) IS NOT NULL THEN
    RAISE EXCEPTION 'T5: o agente B viu o grupo do agente A';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_a)::text, true);
  v_ok := v_ok + 1; RAISE NOTICE 'T5 OK: sem acesso nao devolve nada (e o inexistente resposta igual)';

  -- ── T6 ACL ─────────────────────────────────────────────────────────────────
  IF has_function_privilege('anon', 'public.delivery_stats(uuid, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T6: anon tem EXECUTE';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.delivery_stats(uuid, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T6: authenticated nao tem EXECUTE';
  END IF;
  -- PUBLIC (grantee vazio em aclitem = quem nao tem nome): nao pode ter EXECUTE.
  -- O service_role TEM, mas so pela ACL PADRAO do projeto para funcao nova criada por
  -- postgres — nao e grant desta migration, e sem auth.uid() a funcao devolve NULL.
  IF EXISTS (
      SELECT 1
        FROM pg_proc p
        CROSS JOIN LATERAL unnest(coalesce(p.proacl, '{}'::aclitem[])) a
       WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'delivery_stats'
         AND p.pronargs = 2
         AND p.proargtypes[0] = 'uuid'::regtype AND p.proargtypes[1] = 'integer'::regtype
         AND a::text LIKE '=X/%'
    ) THEN
    RAISE EXCEPTION 'T6: PUBLIC ficou com EXECUTE';
  END IF;

  -- Funcional no papel real: anon nem chama.
  v_recusou := false;
  BEGIN
    PERFORM set_config('role', 'anon', true);
    PERFORM public.delivery_stats(v_c1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_recusou := true;
  END;
  PERFORM set_config('role', v_papel_original, true);
  IF NOT v_recusou THEN
    RAISE EXCEPTION 'T6: anon conseguiu chamar a RPC';
  END IF;

  -- Funcional no papel real authenticated: os mesmos numeros.
  PERFORM set_config('role', 'authenticated', true);
  v := public.delivery_stats(v_c1);
  PERFORM set_config('role', v_papel_original, true);
  IF v IS NULL OR v -> 'totals' ->> 'sent' <> '4' OR v -> 'totals' ->> 'read' <> '2' THEN
    RAISE EXCEPTION 'T6: no papel authenticated o resultado mudou: %', v;
  END IF;
  v_ok := v_ok + 1; RAISE NOTICE 'T6 OK: EXECUTE so para authenticated; anon negado; numeros iguais no papel real';

  -- ── T7 SEGURANCA ───────────────────────────────────────────────────────────
  -- Um so teste para as tres coisas: assinatura (uuid, integer), SECURITY DEFINER e
  -- search_path fixo. (Cuidado ja pago: pg_get_function_identity_arguments devolve
  -- "p_contact_id uuid, p_hours integer", nao "uuid, integer" — comparar com aquilo
  -- deixava a consulta VAZIA e o IF passava sem conferir nada.)
  IF NOT EXISTS (
      SELECT 1
        FROM pg_proc p
       WHERE p.pronamespace = 'public'::regnamespace
         AND p.proname = 'delivery_stats'
         AND p.pronargs = 2
         AND p.proargtypes[0] = 'uuid'::regtype
         AND p.proargtypes[1] = 'integer'::regtype
         AND p.prosecdef
         AND EXISTS (
           SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) c
            WHERE c LIKE 'search_path=%public%pg_temp%'
         )
    ) THEN
    RAISE EXCEPTION 'T7: assinatura (uuid, integer) / SECURITY DEFINER / search_path fixo: algum faltou';
  END IF;
  v_ok := v_ok + 1; RAISE NOTICE 'T7 OK: SECURITY DEFINER + search_path fixo';

  -- ── T8 LACUNA DECLARADA (participants) ─────────────────────────────────────
  -- A chave `participants` NAO existe no contrato: a V2 nao grava quem escreveu dentro do
  -- grupo. A prova e dura — o proprio banco recusa gravar um sender que nao seja
  -- 'agent'/'contact', entao nao ha dado real para agrupar por membro.
  IF public.delivery_stats(v_g_jid) ? 'participants' THEN
    RAISE EXCEPTION 'T8: a RPC passou a devolver participants — atualize este teste e o contrato';
  END IF;

  v_recusou := false;
  BEGIN
    INSERT INTO public.messages (id, contact_id, sender, status, content, message_type, created_at, is_deleted)
    VALUES (gen_random_uuid(), v_g_jid, '5511888888888', 'read', 'membro', 'text', now(), false);
  EXCEPTION WHEN others THEN
    v_recusou := true;
  END;
  IF NOT v_recusou THEN
    RAISE EXCEPTION 'T8: o banco aceitou um sender de membro de grupo — reabra o recorte por participante';
  END IF;
  IF EXISTS (SELECT 1 FROM public.messages m
              WHERE m.contact_id = v_g_jid AND m.sender = '5511888888888') THEN
    RAISE EXCEPTION 'T8: sobrou linha com autor de membro gravada';
  END IF;
  v_ok := v_ok + 1; RAISE NOTICE 'T8 OK: participants fora do contrato, provado pelo CHECK messages_sender_check';

  RAISE NOTICE 'delivery_stats: suite OK (% blocos de verificacao)', v_ok;
END
$delivery_stats$;

ROLLBACK;
