-- Limites de TIPO e TAMANHO dos buckets de mídia do WhatsApp e de áudio (cartão PK-26).
-- Paridade com a V3 / doc 06, 2ª passada. Arquivo PROVA do PK-26 (migration
-- supabase/migrations/<ts>_chat_media_buckets_limits.sql).
--
-- CONTEXTO. A migration 20260905030000 fechou `public` dos buckets de dados de
-- cliente (whatsapp-media, audio-messages) mas NÃO definiu `file_size_limit` nem
-- `allowed_mime_types`. A única validação viva hoje é do navegador
-- (src/utils/whatsappFileTypes.ts, validateFile) — qualquer cliente autenticado
-- sobe arquivo de QUALQUER tipo/tamanho por chamada direta ao Storage: o limite
-- tem de estar no SERVIDOR (storage.buckets), não no front.
--
-- CADA BUCKET TEM SUA EXIGÊNCIA:
--   * whatsapp-media  — recebe imagem, vídeo, áudio E documento: a allowlist cobre
--     as quatro famílias (imagem/vídeo/áudio/PDF) e recusa executável.
--   * audio-messages  — recebe só áudio: a allowlist tem de ser SÓ `audio/*`
--     (nada de imagem/vídeo/PDF), o que já exclui tipo executável.
--
-- COMO É EXECUTADO (correção de escopo). Este arquivo NÃO é rodado por nenhum
-- runner automático: `zapp-verify` (rápido e completo) não toca em `supabase/tests/`,
-- `db-guard.yml` só o cita em comentário, e `scripts/db-tests/run-all.mjs` varre o
-- próprio diretório (`scripts/db-tests`), salvo `DB_TESTS_DIR`. A execução é MANUAL e
-- read-only: pela wrapper `db_query`/`POST /rest/v1/rpc/mcp_exec` (como os demais
-- `supabase/tests/*.sql`) ou localmente por `zapp-db-local psql <cópia> <conjunto> -f -`.
-- Como a wrapper roda como service_role (BYPASSRLS), aqui se prova a ESTRUTURA
-- (o limite existe e é coerente com o catálogo do front), não o caminho de upload com
-- papéis reais — esse é provado com tokens/Storage no banco local da tarefa.
--
-- ESTADO ATUAL (13/10/2026): a migration do PK-26 ainda NÃO existe, então este
-- arquivo FALHA de propósito — é o vermelho que prova a lacuna. Como nada o roda
-- automaticamente, esse vermelho não afeta o lote do dia; quando o PK-26 integrar,
-- ele fica verde sem tocar em nada.
DO $$
DECLARE
  v_b        text;
  v_public   boolean;
  v_limit    bigint;
  v_mimes    text[];
  v_n        int;
  v_faltando text;
  v_proibido text;
BEGIN
  -- T0: os buckets existem e continuam fechados (garantia de 20260905030000)
  FOREACH v_b IN ARRAY ARRAY['whatsapp-media', 'audio-messages'] LOOP
    SELECT public INTO v_public FROM storage.buckets WHERE id = v_b;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'pk26_buckets T0 FALHOU: bucket % nao existe', v_b;
    END IF;
    IF v_public IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'pk26_buckets T0 FALHOU: bucket % voltou a public=%', v_b, v_public;
    END IF;
  END LOOP;
  RAISE NOTICE 'pk26_buckets: T0 ok (buckets existem e seguem privados)';

  -- T1: teto de tamanho definido no SERVIDOR (1 B .. 100 MB, teto do catalogo de documentos)
  FOREACH v_b IN ARRAY ARRAY['whatsapp-media', 'audio-messages'] LOOP
    SELECT file_size_limit INTO v_limit FROM storage.buckets WHERE id = v_b;
    IF v_limit IS NULL OR v_limit <= 0 OR v_limit > 104857600 THEN
      RAISE EXCEPTION 'pk26_buckets T1 FALHOU: bucket % sem file_size_limit valido (valor=%)', v_b, v_limit;
    END IF;
  END LOOP;
  RAISE NOTICE 'pk26_buckets: T1 ok (file_size_limit definido em ambos)';

  -- T2: lista de MIME permitidos definida no SERVIDOR.
  --     whatsapp-media: catalogo cheio (>= 10 tipos). audio-messages: basta 1 tipo (so audio).
  SELECT allowed_mime_types INTO v_mimes FROM storage.buckets WHERE id = 'whatsapp-media';
  v_n := COALESCE(array_length(v_mimes, 1), 0);
  IF v_n < 10 THEN
    RAISE EXCEPTION 'pk26_buckets T2 FALHOU: whatsapp-media sem allowed_mime_types util (n=%)', v_n;
  END IF;

  SELECT allowed_mime_types INTO v_mimes FROM storage.buckets WHERE id = 'audio-messages';
  v_n := COALESCE(array_length(v_mimes, 1), 0);
  IF v_n < 1 THEN
    RAISE EXCEPTION 'pk26_buckets T2 FALHOU: audio-messages sem allowed_mime_types util (n=%)', v_n;
  END IF;
  RAISE NOTICE 'pk26_buckets: T2 ok (allowlist definida: whatsapp-media com catalogo, audio-messages com >=1 tipo)';

  -- T3: coerencia com o catalogo do front (src/utils/whatsappFileTypes.ts).
  --     whatsapp-media cobre imagem/video/audio/PDF; audio-messages SO aceita audio/*.
  SELECT allowed_mime_types INTO v_mimes FROM storage.buckets WHERE id = 'whatsapp-media';
  SELECT string_agg(prefixo, ', ') INTO v_faltando
    FROM (VALUES ('image/'), ('video/'), ('audio/'), ('application/pdf')) AS exige(prefixo)
   WHERE NOT EXISTS (
           SELECT 1 FROM unnest(v_mimes) AS m
            WHERE m = exige.prefixo OR m LIKE exige.prefixo || '%'
         );
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'pk26_buckets T3 FALHOU: whatsapp-media nao cobre o catalogo do front: %', v_faltando;
  END IF;

  SELECT allowed_mime_types INTO v_mimes FROM storage.buckets WHERE id = 'audio-messages';
  SELECT string_agg(m, ', ') INTO v_proibido
    FROM unnest(v_mimes) AS m
   WHERE m NOT LIKE 'audio/%';
  IF v_proibido IS NOT NULL THEN
    RAISE EXCEPTION 'pk26_buckets T3 FALHOU: audio-messages com tipo fora de audio/*: %', v_proibido;
  END IF;
  RAISE NOTICE 'pk26_buckets: T3 ok (whatsapp-media cobre o catalogo; audio-messages so audio/*)';

  -- T4 (RECUSA): whatsapp-media nao permite tipo executavel/script...
  SELECT allowed_mime_types INTO v_mimes FROM storage.buckets WHERE id = 'whatsapp-media';
  SELECT string_agg(m, ', ') INTO v_proibido
    FROM unnest(v_mimes) AS m
   WHERE m IN ('application/x-msdownload', 'application/x-msdos-program',
               'application/vnd.microsoft.portable-executable',
               'application/x-executable', 'application/x-sh', 'application/x-bat',
               'application/x-msi', 'application/octet-stream')
      OR m LIKE '%executable%' OR m LIKE '%x-msdownload%';
  IF v_proibido IS NOT NULL THEN
    RAISE EXCEPTION 'pk26_buckets T4 FALHOU: whatsapp-media permite tipo executavel/script: %', v_proibido;
  END IF;

  -- ...e audio-messages nao aceita NADA fora de audio/* (o que tambem exclui executavel).
  SELECT allowed_mime_types INTO v_mimes FROM storage.buckets WHERE id = 'audio-messages';
  SELECT string_agg(m, ', ') INTO v_proibido
    FROM unnest(v_mimes) AS m
   WHERE m NOT LIKE 'audio/%';
  IF v_proibido IS NOT NULL THEN
    RAISE EXCEPTION 'pk26_buckets T4 FALHOU: audio-messages aceita tipo fora de audio/*: %', v_proibido;
  END IF;
  RAISE NOTICE 'pk26_buckets: T4 ok (whatsapp-media sem executavel; audio-messages so audio/*)';

  RAISE NOTICE 'pk26_buckets: TODAS AS ASSERCOES OK';
END $$;
