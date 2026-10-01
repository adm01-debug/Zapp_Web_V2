-- f33_multiplix_blocks_content
-- versão 20261001241230 reservada para hermes-bloco-c-multiplix-enums-fila-eventos-aud-26100120014cfb em 2026-10-01T20:36:26-03:00 (hermes-db-migrar --nova)

-- rollback: DROP FUNCTION IF EXISTS public.reorder_multiplix_blocks(uuid, uuid[]);
-- rollback: ALTER TABLE public.multiplix_blocks
-- rollback:   DROP COLUMN IF EXISTS content,
-- rollback:   DROP COLUMN IF EXISTS content_version,
-- rollback:   DROP COLUMN IF EXISTS content_hash,
-- rollback:   DROP COLUMN IF EXISTS asset_id,
-- rollback:   DROP COLUMN IF EXISTS personalization_mode;
-- rollback: COMMENT ON COLUMN public.multiplix_blocks.template_text IS NULL;
-- rollback: COMMENT ON COLUMN public.multiplix_blocks.voice_script IS NULL;
-- rollback: COMMENT ON COLUMN public.multiplix_blocks.media_url IS NULL;
-- rollback: COMMENT ON COLUMN public.multiplix_blocks.media_caption IS NULL;
-- rollback: -- (o CHECK multiplix_blocks_personalization_mode_check cai junto com a coluna
-- rollback: --  personalization_mode; as 4 colunas legadas nunca sao dropadas por esta migration,
-- rollback: --  entao reverter e so soltar as colunas novas e os comentarios.)

-- ============================================================================
-- F33 · Multiplix — `multiplix_blocks.content jsonb` + RPC atomica de reordenacao
-- Bloco C do docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md (linha 69).
-- ============================================================================
--
-- ESTADO DE ENTRADA (medido no canonico tnnnlkbymytvtqngbbqh, 2026-10-01):
--   multiplix_blocks tem 11 colunas: id, dispatch_id, block_order, block_type,
--   template_text, voice_script, voice_id, media_url, media_caption, created_at,
--   updated_at; UNIQUE multiplix_blocks_dispatch_order (dispatch_id, block_order);
--   a tabela NAO esta na publication supabase_realtime (confirmado em pg_publication_tables).
--   0 linhas na tabela -> isto e migracao de FORMA, nao de dado.
--   `multiplix_block_type` (enum do F30) ainda NAO existe no banco: o F30 e classe contrato e
--   aplica pos-merge. Esta migration NAO referencia o enum (nao altera block_type) de proposito,
--   entao ela roda igual antes ou depois do F30 e a prova nao precisa de preambulo.
--   `multiplix_blocks` nao esta na publication e nenhuma das suas policies cita a coluna
--   `status` de multiplix_dispatches de forma que trave o ALTER TYPE do F30 (a policy de
--   leitura cita so created_by; as de escrita citam md.status de outra tabela, nao desta).
--
-- POR QUE NAO HA `ALTER TYPE` AQUI: as 3 armadilhas medidas neste bloco (publication com lista
-- explicita de colunas, policy que cita `status`, indice parcial idx_multiplix_recipients_pending)
-- so travam `ALTER TYPE` de coluna existente. Esta migration so faz ADD COLUMN e CREATE FUNCTION,
-- entao nao encosta em nenhuma delas — confirmado por leitura do estado real acima.
--
-- DECISAO DO DONO respeitada: transacao + rollback reais, SEM DROP DE COLUNA NO MESMO PASSO.
-- As 4 colunas antigas (template_text/voice_script/media_url/media_caption) FICAM na tabela,
-- apenas marcadas como legado via COMMENT. `voice_id` continua ativa (blocos voice_ai).
--
-- FORMA DO jsonb `content` (so as chaves com valor aparecem; nulls sao removidos):
--   {
--     "text":  "<string>",                     -- legado: template_text
--     "voice": { "script":   "<string>",       -- legado: voice_script
--                "voice_id": "<string>" },     -- legado: voice_id
--     "media": { "url":     "<string>",        -- legado: media_url
--                "caption": "<string>" },     -- legado: media_caption
--     "asset": { "asset_id": "<uuid>" }        -- opcional; espelha a coluna asset_id
--   }
--   A coluna `asset_id` e a referencia autoritativa do ativo; `content.asset.asset_id`, quando
--   presente, e o mesmo valor dentro do payload para o snapshot do worker (F56). O backfill
--   abaixo NAO preenche "asset" (nao ha fonte legada para ele).
--
-- `content_version`/`content_hash` sao metadados operacionais do payload renderizado (o worker
-- usa hash/versao para detectar conteudo desatualizado); nao entram dentro de `content`.
-- `personalization_mode` decide o audio: 'same_audio' (mesmo audio para todos) x 'personalized'.

-- ---------- 1. colunas novas ----------
-- content entra com DEFAULT '{}' para que a coluna possa ser NOT NULL mesmo num ambiente com
-- linhas (aqui sao 0). O DEFAULT permanece: garante que todo bloco tem um objeto jsonb, sem
-- exigir que escritores existentes passem a mandar a coluna de imediato.
ALTER TABLE public.multiplix_blocks
  ADD COLUMN IF NOT EXISTS content jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS content_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS asset_id uuid,
  ADD COLUMN IF NOT EXISTS personalization_mode text;

ALTER TABLE public.multiplix_blocks
  DROP CONSTRAINT IF EXISTS multiplix_blocks_personalization_mode_check;

ALTER TABLE public.multiplix_blocks
  ADD CONSTRAINT multiplix_blocks_personalization_mode_check
    CHECK (personalization_mode IS NULL OR personalization_mode IN ('same_audio', 'personalized'));

-- ---------- 2. migracao de forma: 4 colunas antigas -> content ----------
-- 0 linhas hoje; o UPDATE existe para que a regra fique explicita e valha em qualquer ambiente
-- que ja tenha bloco. O WHERE evita sobrescrever content ja preenchido (replay seguro).
UPDATE public.multiplix_blocks
   SET content = jsonb_strip_nulls(jsonb_build_object(
         'text', template_text,
         'voice', CASE
                    WHEN voice_script IS NOT NULL OR voice_id IS NOT NULL
                    THEN jsonb_strip_nulls(jsonb_build_object(
                           'script',   voice_script,
                           'voice_id', voice_id))
                  END,
         'media', CASE
                    WHEN media_url IS NOT NULL OR media_caption IS NOT NULL
                    THEN jsonb_strip_nulls(jsonb_build_object(
                           'url',     media_url,
                           'caption', media_caption))
                  END
       ))
 WHERE content = '{}'::jsonb;

-- ---------- 3. documentacao das colunas (forma do content + legado) ----------
COMMENT ON COLUMN public.multiplix_blocks.content IS
  'Payload do bloco (F33). JSONB; so as chaves presentes aparecem. Forma: {"text":string, '
  '"voice":{"script":string,"voice_id":string}, "media":{"url":string,"caption":string}, '
  '"asset":{"asset_id":uuid}}. Substitui template_text/voice_script/voice_id/media_url/media_caption.';

COMMENT ON COLUMN public.multiplix_blocks.content_version IS
  'Versao do payload em `content` (incrementada a cada edicao relevante; default 1).';

COMMENT ON COLUMN public.multiplix_blocks.content_hash IS
  'Hash do payload renderizado de `content` para o worker (F56) detectar conteudo desatualizado.';

COMMENT ON COLUMN public.multiplix_blocks.asset_id IS
  'Referencia autoritativa do ativo de midia do bloco (quando houver). Espelhada em content.asset.asset_id.';

COMMENT ON COLUMN public.multiplix_blocks.personalization_mode IS
  'Modo de personalizacao: same_audio (mesmo audio para todos) | personalized (audio por destinatario).';

-- Colunas legadas: NAO removidas (decisao do dono — sem DROP de coluna no mesmo passo).
COMMENT ON COLUMN public.multiplix_blocks.template_text IS
  'LEGADO/DEPRECATED (F33): migrado para content->>''text''. Mantida; remover em passo posterior, '
  'apos o worker (F56) ler apenas `content`.';

COMMENT ON COLUMN public.multiplix_blocks.voice_script IS
  'LEGADO/DEPRECATED (F33): migrado para content->''voice''->>''script''. Mantida; remover em passo posterior.';

COMMENT ON COLUMN public.multiplix_blocks.media_url IS
  'LEGADO/DEPRECATED (F33): migrado para content->''media''->>''url''. Mantida; remover em passo posterior.';

COMMENT ON COLUMN public.multiplix_blocks.media_caption IS
  'LEGADO/DEPRECATED (F33): migrado para content->''media''->>''caption''. Mantida; remover em passo posterior.';

-- ---------- 4. RPC atomica de reordenacao ----------
-- Reordena os blocos do dispatch na ordem de p_block_ids. Exige o conjunto EXATO:
-- todos os ids pertencem ao dispatch e a quantidade bate com o total de blocos do dispatch.
-- Nao deixa buraco nem duplicata em (dispatch_id, block_order): a UNIQUE ja impede duplicata,
-- e o rewrite em DOIS PASSOS evita a colisao transitoria que um UPDATE unico causaria. O passo 1
-- soma offset tal que TODA a faixa vai para cima de max(valor_atual, n-1) — disjunta tanto dos
-- valores antigos quanto da faixa final 0..n-1, entao nao ha colisao com o UNIQUE na reescrita
-- (inclusive com block_order negativo no dado de entrada); o passo 2 grava 0..n-1, faixa ja livre.
-- Grants copiados do padrao do modulo (claim_multiplix_recipient): SECURITY DEFINER,
-- sem EXECUTE para PUBLIC/anon/authenticated; chamado pelo service_role (API de dominio F44).
CREATE OR REPLACE FUNCTION public.reorder_multiplix_blocks(p_dispatch_id uuid, p_block_ids uuid[])
 RETURNS TABLE(block_id uuid, block_order smallint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_input_count    integer;
  v_input_distinct integer;
  v_dispatch_count integer;
  v_matched        integer;
  v_min_order      smallint;
  v_max_order      smallint;
  v_offset         integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_dispatch_id IS NULL OR p_block_ids IS NULL OR array_length(p_block_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'invalid_multiplix_block_reorder' USING ERRCODE = '22023';
  END IF;

  IF array_position(p_block_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'multiplix_block_reorder_null_id' USING ERRCODE = '22023';
  END IF;

  SELECT count(*), count(DISTINCT b) INTO v_input_count, v_input_distinct
    FROM unnest(p_block_ids) AS b;

  IF v_input_count <> v_input_distinct THEN
    RAISE EXCEPTION 'multiplix_block_reorder_duplicate_ids' USING ERRCODE = '22023';
  END IF;

  -- Serializa reordenacoes concorrentes do mesmo dispatch.
  PERFORM 1 FROM public.multiplix_blocks
   WHERE dispatch_id = p_dispatch_id
   FOR UPDATE;

  SELECT count(*) INTO v_dispatch_count
    FROM public.multiplix_blocks
   WHERE dispatch_id = p_dispatch_id;

  IF v_dispatch_count <> v_input_count THEN
    RAISE EXCEPTION 'multiplix_block_reorder_set_mismatch' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_matched
    FROM public.multiplix_blocks
   WHERE dispatch_id = p_dispatch_id
     AND id = ANY (p_block_ids);

  IF v_matched <> v_input_count THEN
    RAISE EXCEPTION 'multiplix_block_reorder_foreign_block' USING ERRCODE = '22023';
  END IF;

  -- Passo 1: move TODA a faixa para cima de max(valor_atual, n-1), ficando disjunta tanto dos
  -- valores antigos (ainda nao reescritos) quanto da faixa final 0..n-1 do passo 2.
  SELECT min(b.block_order), max(b.block_order) INTO v_min_order, v_max_order
    FROM public.multiplix_blocks AS b
   WHERE b.dispatch_id = p_dispatch_id;

  v_offset := GREATEST(v_max_order::integer, v_input_count - 1) - v_min_order::integer + 1;

  IF (v_max_order::integer + v_offset) > 32767 THEN
    RAISE EXCEPTION 'multiplix_block_reorder_range_overflow' USING ERRCODE = '22003';
  END IF;

  UPDATE public.multiplix_blocks AS b
     SET block_order = (b.block_order::integer + v_offset)::smallint
   WHERE b.dispatch_id = p_dispatch_id;

  -- Passo 2: ordem final (0 = primeiro da lista).
  RETURN QUERY
  UPDATE public.multiplix_blocks AS b
     SET block_order = (ord.pos - 1)::smallint,
         updated_at  = statement_timestamp()
    FROM unnest(p_block_ids) WITH ORDINALITY AS ord(id, pos)
   WHERE b.dispatch_id = p_dispatch_id
     AND b.id = ord.id
  RETURNING b.id, b.block_order;
END;
$function$;

REVOKE ALL ON FUNCTION public.reorder_multiplix_blocks(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_multiplix_blocks(uuid, uuid[]) TO service_role;
