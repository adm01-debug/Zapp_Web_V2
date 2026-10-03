-- talkx_receipts_replies
-- versão 20261003212707 reservada para hermes-talkx-lidas-respostas-tempo-26100317561f47 em 2026-10-03T18:19:00-03:00 (hermes-db-migrar --nova)
-- talkx_v4_x027_lidas_respostas_tempo
-- Etapa X027 (F03-integridade-observabilidade-e-ensaio-real.md, seção X027)
-- Fase 3 · Camada banco · DDL: sim · Deploy de edge: não
-- Fecha CAP-016, CAP-017, CAP-018, CAP-019, CAP-020, CAP-099, CAP-110.
--
-- Delta real desta etapa (a V17 20260930680000 já aplicada entregou
-- talkx_recipients.read_at + índice + record_talkx_recipient_delivered(text,uuid,text);
-- a E88 20260916140000 já entregou replied_at/reply_message_id/replied_count e o índice
-- parcial (contact_id, sent_at DESC) WHERE replied_at IS NULL):
--   1. talkx_campaigns.read_count integer NOT NULL DEFAULT 0 + backfill por agregação.
--      ATENÇÃO: a V17 escreve campaign.read_count mas NUNCA criou a coluna — o ramo
--      'read' da RPC da V17 quebra em runtime (42703 coluna inexistente) na base
--      canônica. Esta etapa fecha essa lacuna.
--   2. enforce_talkx_campaign_mutability inclui read_count (corpo vivo de
--      20261003202707 + read_count nos 3 pontos de contador gerido pelo worker).
--   3. record_talkx_recipient_receipt(p_external_id, p_connection_id, p_event) — a RPC
--      canônica dos recibos delivered|read. 'read' preenche delivered_at se estiver
--      vazio; cada contador (delivered_count/read_count) sobe UMA única vez, guardado
--      pelo carimbo (delivered_at IS NULL / read_at IS NULL).
--   4. record_talkx_recipient_delivered(text,uuid,text) vira INVLÓUCRO da nova RPC
--      (assinatura preservada; nenhum chamador muda).
--   5. attribute_talkx_reply(p_contact_id, p_phone, p_message_id) (service_role): lê
--      talkx_settings.reply_window_hours (jsonb), procura o destinatário mais recente
--      por contact_id OU por telefone normalizado (sufixo de 8 dígitos, cobre contato
--      LID/duplicado) dentro da janela, e grava replied_at/reply_message_id.
--   6. talkx_campaign_reply_stats(p_campaign_id) (admin/supervisor): replied,
--      avg_reply_seconds, median_reply_seconds.
--   7. Publicação realtime de talkx_recipients (read_at incluído — ver nota abaixo).
--   8. Índice parcial (contact_id, sent_at DESC) WHERE replied_at IS NULL.
--
-- NOTA (publicação): a tabela tem REPLICA IDENTITY FULL (necessário para o filtro por
-- campaign_id no Realtime) e o PostgreSQL PROÍBE lista de colunas em publicação quando
-- a identidade é FULL (erro 42P10). Por isso a recriação usa a tabela SEM lista de
-- colunas — publica todas as colunas da tabela, o que INCLUI read_at (mesmo padrão da
-- 20260930590000, que removeu a lista explícita da 20260927420000 para não conflitar
-- com FULL). A guarda fail-closed abaixo prova que read_at está de fato listada em
-- pg_publication_tables.
--
-- Classe: CONTRATO (ADD COLUMN + CREATE OR REPLACE FUNCTION + ALTER PUBLICATION + CREATE INDEX).
-- Aplicar após o deploy: nenhum chamador de edge muda nesta etapa (o webhook X028 liga os
-- recibos e a RPC de resposta). Idempotente/replayável.
--
-- rollback: 1) DROP FUNCTION public.record_talkx_recipient_receipt(text,uuid,text), public.attribute_talkx_reply(uuid,text,uuid), public.talkx_campaign_reply_stats(uuid); 2) recriar public.record_talkx_recipient_delivered(text,uuid,text) com o corpo da 20260930680000; 3) recriar public.enforce_talkx_campaign_mutability() com o corpo da 20261003202707; 4) recriar a publicação de talkx_recipients com a lista de colunas da 20260927420000 (sem read_at) OU deixar como a 20260930590000; 5) ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS read_count.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) talkx_campaigns.read_count + backfill
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS read_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.talkx_campaigns.read_count IS
  'Destinatários que leram a mensagem (READ) — gerido pelo worker/RPC, nunca pelo cliente (X027).';

-- Backfill: o contador reflete os read_at já existentes.
UPDATE public.talkx_campaigns AS campaign
   SET read_count = agregado.cnt
  FROM (
    SELECT recipient.campaign_id, count(*)::integer AS cnt
      FROM public.talkx_recipients AS recipient
     WHERE recipient.read_at IS NOT NULL
     GROUP BY recipient.campaign_id
  ) AS agregado
 WHERE campaign.id = agregado.campaign_id
   AND campaign.read_count IS DISTINCT FROM agregado.cnt;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) enforce_talkx_campaign_mutability — corpo vivo (20261003202707) + read_count.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_talkx_campaign_mutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- X010: worker_id/worker_lease_expires_at NUNCA são escritos à mão. Só a RPC de
  -- lease (claim/release) liga app.talkx_worker_write, de forma transacional. Vale
  -- para QUALQUER papel — inclusive service_role — porque a trava é por campanha,
  -- não por destinatário.
  IF TG_OP = 'UPDATE'
     AND (NEW.worker_id IS DISTINCT FROM OLD.worker_id
          OR NEW.worker_lease_expires_at IS DISTINCT FROM OLD.worker_lease_expires_at)
     AND current_setting('app.talkx_worker_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'talkx_campaign_worker_managed_by_lease' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(auth.role(), '') <> 'authenticated' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'talkx_campaign_insert_must_be_draft' USING ERRCODE = '22023';
    END IF;
    IF NEW.total_recipients <> 0
       OR NEW.sent_count <> 0
       OR NEW.failed_count <> 0
       OR NEW.delivered_count <> 0
       OR NEW.outcome_unknown_count <> 0
       OR NEW.replied_count <> 0
       OR NEW.read_count <> 0
       OR NEW.skipped_count <> 0
       OR NEW.started_at IS NOT NULL
       OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- X026: além do rascunho, a RPC delete_talkx_campaign pode apagar 'scheduled'
    -- (sem envio). A fuga é transacional (app.talkx_campaign_delete) e NUNCA cobre
    -- 'sending'/'paused'/'completed'/'cancelled' — esses continuam recusados aqui.
    IF OLD.status <> 'draft'
       AND NOT (OLD.status = 'scheduled'
                AND current_setting('app.talkx_campaign_delete', true) = 'on') THEN
      RAISE EXCEPTION 'talkx_campaign_delete_denied' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'talkx_campaign_owner_immutable' USING ERRCODE = '42501';
  END IF;

  -- Escape hatch sancionado: só a RPC update_talkx_campaign_limits liga essa flag
  -- (transacional, nunca vaza para outra sessão). Ele permite os limites mudarem em
  -- qualquer status, mas status/dono/estado de entrega continuam geridos pelo worker
  -- e pelo dono. Defesa em profundidade (achado #6): o GUC sozinho não basta — o
  -- chamador precisa ser o dono da campanha (perfil ativo) ou admin/supervisor.
  IF current_setting('app.talkx_limits_write', true) = 'on' THEN
    IF NOT (
      EXISTS (
        SELECT 1
          FROM public.profiles profile
         WHERE profile.user_id = auth.uid()
           AND profile.is_active = true
           AND profile.id = NEW.created_by
      )
      OR COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS TRUE
    ) THEN
      RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'talkx_campaign_transition_denied' USING ERRCODE = '55000';
    END IF;
    IF NEW.total_recipients IS DISTINCT FROM OLD.total_recipients
       OR NEW.sent_count IS DISTINCT FROM OLD.sent_count
       OR NEW.failed_count IS DISTINCT FROM OLD.failed_count
       OR NEW.delivered_count IS DISTINCT FROM OLD.delivered_count
       OR NEW.outcome_unknown_count IS DISTINCT FROM OLD.outcome_unknown_count
       OR NEW.replied_count IS DISTINCT FROM OLD.replied_count
       OR NEW.read_count IS DISTINCT FROM OLD.read_count
       OR NEW.skipped_count IS DISTINCT FROM OLD.skipped_count
       OR NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
      RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status NOT IN ('draft', 'scheduled')
     OR NEW.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_campaign_transition_denied' USING ERRCODE = '55000';
  END IF;

  -- X014: agendar (ou manter agendado) é ato de admin/supervisor. A RLS de UPDATE
  -- também exige o papel; aqui é defesa em profundidade contra quem alcança a
  -- tabela por caminho que não passe pela policy.
  IF NEW.status = 'scheduled'
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_schedule_role_required' USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'scheduled'
     AND (NEW.scheduled_at IS NULL OR NEW.total_recipients <= 0) THEN
    RAISE EXCEPTION 'talkx_schedule_requires_audience_and_timestamp' USING ERRCODE = '22023';
  END IF;

  IF NEW.status = 'scheduled'
     AND NEW.scheduled_at <= statement_timestamp() THEN
    RAISE EXCEPTION 'talkx_schedule_must_be_future' USING ERRCODE = '22023';
  END IF;

  -- X009: sair de draft exige mensagem não vazia OU mídia — uma campanha agendada
  -- sem nada para enviar é recusada.
  IF NEW.status = 'scheduled'
     AND btrim(COALESCE(NEW.message_template, '')) = ''
     AND NEW.media_url IS NULL THEN
    RAISE EXCEPTION 'talkx_schedule_requires_message_or_media' USING ERRCODE = '22023';
  END IF;

  IF NEW.total_recipients IS DISTINCT FROM OLD.total_recipients
     AND current_setting('app.talkx_recipient_snapshot_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'talkx_recipient_count_managed' USING ERRCODE = '42501';
  END IF;

  IF NEW.sent_count IS DISTINCT FROM OLD.sent_count
     OR NEW.failed_count IS DISTINCT FROM OLD.failed_count
     OR NEW.delivered_count IS DISTINCT FROM OLD.delivered_count
     OR NEW.outcome_unknown_count IS DISTINCT FROM OLD.outcome_unknown_count
     OR NEW.replied_count IS DISTINCT FROM OLD.replied_count
     OR NEW.read_count IS DISTINCT FROM OLD.read_count
     OR NEW.skipped_count IS DISTINCT FROM OLD.skipped_count
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_talkx_campaign_mutability() FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) record_talkx_recipient_receipt — recibo canônico delivered|read.
--    'read' preenche delivered_at se vazio; cada contador sobe uma única vez.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_talkx_recipient_receipt(
  p_external_id   text,
  p_connection_id uuid,
  p_event         text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_recipient_id uuid;
  v_campaign_id uuid;
  v_delivered_at timestamptz;
  v_read_at timestamptz;
  v_external_id text := NULLIF(btrim(p_external_id), '');
  v_now timestamptz := statement_timestamp();
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF v_external_id IS NULL OR length(v_external_id) > 512 OR p_connection_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_delivery_ack' USING ERRCODE = '22023';
  END IF;
  IF p_event NOT IN ('delivered', 'read') THEN
    RAISE EXCEPTION 'invalid_talkx_delivery_event' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_external_id, 0));
  BEGIN
    SELECT recipient.id, recipient.campaign_id, recipient.delivered_at, recipient.read_at
      INTO STRICT v_recipient_id, v_campaign_id, v_delivered_at, v_read_at
      FROM public.talkx_recipients AS recipient
      JOIN public.talkx_campaigns AS campaign ON campaign.id = recipient.campaign_id
     WHERE recipient.external_id = v_external_id
       AND campaign.whatsapp_connection_id = p_connection_id
     FOR UPDATE OF recipient;
  EXCEPTION WHEN NO_DATA_FOUND THEN
    RETURN false;
  END;

  -- Cada contador sobe uma única vez: o carimbo é a guarda de idempotência.
  IF p_event = 'read' THEN
    IF v_read_at IS NOT NULL THEN
      RETURN false;
    END IF;

    UPDATE public.talkx_recipients
       SET read_at = v_now,
           delivered_at = COALESCE(delivered_at, v_now),
           status = CASE WHEN delivered_at IS NULL AND status = 'sent' THEN 'delivered' ELSE status END,
           updated_at = v_now
     WHERE id = v_recipient_id;

    UPDATE public.talkx_campaigns AS campaign
       SET read_count = campaign.read_count + 1,
           delivered_count = campaign.delivered_count + CASE WHEN v_delivered_at IS NULL THEN 1 ELSE 0 END,
           updated_at = v_now
     WHERE campaign.id = v_campaign_id;
  ELSE
    IF v_delivered_at IS NOT NULL THEN
      RETURN false;
    END IF;

    UPDATE public.talkx_recipients
       SET status = 'delivered',
           delivered_at = v_now,
           updated_at = v_now
     WHERE id = v_recipient_id;

    UPDATE public.talkx_campaigns AS campaign
       SET delivered_count = campaign.delivered_count + 1,
           updated_at = v_now
     WHERE campaign.id = v_campaign_id;
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_talkx_recipient_receipt(text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_talkx_recipient_receipt(text, uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.record_talkx_recipient_receipt(text, uuid, text) IS
  'Talk X (X027): recibo canônico delivered|read por external_id+conexão. read preenche delivered_at se vazio; delivered_count/read_count sobem uma única vez. Substitui o corpo de record_talkx_recipient_delivered (que passa a ser invólucro).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) record_talkx_recipient_delivered — invólucro da RPC canônica.
--    Assinatura preservada: (text, uuid, text DEFAULT 'delivered').
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_talkx_recipient_delivered(
  p_external_id   text,
  p_connection_id uuid,
  p_event         text DEFAULT 'delivered'
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT public.record_talkx_recipient_receipt(p_external_id, p_connection_id, p_event);
$function$;

REVOKE ALL ON FUNCTION public.record_talkx_recipient_delivered(text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_talkx_recipient_delivered(text, uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.record_talkx_recipient_delivered(text, uuid, text) IS
  'Talk X (X027): invólucro de compatibilidade de record_talkx_recipient_receipt. Mantém a assinatura (text, uuid, text DEFAULT ''delivered'') para os chamadores atuais.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) attribute_talkx_reply — atribuição de resposta por contact_id OU telefone.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.attribute_talkx_reply(
  p_contact_id uuid,
  p_phone      text,
  p_message_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_digits    text;
  v_tail      text;
  v_window    numeric;
  v_cutoff    timestamptz;
  v_recipient_id uuid;
  v_campaign_id  uuid;
  v_contact_id   uuid;
  v_attribution  text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_message_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_reply' USING ERRCODE = '22023';
  END IF;

  -- Telefone normalizado: só o sufixo de 8 dígitos casa (tolera DDI/DDD/9º dígito).
  v_digits := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  v_tail := CASE WHEN length(v_digits) >= 8 THEN right(v_digits, 8) ELSE NULL END;

  IF p_contact_id IS NULL AND v_tail IS NULL THEN
    RETURN jsonb_build_object('attributed', false, 'attribution', NULL, 'reason', 'no_subject');
  END IF;

  -- reply_window_hours é jsonb; `#>> '{}'` extrai o escalar como TEXTO antes do cast
  -- (NULLIF(jsonb, '') não existe — quebra em runtime, não na criação).
  SELECT COALESCE(NULLIF(value #>> '{}', '')::numeric, 72) INTO v_window
    FROM public.talkx_settings WHERE key = 'reply_window_hours' LIMIT 1;
  IF v_window IS NULL OR v_window <= 0 THEN
    v_window := 72;
  END IF;
  v_cutoff := statement_timestamp() - make_interval(hours => v_window::int);

  -- (1) contato exato; (2) mesmo telefone (cobre contato LID/duplicado com outro
  -- contact_id). Destinatário mais recente dentro da janela, ainda sem resposta.
  SELECT recipient.id, recipient.campaign_id, recipient.contact_id
    INTO v_recipient_id, v_campaign_id, v_contact_id
    FROM public.talkx_recipients AS recipient
    LEFT JOIN public.contacts AS contact ON contact.id = recipient.contact_id
   WHERE recipient.replied_at IS NULL
     AND recipient.sent_at IS NOT NULL
     AND recipient.sent_at >= v_cutoff
     AND (
       (p_contact_id IS NOT NULL AND recipient.contact_id = p_contact_id)
       OR (
         v_tail IS NOT NULL
         AND right(regexp_replace(COALESCE(contact.phone, ''), '\D', '', 'g'), 8) = v_tail
       )
     )
   ORDER BY recipient.sent_at DESC, recipient.id DESC
   LIMIT 1
   FOR UPDATE OF recipient;

  IF v_recipient_id IS NULL THEN
    RETURN jsonb_build_object('attributed', false, 'attribution', NULL, 'reason', 'no_recipient_in_window');
  END IF;

  v_attribution := CASE
    WHEN p_contact_id IS NOT NULL AND v_contact_id = p_contact_id THEN 'contact'
    ELSE 'phone'
  END;

  UPDATE public.talkx_recipients
     SET replied_at = statement_timestamp(),
         reply_message_id = p_message_id,
         updated_at = statement_timestamp()
   WHERE id = v_recipient_id
     AND replied_at IS NULL;

  RETURN jsonb_build_object(
    'attributed', true,
    'attribution', v_attribution,
    'recipient_id', v_recipient_id,
    'campaign_id', v_campaign_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.attribute_talkx_reply(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attribute_talkx_reply(uuid, text, uuid)
  TO service_role;

COMMENT ON FUNCTION public.attribute_talkx_reply(uuid, text, uuid) IS
  'Talk X (X027): grava replied_at/reply_message_id no destinatário mais recente do contato OU do telefone (sufixo de 8 dígitos) dentro de talkx_settings.reply_window_hours. Substitui a atribuição client-side da edge (attributeTalkXReply). SECURITY DEFINER, service_role.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) talkx_campaign_reply_stats — respostas e tempo de resposta (admin/supervisor).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.talkx_campaign_reply_stats(
  p_campaign_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_replied integer;
  v_avg     numeric;
  v_median  numeric;
BEGIN
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_campaign' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_reply_stats_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT count(*),
         ROUND(avg(EXTRACT(EPOCH FROM (replied_at - sent_at)))::numeric, 1),
         ROUND((percentile_cont(0.5) WITHIN GROUP (
                  ORDER BY EXTRACT(EPOCH FROM (replied_at - sent_at))
                ))::numeric, 1)
    INTO v_replied, v_avg, v_median
    FROM public.talkx_recipients
   WHERE campaign_id = p_campaign_id
     AND replied_at IS NOT NULL
     AND sent_at IS NOT NULL;

  RETURN jsonb_build_object(
    'campaign_id', p_campaign_id,
    'replied', COALESCE(v_replied, 0),
    'avg_reply_seconds', v_avg,
    'median_reply_seconds', v_median
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_campaign_reply_stats(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_reply_stats(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.talkx_campaign_reply_stats(uuid) IS
  'Talk X (X027): replied, avg_reply_seconds e median_reply_seconds da campanha (replied_at - sent_at). Admin/supervisor ou service_role.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) Publicação realtime de talkx_recipients (read_at incluído).
--    Sem lista de colunas: REPLICA IDENTITY FULL proíbe coluna listada (42P10).
--    Publicar a tabela inteira inclui read_at (padrão da 20260930590000).
-- ─────────────────────────────────────────────────────────────────────────────
-- ALTER PUBLICATION ... DROP TABLE não aceita IF EXISTS neste servidor: a remoção
-- da entrada (idempotente) é guardada por pg_publication_tables.
DO $pub$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'talkx_recipients'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.talkx_recipients;
  END IF;
END;
$pub$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.talkx_recipients;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) Índice parcial (contact_id, sent_at DESC) WHERE replied_at IS NULL.
--    Já existe como idx_talkx_recipients_reply_lookup (E88, predicado superset
--    com sent_at IS NOT NULL); só cria se nenhum equivalente existir.
-- ─────────────────────────────────────────────────────────────────────────────
DO $idx$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'talkx_recipients'
       AND indexdef ILIKE '%(contact_id, sent_at DESC)%'
       AND indexdef ILIKE '%replied_at IS NULL%'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_talkx_recipients_reply_pending
      ON public.talkx_recipients (contact_id, sent_at DESC)
      WHERE replied_at IS NULL;
  END IF;
END;
$idx$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) fail-closed: sem os objetos da etapa, a migration aborta.
-- ─────────────────────────────────────────────────────────────────────────────
DO $guard$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(esperado.assinatura, ', ') INTO v_missing
  FROM (
    VALUES
      ('public.record_talkx_recipient_receipt(text,uuid,text)'),
      ('public.record_talkx_recipient_delivered(text,uuid,text)'),
      ('public.attribute_talkx_reply(uuid,text,uuid)'),
      ('public.talkx_campaign_reply_stats(uuid)'),
      ('public.enforce_talkx_campaign_mutability()')
  ) AS esperado(assinatura)
  WHERE to_regprocedure(esperado.assinatura) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_x027_objetos_ausentes: %', v_missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'talkx_campaigns'
       AND column_name = 'read_count'
  ) THEN
    RAISE EXCEPTION 'talkx_x027_coluna_ausente: public.talkx_campaigns.read_count';
  END IF;

  -- read_at precisa estar efetivamente publicada. Sem lista de colunas (nosso caso,
  -- por causa do REPLICA IDENTITY FULL) o PG lista TODAS as colunas em attnames;
  -- a checagem aceita lista explícita OU attnames com read_at.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables AS pt
     WHERE pt.pubname = 'supabase_realtime'
       AND pt.schemaname = 'public'
       AND pt.tablename = 'talkx_recipients'
       AND (pt.attnames IS NULL OR 'read_at' = ANY(pt.attnames))
  ) THEN
    RAISE EXCEPTION 'talkx_x027_read_at_fora_da_publicacao';
  END IF;
END;
$guard$;
