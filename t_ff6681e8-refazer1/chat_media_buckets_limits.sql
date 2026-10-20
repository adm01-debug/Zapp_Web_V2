-- PK-26: limites de bucket da midia do chat (paridade doc 06) — PROVA.
--
-- CONTEXTO (verificado em 14/10/2026, refazer 1):
--   Os buckets reais do banco sao whatsapp-media e audio-messages, criados
--   privados pela migration 20260905030000_private_media_buckets.sql (:11
--   "UPDATE storage.buckets SET public = false WHERE id IN
--   ('whatsapp-media', 'audio-messages', 'team-chat-files')") com 6.074
--   objetos reais em producao (comentario :2 da mesma migration).
--   Os nomes chat-audio/chat-video/chat-docs/chat-images nao existem em
--   nenhum estado observavel do repo (grep em HEAD, em dia/2026-10-14 e em
--   supabase/: zero ocorrencias), nem docs/ledger/limites.md nem corpo-pr.md
--   existem nesses estados. Por isso este refazer MANTEM whatsapp-media e
--   audio-messages: cada expectativa abaixo liga ao trecho que a sustenta
--   (prova funcional nos buckets mantidos).
--   - existencia + fechado -> migration 20260905030000 (:11 e :2);
--   - tetos 16 MB / 100 MB -> src/utils/whatsappFileTypes.ts (:16 imagem,
--     :23 video, :37 audio, :69 documento);
--   - familias de MIME por bucket -> mesmo arquivo (:10-:155).
--
-- ESTADO ATUAL: a migration do PK-26 (file_size_limit + allowed_mime_types)
-- NAO existe em HEAD nem em dia/2026-10-14 (ls supabase/migrations em
-- 14/10/2026) -> T1 e T2 FALHAM (vermelho que prova a pendencia).
-- Quando o PK-26 integrar com os valores do contrato abaixo, este arquivo
-- fica verde sem tocar em nada.
--
-- CONTRATO QUE O PK-26 PRECISA ENTREGAR (tetos exatos, derivados do catalogo):
--   audio-messages: file_size_limit = 16777216 (16 MB = teto do audio, :37)
--     e allowed_mime_types = exatamente os 6 MIMEs de audio do catalogo.
--   whatsapp-media: file_size_limit = 104857600 (100 MB = teto do documento,
--     :69, a maior familia que o bucket misto aceita) e allowed_mime_types
--     contendo os 24 MIMEs das 4 familias do catalogo (imagem 3 + video 2 +
--     audio 6 + documento 13).
--
-- EXECUCAO: pela wrapper db_query (service_role) ou
--   zapp-db-local psql <copia> <conjunto> -f - < supabase/tests/chat_media_buckets_limits.sql
-- Somente leitura: nenhum INSERT/UPDATE/DELETE/CREATE fora de transacao de
-- prova (este arquivo nao escreve nada; SET ROLE e desfeito no proprio T0).
-- Idempotente: pode rodar N vezes; mesma entrada, mesma saida.

DO $$
DECLARE
  v_pub            boolean;
  v_limite         bigint;
  v_mimes          text[];
  -- Teto exato por bucket (bytes), do catalogo src/utils/whatsappFileTypes.ts:
  c_limite_audio   constant bigint := 16777216;   -- 16 MB: audio (:37)
  c_limite_misto   constant bigint := 104857600;  -- 100 MB: documento (:69)
  -- Allowlist exata do audio-messages: os 6 MIMEs de audio do catalogo (:38-:45).
  c_audio_mimes    constant text[] := ARRAY[
    'audio/aac', 'audio/amr', 'audio/mpeg', 'audio/ogg', 'audio/opus', 'audio/mp4'
  ];
  -- Familias que o whatsapp-media aceita (imagem :10-:15, video :17-:22,
  -- audio :24-:45, documento :47-:68): 3 + 2 + 6 + 13 = 24 MIMEs.
  c_misto_familias constant text[] := ARRAY[
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/3gpp',
    'audio/aac', 'audio/amr', 'audio/mpeg', 'audio/ogg', 'audio/opus', 'audio/mp4',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'application/zip',
    'application/x-rar-compressed', 'application/x-rar', 'application/vnd.rar'
  ];
  v_quem           text;
  v_bypass         boolean;
  v_visiveis       integer;
  v_faltando       text;
BEGIN
  -- T0 (PK-26): bucket fechado, provado em sessao restrita e no estrutural.
  -- T0a (papel restrito): como authenticated (sem bypass), os metadados dos
  -- buckets privados sao invisiveis (RLS de storage.buckets sem policy) —
  -- um cliente restrito nao enumera nem bucket fechado.
  SET ROLE authenticated;
  BEGIN
    SELECT current_user INTO v_quem;
    IF v_quem <> 'authenticated' THEN
      RAISE EXCEPTION 'T0a reprovado: sessao nao esta restrita (current_user=%)', v_quem;
    END IF;
    SELECT rolbypassrls INTO v_bypass FROM pg_roles WHERE rolname = current_user;
    IF v_bypass IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'T0a reprovado: papel restrito com bypass de RLS';
    END IF;
    SELECT COUNT(*) INTO v_visiveis FROM storage.buckets;
    IF v_visiveis <> 0 THEN
      RAISE EXCEPTION 'T0a reprovado: papel restrito enxerga % bucket(s); metadado de bucket privado nao pode vazar', v_visiveis;
    END IF;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RAISE;
  END;
  -- T0b (estrutural): os dois buckets existem e sao privados (20260905030000).
  SELECT public INTO v_pub FROM storage.buckets WHERE id = 'whatsapp-media';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'T0 reprovado: bucket whatsapp-media nao existe (20260905030000)';
  END IF;
  IF v_pub IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'T0 reprovado: whatsapp-media ficou publico (public=%)', v_pub;
  END IF;
  SELECT public INTO v_pub FROM storage.buckets WHERE id = 'audio-messages';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'T0 reprovado: bucket audio-messages nao existe (20260905030000)';
  END IF;
  IF v_pub IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'T0 reprovado: audio-messages ficou publico (public=%)', v_pub;
  END IF;

  -- T1 (PK-26): teto EXATO por bucket (NULL = sem migration = reprovado).
  SELECT file_size_limit INTO v_limite FROM storage.buckets WHERE id = 'audio-messages';
  IF v_limite IS DISTINCT FROM c_limite_audio THEN
    RAISE EXCEPTION 'T1 reprovado: audio-messages exige teto de 16 MB (%, teto do audio em :37); atual=%', c_limite_audio, v_limite;
  END IF;
  SELECT file_size_limit INTO v_limite FROM storage.buckets WHERE id = 'whatsapp-media';
  IF v_limite IS DISTINCT FROM c_limite_misto THEN
    RAISE EXCEPTION 'T1 reprovado: whatsapp-media exige teto de 100 MB (%, teto do documento em :69); atual=%', c_limite_misto, v_limite;
  END IF;

  -- T2 (PK-26): allowlist por bucket, sem numero redondo.
  -- audio-messages = EXATAMENTE os 6 audios do catalogo (nem mais, nem menos).
  SELECT COALESCE(allowed_mime_types, '{}') INTO v_mimes FROM storage.buckets WHERE id = 'audio-messages';
  IF NOT (v_mimes <@ c_audio_mimes AND v_mimes @> c_audio_mimes AND COALESCE(array_length(v_mimes, 1), 0) = 6) THEN
    RAISE EXCEPTION 'T2 reprovado: audio-messages exige exatamente os 6 MIMEs de audio do catalogo (:38-:45); atual=%', v_mimes;
  END IF;
  -- whatsapp-media CONTEM os 24 MIMEs das 4 familias (superconjunto: a
  -- Evolution pode enviar application/octet-stream, entao extras sao
  -- tolerados aqui e barrados por familia no T3).
  SELECT COALESCE(allowed_mime_types, '{}') INTO v_mimes FROM storage.buckets WHERE id = 'whatsapp-media';
  SELECT m INTO v_faltando FROM unnest(c_misto_familias) AS m WHERE NOT (m = ANY (v_mimes)) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'T2 reprovado: whatsapp-media nao cobre a familia do catalogo; falta %', v_faltando;
  END IF;

  -- T3 (PK-20/21/24): cada tipo cai no bucket certo. O MIME do objeto mora
  -- em metadata->>'mimetype' (storage.objects nao tem coluna media_type).
  -- audio-messages so audio/*; mimetype ausente (gravacao sem extensao ou
  -- legado) e tolerado aqui e coberto por extensao no T4.
  IF EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'audio-messages'
      AND (metadata->>'mimetype') IS NOT NULL AND (metadata->>'mimetype') NOT LIKE 'audio/%'
  ) THEN
    RAISE EXCEPTION 'T3 reprovado: audio-messages com objeto nao-audio';
  END IF;
  -- whatsapp-media so familias do catalogo (imagem/video/audio/documento).
  IF EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'whatsapp-media'
      AND (metadata->>'mimetype') IS NOT NULL
      AND (metadata->>'mimetype') NOT LIKE 'image/%'
      AND (metadata->>'mimetype') NOT LIKE 'video/%'
      AND (metadata->>'mimetype') NOT LIKE 'audio/%'
      AND (metadata->>'mimetype') NOT LIKE 'application/%'
      AND (metadata->>'mimetype') NOT LIKE 'text/%'
  ) THEN
    RAISE EXCEPTION 'T3 reprovado: whatsapp-media com objeto fora das familias do catalogo';
  END IF;

  -- T4 (PK-20/21/24): executavel nao entra em bucket de midia.
  IF EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id IN ('whatsapp-media', 'audio-messages')
      AND (
        (metadata->>'mimetype') ILIKE '%executable%' OR (metadata->>'mimetype') ILIKE '%x-msdownload%'
        OR (metadata->>'mimetype') ILIKE '%x-sh%' OR (metadata->>'mimetype') ILIKE '%shell%'
        OR name ILIKE '%.exe' OR name ILIKE '%.msi' OR name ILIKE '%.bat'
        OR name ILIKE '%.cmd' OR name ILIKE '%.ps1' OR name ILIKE '%.sh'
      )
  ) THEN
    RAISE EXCEPTION 'T4 reprovado: executavel em bucket de midia';
  END IF;

  RAISE NOTICE 'PK-26 buckets OK: 2 privados, tetos 16/100 MB, allowlists por familia';
END
$$;
