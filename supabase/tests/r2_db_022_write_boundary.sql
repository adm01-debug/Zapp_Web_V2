-- Teste de regressão da fronteira de escrita de public.messages e da validação
-- canônica de mídia no enqueue (R2-DB-022, P1 — cartão t_813f36b7).
--
-- O QUE PROVA. Um authenticated não pode (1) reassociar media_url/proveniência de
-- uma mensagem que enxerga nem (2) forjar INSERT de mídia/proveniência, e o
-- enqueue_outbound_message (3) só aceita locator canônico (HTTPS, bucket privado
-- whatsapp-media|audio-messages e primeiro segmento do object path == p_contact_id),
-- enquanto texto sem mídia e o fluxo privilegiado (service_role/ingestão) continuam
-- passando.
--
-- COMO RODA. Com roles/JWT/RLS REAIS no banco LOCAL da tarefa (zapp-db-local psql):
--   zapp-db-local psql . <DB_LOCAL> < supabase/tests/r2_db_022_write_boundary.sql
-- Cada asserção usa SET LOCAL ROLE (authenticated|service_role) + set_config de
-- request.jwt.claims, dentro de uma transação que termina em ROLLBACK — sem side
-- effects e idempotente. Uma asserção que falha levanta EXCEPTION e derruba o script.
--
-- ATENÇÃO. A validação do locator é estrutural e host-agnóstica (não hardcoda o host
-- do projeto): o que importa para a credencial de Storage é bucket_id + object path
-- (a policy de SELECT casa objects.name), e a origem é revalidada a jusante por
-- resolvePrivateBucketUrl/origin. Query, fragment, percent-encoding e bucket fora da
-- allowlist são rejeitados aqui.

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures (determinísticos; execução como postgres, BYPASSRLS)
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','a@test.local','{"name":"Agente A"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002','b@test.local','{"name":"Agente B"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','agent'),
  ('bbbbbbbb-0000-0000-0000-000000000002','agent')
ON CONFLICT DO NOTHING;

INSERT INTO public.whatsapp_connections (id, name, phone_number, status, instance_id) VALUES
  ('cccccccc-0000-0000-0000-000000000003','Conn','5511999999999','connected','PRINCIPAL')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contacts (id, name, phone, assigned_to, whatsapp_connection_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000101','Contato A','5511988880001',
     (SELECT id FROM public.profiles WHERE user_id='aaaaaaaa-0000-0000-0000-000000000001'),
     'cccccccc-0000-0000-0000-000000000003'),
  ('bbbbbbbb-0000-0000-0000-000000000202','Contato B','5511988880002',
     (SELECT id FROM public.profiles WHERE user_id='bbbbbbbb-0000-0000-0000-000000000002'),
     'cccccccc-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.messages (id, contact_id, sender, content, message_type, media_url, agent_id, status, external_id) VALUES
  ('dddddddd-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000101','contact',
   'midia recebida','image',
   'https://db.example.com/storage/v1/object/public/whatsapp-media/aaaaaaaa-0000-0000-0000-000000000101/orig.jpg',
   NULL,'received','WA-EXT-1'),
  ('eeeeeeee-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-000000000101','agent',
   'midia enviada pelo agente A','image',
   'https://db.example.com/storage/v1/object/public/whatsapp-media/aaaaaaaa-0000-0000-0000-000000000101/sent.jpg',
   (SELECT id FROM public.profiles WHERE user_id='aaaaaaaa-0000-0000-0000-000000000001'),'sent',NULL)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- T1 — UPDATE: authenticated NÃO reassocia media_url de mensagem recebida
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_state text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.messages
       SET media_url = 'https://db.example.com/storage/v1/object/public/whatsapp-media/bbbbbbbb-0000-0000-0000-000000000202/media.jpg'
     WHERE id = 'dddddddd-0000-0000-0000-000000000004';
    RAISE EXCEPTION 'T1 FALHOU: reassociacao de media_url NAO bloqueada';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_provenance_forbidden' THEN
      RAISE EXCEPTION 'T1 FALHOU: bloqueio veio de RLS/GRANT, nao da trigger (%)', SQLERRM;
    END IF;
    RAISE NOTICE 'T1 OK: trigger bloqueou a reassociacao de media_url (42501 / %)', SQLERRM;
  END;
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------------
-- T2 — UPDATE: authenticated NÃO altera proveniência (contact_id/sender/agent_id/external_id)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.messages
       SET contact_id = 'bbbbbbbb-0000-0000-0000-000000000202'
     WHERE id = 'dddddddd-0000-0000-0000-000000000004';
    RAISE EXCEPTION 'T2 FALHOU: mudanca de contact_id NAO bloqueada';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_provenance_forbidden' THEN
      RAISE EXCEPTION 'T2 FALHOU: bloqueio veio de RLS/GRANT, nao da trigger (%)', SQLERRM;
    END IF;
    RAISE NOTICE 'T2 OK: trigger bloqueou a mudanca de proveniencia (42501 / %)', SQLERRM;
  END;
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------------
-- T3 — INSERT: authenticated NÃO forja mensagem com media_url de outro contato
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.messages (contact_id, sender, content, message_type, media_url, status)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000101','contact','forjada','image',
            'https://db.example.com/storage/v1/object/public/whatsapp-media/bbbbbbbb-0000-0000-0000-000000000202/media.jpg','received');
    RAISE EXCEPTION 'T3 FALHOU: INSERT forjado NAO bloqueado';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_sender_forbidden' THEN
      RAISE EXCEPTION 'T3 FALHOU: bloqueio veio de RLS/GRANT, nao da trigger (%)', SQLERRM;
    END IF;
    RAISE NOTICE 'T3 OK: trigger bloqueou o INSERT forjado (42501 / %)', SQLERRM;
  END;
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------------
-- T4 — enqueue: locator canônico no path do contato A PASSA
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT id INTO v_id FROM public.enqueue_outbound_message(
      'aaaaaaaa-0000-0000-0000-000000000101',
      gen_random_uuid(),
      '[Imagem]',
      'image',
      'https://db.example.com/storage/v1/object/public/whatsapp-media/aaaaaaaa-0000-0000-0000-000000000101/file.jpg',
      NULL, NULL, NULL);
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'T4 FALHOU: enqueue legitimo retornou nulo';
    END IF;
    RAISE NOTICE 'T4 OK: enqueue legitimo passou (id=%)', v_id;
  END;
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------------
-- T5 — enqueue: path do contato B FALHA
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.enqueue_outbound_message(
      'aaaaaaaa-0000-0000-0000-000000000101', gen_random_uuid(), '[Imagem]', 'image',
      'https://db.example.com/storage/v1/object/public/whatsapp-media/bbbbbbbb-0000-0000-0000-000000000202/media.jpg',
      NULL, NULL, NULL);
    RAISE EXCEPTION 'T5 FALHOU: path de outro contato NAO rejeitado';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'T5 OK: path de outro contato rejeitado (22023)';
  END;
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------------
-- T6 — enqueue: bucket fora da allowlist FALHA
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.enqueue_outbound_message(
      'aaaaaaaa-0000-0000-0000-000000000101', gen_random_uuid(), '[Sticker]', 'sticker',
      'https://db.example.com/storage/v1/object/public/stickers/bulk_1.webp',
      NULL, NULL, NULL);
    RAISE EXCEPTION 'T6 FALHOU: bucket fora da allowlist NAO rejeitado';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'T6 OK: bucket fora da allowlist rejeitado (22023)';
  END;
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------------
-- T7 — enqueue: URL externa (host/path não canônico) FALHA
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.enqueue_outbound_message(
      'aaaaaaaa-0000-0000-0000-000000000101', gen_random_uuid(), '[Imagem]', 'image',
      'https://evil.example.com/steal.jpg', NULL, NULL, NULL);
    RAISE EXCEPTION 'T7 FALHOU: URL externa NAO rejeitada';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'T7 OK: URL externa rejeitada (22023)';
  END;
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------------
-- T8 — enqueue: query string FALHA (URL ambígua)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.enqueue_outbound_message(
      'aaaaaaaa-0000-0000-0000-000000000101', gen_random_uuid(), '[Imagem]', 'image',
      'https://db.example.com/storage/v1/object/public/whatsapp-media/aaaaaaaa-0000-0000-0000-000000000101/file.jpg?download=1',
      NULL, NULL, NULL);
    RAISE EXCEPTION 'T8 FALHOU: query string NAO rejeitada';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'T8 OK: query string rejeitada (22023)';
  END;
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------------
-- T9 — enqueue: percent-encoding no path FALHA (URL ambígua)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.enqueue_outbound_message(
      'aaaaaaaa-0000-0000-0000-000000000101', gen_random_uuid(), '[Imagem]', 'image',
      'https://db.example.com/storage/v1/object/public/whatsapp-media/%2faaaaaaaa-0000-0000-0000-000000000101%2ffile.jpg',
      NULL, NULL, NULL);
    RAISE EXCEPTION 'T9 FALHOU: percent-encoding NAO rejeitado';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'T9 OK: percent-encoding rejeitado (22023)';
  END;
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------------
-- T10 — enqueue: texto sem mídia PASSA
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT id INTO v_id FROM public.enqueue_outbound_message(
      'aaaaaaaa-0000-0000-0000-000000000101', gen_random_uuid(), 'oi', 'text',
      NULL, NULL, NULL, NULL);
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'T10 FALHOU: texto sem midia retornou nulo';
    END IF;
    RAISE NOTICE 'T10 OK: texto sem midia passou (id=%)', v_id;
  END;
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------------
-- T11 — service_role: INSERT e UPDATE de mensagem recebida legada continuam passando
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_id uuid;
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.messages (contact_id, sender, content, message_type, media_url, status, external_id)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000202','contact','recebida legada','image','image/LEGACY123.jpg','received','WA-LEGACY-1')
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'T11 FALHOU: service_role nao inseriu mensagem legada';
  END IF;
  UPDATE public.messages SET media_url = 'image/LEGACY456.jpg' WHERE id = v_id;
  RAISE NOTICE 'T11 OK: service_role insere/atualiza midia legada (id=%)', v_id;
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------------
-- T12 — ingest_inbound_message (service_role) continua passando (mídia recebida legada)
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  SET LOCAL ROLE service_role;
  SELECT * INTO r FROM public.ingest_inbound_message(
    'cccccccc-0000-0000-0000-000000000003', '5511988880003', 'Novo Contato', 'img', 'image',
    'image/LEGACY-INGEST.jpg', 'WA-INGEST-1', now());
  IF r.message_id IS NULL THEN
    RAISE EXCEPTION 'T12 FALHOU: ingest_inbound_message nao inseriu mensagem';
  END IF;
  RAISE NOTICE 'T12 OK: ingestao recebida passou (message_id=%, outcome=%)', r.message_id, r.outcome;
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------------
-- T13 — INSERT: authenticated NÃO insere mensagem com media_url, mesmo no
--        formato canônico do próprio contato (só a trigger fecha esse caminho:
--        a policy de INSERT passaria com agent_id NULL e o WITH CHECK não vê
--        proveniência)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.messages (contact_id, sender, content, message_type, media_url, status)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000101','agent','imagem do agente','image',
            'https://db.example.com/storage/v1/object/public/whatsapp-media/aaaaaaaa-0000-0000-0000-000000000101/file.jpg','sending');
    RAISE EXCEPTION 'T13 FALHOU: INSERT com media_url NAO bloqueado';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_media_url_forbidden' THEN
      RAISE EXCEPTION 'T13 FALHOU: bloqueio veio de RLS/GRANT, nao da trigger (%)', SQLERRM;
    END IF;
    RAISE NOTICE 'T13 OK: trigger bloqueou INSERT com media_url (42501 / %)', SQLERRM;
  END;
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------------
-- T14 — UPDATE: authenticated NÃO altera media_url nem de mensagem com
--        sender='agent' do próprio usuário (proveniência segue fechada)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.messages
       SET media_url = 'https://db.example.com/storage/v1/object/public/whatsapp-media/bbbbbbbb-0000-0000-0000-000000000202/troca.jpg'
     WHERE id = 'eeeeeeee-0000-0000-0000-000000000005';
    RAISE EXCEPTION 'T14 FALHOU: troca de media_url em mensagem de agente NAO bloqueada';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'message_provenance_forbidden' THEN
      RAISE EXCEPTION 'T14 FALHOU: bloqueio veio de RLS/GRANT, nao da trigger (%)', SQLERRM;
    END IF;
    RAISE NOTICE 'T14 OK: trigger bloqueou troca de media_url em msg de agente (42501 / %)', SQLERRM;
  END;
  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------------
-- T15 — UPDATE legítimo (content, is_read) em mensagem visível PASSA e afeta
--        exatamente 1 linha: a edição legítima não pode ser barrada por RLS
--        nem pela trigger
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_rows integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.messages
     SET content = 'conteudo editado', is_read = true
   WHERE id = 'dddddddd-0000-0000-0000-000000000004';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RESET ROLE;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'T15 FALHOU: edicao legitima afetou % linha(s), esperado 1', v_rows;
  END IF;
  RAISE NOTICE 'T15 OK: edicao legitima de conteudo passou (1 linha)';
END $$;

-- ---------------------------------------------------------------------------
-- T16 — validador rejeita segmento de nome de arquivo '.'/'..' (e o enqueue
--        rejeita o mesmo path pelo caminho do usuário), mas aceita file.jpg
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_a text := 'aaaaaaaa-0000-0000-0000-000000000101';
BEGIN
  IF public.is_canonical_outbound_media_locator(
       'https://db.example.com/storage/v1/object/public/whatsapp-media/' || v_a || '/.', v_a::uuid) THEN
    RAISE EXCEPTION 'T16 FALHOU: segmento "." aceito pelo validador';
  END IF;
  IF public.is_canonical_outbound_media_locator(
       'https://db.example.com/storage/v1/object/public/whatsapp-media/' || v_a || '/..', v_a::uuid) THEN
    RAISE EXCEPTION 'T16 FALHOU: segmento ".." aceito pelo validador';
  END IF;
  IF NOT public.is_canonical_outbound_media_locator(
       'https://db.example.com/storage/v1/object/public/whatsapp-media/' || v_a || '/file.jpg', v_a::uuid) THEN
    RAISE EXCEPTION 'T16 FALHOU: nome legitimo file.jpg rejeitado pelo validador';
  END IF;
  RAISE NOTICE 'T16 OK: validador rejeita "."/".." e aceita file.jpg';
END $$;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.enqueue_outbound_message(
      'aaaaaaaa-0000-0000-0000-000000000101', gen_random_uuid(), '[Imagem]', 'image',
      'https://db.example.com/storage/v1/object/public/whatsapp-media/aaaaaaaa-0000-0000-0000-000000000101/..',
      NULL, NULL, NULL);
    RAISE EXCEPTION 'T16 FALHOU: enqueue aceitou path com segmento ".."';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM <> 'invalid_outbound_message' THEN
      RAISE EXCEPTION 'T16 FALHOU: erro inesperado do enqueue (%)', SQLERRM;
    END IF;
    RAISE NOTICE 'T16 OK: enqueue rejeitou ".." como ultimo segmento (22023 / %)', SQLERRM;
  END;
  RESET ROLE;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'r2_db_022_write_boundary: TODAS as assercoes passaram (T1-T16)';
END $$;

ROLLBACK;
