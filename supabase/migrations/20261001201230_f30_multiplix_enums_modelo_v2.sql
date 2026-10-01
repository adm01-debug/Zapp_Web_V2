-- f30_multiplix_enums_modelo_v2
-- versão 20261001201230 reservada para hermes-bloco-c-multiplix-enums-fila-eventos-aud-26100120014cfb em 2026-10-01T20:24:19-03:00 (hermes-db-migrar --nova)

-- F30 · Multiplix — enums do modelo de dados v2 (bloco C do plano de 100 etapas).
--
-- Cinco tipos: dispatch_status, recipient_status, item_status, block_type, eligibility.
-- As colunas de status hoje em `text + CHECK` passam a ser o tipo (com USING) e os CHECKs
-- em texto saem — o tipo passa a validar. As 3 tabelas tem 0 linhas (medido), entao nao ha
-- backfill; o USING fica explicito para que qualquer valor fora da lista falhe aqui, com
-- 22P02, e nao em producao depois.
--
-- Valores: os MESMOS em ingles que o codigo ja usa (o dono decidiu: banco em ingles,
-- rotulo em portugues na UI, com um unico mapa tipado + teste — ver F31/`src/lib/multiplix/`).
--   dispatch_status : draft, scheduled, sending, paused, completed, completed_with_failures, failed, cancelled
--   recipient_status: pending, sending, sent, delivered, read, failed, skipped, cancelled, outcome_unknown
--   item_status     : os do recipient + failed_transient (o indice parcial da fila do F32 filtra
--                     por ('pending','failed_transient'); 'failed_transient' nao existe no CHECK
--                     atual do recipient — e o unico valor novo do bloco).
--   block_type      : text, voice_ai, audio_recorded, file  (`voice` -> `voice_ai`)
--   eligibility     : eligible, no_destination, suppressed, out_of_scope, media_pending,
--                     connection_unavailable, requires_template
--
-- rollback: DROP TYPE IF EXISTS public.multiplix_eligibility, public.multiplix_block_type, public.multiplix_item_status, public.multiplix_recipient_status, public.multiplix_dispatch_status;
-- rollback: -- antes do DROP, cada coluna volta a `text` (o enum nao tem caminho de volta se houver valor fora da lista):
-- rollback: --   ALTER TABLE public.multiplix_blocks ALTER COLUMN block_type DROP DEFAULT;
-- rollback: --   ALTER TABLE public.multiplix_blocks ALTER COLUMN block_type TYPE text USING (CASE block_type WHEN 'voice_ai' THEN 'voice' ELSE block_type::text END);
-- rollback: --   ALTER TABLE public.multiplix_recipients DROP CONSTRAINT IF EXISTS multiplix_recipients_delivery_claim_state;
-- rollback: --   ALTER TABLE public.multiplix_recipients ALTER COLUMN status DROP DEFAULT, ALTER COLUMN status TYPE text USING status::text;
-- rollback: --   ALTER TABLE public.multiplix_dispatches ALTER COLUMN status DROP DEFAULT, ALTER COLUMN status TYPE text USING status::text;
-- rollback: -- e recriar os CHECKs em texto como estavam em 20260929600000_multiplix_send_engine_fixes.sql
-- rollback: -- (multiplix_dispatches_status_check, multiplix_recipients_status_check, multiplix_blocks_block_type_check)
-- rollback: -- e a multiplix_recipients_delivery_claim_state como em 20260926180000_multiplix_send_engine.sql.
-- rollback: -- a publication volta ao estado de 20260929620000_multiplix_realtime_column_scope.sql (o mesmo par
-- rollback: -- DROP TABLE/ADD TABLE com a lista de colunas de multiplix_dispatches e de multiplix_recipients).

-- ============ 0. publication (realtime) ============
-- `multiplix_dispatches.status` e `multiplix_recipients.status` estao em
-- `supabase_realtime` com LISTA EXPLICITA de colunas, e o Postgres RECUSA o
-- `ALTER TYPE` de coluna usada pela publication — medido em transacao de prova:
--   0A000: cannot alter type of a column used by a publication WHERE clause
--   DETAIL: publication of table multiplix_dispatches in publication supabase_realtime depends on column "status"
-- Solta as duas tabelas e as devolve no fim, com a MESMA lista de colunas (o mesmo
-- movimento de 20260929620000_multiplix_realtime_column_scope.sql). `multiplix_blocks`
-- nao esta na publication.
ALTER PUBLICATION supabase_realtime DROP TABLE public.multiplix_dispatches;
ALTER PUBLICATION supabase_realtime DROP TABLE public.multiplix_recipients;

-- ============ 0.1 policies que citam `status` ============
-- Mesma classe de bloqueio: uma policy que le `dispatches.status` tambem trava o ALTER
-- TYPE — medido: 0A000 "cannot alter type of a column used in a policy definition"
-- ("policy Users can insert blocks into own draft dispatches on table multiplix_blocks
-- depends on column status"). Sao 5 policies em 3 tabelas; saem aqui e voltam no passo 4
-- com o texto identico (as definicoes vem de 20260929580000 e 20260929570000).
DROP POLICY IF EXISTS "Users can delete own draft dispatches" ON public.multiplix_dispatches;
DROP POLICY IF EXISTS "Users can delete recipients of own draft dispatches" ON public.multiplix_recipients;
DROP POLICY IF EXISTS "Users can insert blocks into own draft dispatches" ON public.multiplix_blocks;
DROP POLICY IF EXISTS "Users can update blocks of own draft dispatches" ON public.multiplix_blocks;
DROP POLICY IF EXISTS "Users can delete blocks of own draft dispatches" ON public.multiplix_blocks;

-- ============ 1. os cinco tipos ============

CREATE TYPE public.multiplix_dispatch_status AS ENUM (
  'draft',
  'scheduled',
  'sending',
  'paused',
  'completed',
  'completed_with_failures',
  'failed',
  'cancelled'
);

CREATE TYPE public.multiplix_recipient_status AS ENUM (
  'pending',
  'sending',
  'sent',
  'delivered',
  'read',
  'failed',
  'skipped',
  'cancelled',
  'outcome_unknown'
);

-- Mesmos estados do recipient + `failed_transient`: a fila de itens do F32 tem um
-- indice parcial `(status, next_attempt_at) WHERE status IN ('pending','failed_transient')`
-- e `failed_transient` nao existe no vocabulario do recipient.
CREATE TYPE public.multiplix_item_status AS ENUM (
  'pending',
  'sending',
  'sent',
  'delivered',
  'read',
  'failed',
  'failed_transient',
  'skipped',
  'cancelled',
  'outcome_unknown'
);

CREATE TYPE public.multiplix_block_type AS ENUM (
  'text',
  'voice_ai',
  'audio_recorded',
  'file'
);

CREATE TYPE public.multiplix_eligibility AS ENUM (
  'eligible',
  'no_destination',
  'suppressed',
  'out_of_scope',
  'media_pending',
  'connection_unavailable',
  'requires_template'
);

-- ============ 2. conversao das colunas ============

-- 2.1 multiplix_dispatches.status
ALTER TABLE public.multiplix_dispatches
  DROP CONSTRAINT IF EXISTS multiplix_dispatches_status_check;

ALTER TABLE public.multiplix_dispatches
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public.multiplix_dispatch_status
    USING status::public.multiplix_dispatch_status,
  ALTER COLUMN status SET DEFAULT 'draft'::public.multiplix_dispatch_status;

-- 2.2 multiplix_recipients.status
-- O CHECK que amarra `status='sending'` ao claim referencia a coluna: sai antes do ALTER
-- TYPE e volta depois, com o mesmo desenho (os literais resolvem para o enum).
ALTER TABLE public.multiplix_recipients
  DROP CONSTRAINT IF EXISTS multiplix_recipients_delivery_claim_state;

ALTER TABLE public.multiplix_recipients
  DROP CONSTRAINT IF EXISTS multiplix_recipients_status_check;

-- O indice parcial carrega o predicado `status = 'pending'::text` e o Postgres revalida
-- o predicado no ALTER TYPE (mesmo 42883, medido). Sai aqui e volta no passo 2.4.
DROP INDEX IF EXISTS public.idx_multiplix_recipients_pending;

ALTER TABLE public.multiplix_recipients
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public.multiplix_recipient_status
    USING status::public.multiplix_recipient_status,
  ALTER COLUMN status SET DEFAULT 'pending'::public.multiplix_recipient_status;

ALTER TABLE public.multiplix_recipients
  ADD CONSTRAINT multiplix_recipients_delivery_claim_state
    CHECK (
      (status = 'sending' AND delivery_claim_token IS NOT NULL AND delivery_claimed_at IS NOT NULL
        AND delivery_claim_expires_at IS NOT NULL AND delivery_claimed_by IS NOT NULL)
      OR
      (status <> 'sending' AND delivery_claim_token IS NULL AND delivery_claimed_at IS NULL
        AND delivery_claim_expires_at IS NULL AND delivery_claimed_by IS NULL)
    );

-- 2.4 o indice parcial volta, com o mesmo predicado (o literal resolve para o enum)
CREATE INDEX idx_multiplix_recipients_pending
  ON public.multiplix_recipients (dispatch_id)
  WHERE (status = 'pending');

-- 2.3 multiplix_blocks.block_type
-- `voice` -> `voice_ai`; `image` nao tem valor correspondente no desenho novo (0 linhas
-- na tabela, entao a conversao nao perde dado). O CHECK em texto sai.
ALTER TABLE public.multiplix_blocks
  DROP CONSTRAINT IF EXISTS multiplix_blocks_block_type_check;

ALTER TABLE public.multiplix_blocks
  ALTER COLUMN block_type TYPE public.multiplix_block_type
    USING (
      CASE block_type
        WHEN 'voice' THEN 'voice_ai'
        ELSE block_type
      END
    )::public.multiplix_block_type;

-- ============ 3. publication: devolve as duas tabelas ============
-- Mesma lista de colunas de antes do passo 0: o escopo do realtime nao muda com o
-- bloco C (`status` continua publicada, agora tipada como enum).
ALTER PUBLICATION supabase_realtime ADD TABLE public.multiplix_dispatches (
  id, name, status, total_recipients, sent_count, failed_count, delivered_count,
  outcome_unknown_count, started_at, paused_at, pause_reason, completed_at,
  scheduled_at, whatsapp_connection_id, created_by, created_at, updated_at
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.multiplix_recipients (
  id, dispatch_id, company_id, company_name_snapshot, destino_origem, status,
  sent_at, delivered_at, error_message, delivery_claimed_at, delivery_claim_expires_at,
  delivery_claimed_by, delivery_attempt_count, created_at, updated_at, attempt_count,
  retry_after, provider_dispatch_started_at, external_id
);

-- ============ 4. policies: devolve as 5 (texto identico ao do passo 0.1) ============
-- `status = 'draft'` segue sem cast: o literal resolve para o enum, e o predicado nao muda.
CREATE POLICY "Users can delete own draft dispatches" ON public.multiplix_dispatches
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    AND status = 'draft'
  );

CREATE POLICY "Users can delete recipients of own draft dispatches" ON public.multiplix_recipients
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  );

CREATE POLICY "Users can insert blocks into own draft dispatches" ON public.multiplix_blocks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  );

CREATE POLICY "Users can update blocks of own draft dispatches" ON public.multiplix_blocks
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  )
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  );

CREATE POLICY "Users can delete blocks of own draft dispatches" ON public.multiplix_blocks
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_blocks.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  );
