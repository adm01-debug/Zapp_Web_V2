-- talkx_v4_x057b_segmentos_salvar_resolver
-- Rollback: desfaz TUDO — a migration so troca os corpos de 2 funcoes (nenhum
--   dado, tabela, policy, grant de tabela ou publicacao e tocado), entao basta
--   reaplicar os corpos anteriores, que estao versionados no repo:
--   1) public.save_talkx_campaign_draft(uuid,bigint,uuid,jsonb): execute o bloco
--      de 20261003232707_talkx_lgpd_consentimento_expurgo.sql que vai de
--      'CREATE OR REPLACE FUNCTION public.save_talkx_campaign_draft' ate o
--      COMMENT da funcao (corpo anterior verbatim, com REVOKE/GRANT/COMMENT);
--   2) public.snapshot_talkx_campaign_audience(uuid,bigint): idem, bloco de
--      20261002421230_talkx_audience_snapshot.sql.
--   O teste talkx-campaign-segments.test.sh (BLOCO RB) executa exatamente esse
--   caminho e confere o estado anterior restaurado.
--
-- X057b (Talk X V4, Fase 6) — parte de COMPORTAMENTO: salvar e resolver
-- varios segmentos por campanha (a X057a entregou a estrutura).
--
-- HOJE: public.talkx_campaign_segments existe com RLS e backfill, mas nenhuma
-- funcao a le ou escreve — o rascunho nao salva a lista ordenada e o snapshot
-- resolve so o segment_id legado, sem carimbar talkx_recipients.segment_id.
--
-- FAZER (esta migration, mesmas assinaturas — segment_ids entra no p_payload):
--   1. save_talkx_campaign_draft: le p_payload -> 'segment_ids' (array JSON de
--      uuids na ordem de envio, position 1 = primeiro). Validacao 22023 antes
--      de qualquer escrita: source='segment' exige lista 1..10; uuid repetido,
--      item nao-uuid e lista nao-vazia com source <> 'segment' sao recusados.
--      Na MESMA transacao do rascunho regrava a lista ordenada (delete +
--      insert 1..N, status espelhando a campanha como no backfill) e mantem
--      segment_id = primeiro da lista. Payload antigo (so segment_id) grava
--      1 linha; a lista tambem entra na comparacao de replay da creation_key.
--   2. snapshot_talkx_campaign_audience: para audience_source='segment' une
--      os contatos dos segmentos em ordem de position — cada contato entra
--      UMA vez, com o segment_id do primeiro segmento que o contem, e
--      total_recipients conta os unicos. Campanha antiga sem linhas na
--      tabela cai no segment_id legado. Tudo numa transacao so.
--
-- Fora de escopo (X058): talkx_next_recipients, ordem de fila e pausa por
-- segmento nao mudam aqui.
--
-- 1) save_talkx_campaign_draft — corpo vivo 20261003232707 + segment_ids ----
CREATE OR REPLACE FUNCTION public.save_talkx_campaign_draft(
  p_campaign_id uuid,
  p_expected_revision bigint,
  p_creation_key uuid,
  p_payload jsonb
)
RETURNS TABLE(campaign_id uuid, revision bigint, creation_replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_now timestamptz := statement_timestamp();
  v_name text;
  v_message_template text;
  v_description text;
  v_objective text;
  v_audience_source text;
  v_audience_filters jsonb;
  v_segment_id uuid;
  v_template_id uuid;
  v_connection_id uuid;
  v_media_url text;
  v_media_type text;
  v_scheduled_at timestamptz;
  v_schedule_timezone text;
  v_window_start time;
  v_window_end time;
  v_speed_profile text;
  v_typing_delay_min integer;
  v_typing_delay_max integer;
  v_send_interval_min integer;
  v_send_interval_max integer;
  v_business_hours_only boolean;
  v_respect_suppression boolean;
  v_confirm_consent boolean;
  v_legal_basis text;
  v_consent_by uuid;
  v_consent_at timestamptz;
  v_draft_step integer;
  v_owner uuid;
  v_template_version_id uuid;
  v_requested_status text;
  v_max_per_minute smallint;
  v_pace record;
  v_segment_ids uuid[];
  v_segment_list uuid[] := ARRAY[]::uuid[];
  v_stored_segment_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor_profile_id
   FROM public.profiles profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1
   FOR SHARE;
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;

  -- X014: criar/editar rascunho é ato de admin/supervisor.
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR pg_column_size(p_payload) > 65536 THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_payload' USING ERRCODE = '22023';
  END IF;

  v_name := NULLIF(btrim(p_payload ->> 'name'), '');
  v_message_template := COALESCE(p_payload ->> 'message_template', '');
  v_description := p_payload ->> 'description';
  v_objective := p_payload ->> 'objective';
  v_audience_source := p_payload ->> 'audience_source';
  v_audience_filters := COALESCE(p_payload -> 'audience_filters', '{}'::jsonb);
  v_segment_id := NULLIF(p_payload ->> 'segment_id', '')::uuid;
  v_template_id := NULLIF(p_payload ->> 'template_id', '')::uuid;
  v_connection_id := NULLIF(p_payload ->> 'whatsapp_connection_id', '')::uuid;
  v_media_url := p_payload ->> 'media_url';
  v_media_type := p_payload ->> 'media_type';
  v_scheduled_at := NULLIF(p_payload ->> 'scheduled_at', '')::timestamptz;
  v_schedule_timezone := COALESCE(NULLIF(p_payload ->> 'schedule_timezone', ''), 'America/Sao_Paulo');
  v_window_start := NULLIF(p_payload ->> 'send_window_start', '')::time;
  v_window_end := NULLIF(p_payload ->> 'send_window_end', '')::time;
  v_business_hours_only := COALESCE((p_payload ->> 'business_hours_only')::boolean, false);
  v_respect_suppression := COALESCE((p_payload ->> 'respect_suppression')::boolean, true);
  v_confirm_consent := COALESCE((p_payload ->> 'confirm_consent')::boolean, false);
  v_draft_step := COALESCE(NULLIF(p_payload ->> 'draft_step', '')::integer, 1);
  v_owner := NULLIF(p_payload ->> 'owner', '')::uuid;
  v_template_version_id := NULLIF(p_payload ->> 'template_version_id', '')::uuid;
  v_requested_status := NULLIF(p_payload ->> 'status', '');

  -- X057b: segment_ids (array JSON de uuids, na ORDEM de envio) no payload.
  -- Chave ausente ou JSON null = compatibilidade com o segment_id unico.
  IF p_payload ? 'segment_ids' THEN
    IF jsonb_typeof(p_payload -> 'segment_ids') = 'null' THEN
      NULL;
    ELSIF jsonb_typeof(p_payload -> 'segment_ids') <> 'array' THEN
      RAISE EXCEPTION 'invalid_talkx_campaign_draft' USING ERRCODE = '22023';
    ELSE
      BEGIN
        SELECT array_agg(item.value::uuid ORDER BY item.ord)
          INTO v_segment_ids
          FROM jsonb_array_elements_text(p_payload -> 'segment_ids')
               WITH ORDINALITY AS item(value, ord);
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'invalid_talkx_campaign_draft' USING ERRCODE = '22023';
      END;
    END IF;
  END IF;

  -- X057b: a lista efetiva e segment_ids quando presente; senao o segment_id
  -- legado (1 item, caminho antigo). O primeiro da lista e o segment_id
  -- gravado na campanha — nunca divergem.
  v_segment_list := COALESCE(v_segment_ids, ARRAY[]::uuid[]);
  IF v_audience_source = 'segment' THEN
    IF v_segment_ids IS NULL AND v_segment_id IS NOT NULL THEN
      v_segment_list := ARRAY[v_segment_id];
    END IF;
    v_segment_id := v_segment_list[1];
    IF cardinality(v_segment_list) < 1
       OR cardinality(v_segment_list) > 10
       OR (SELECT count(*) <> count(DISTINCT t.seg)
             FROM unnest(v_segment_list) AS t(seg)) THEN
      RAISE EXCEPTION 'invalid_talkx_campaign_draft' USING ERRCODE = '22023';
    END IF;
  ELSIF cardinality(v_segment_list) > 0 THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_draft' USING ERRCODE = '22023';
  END IF;

  -- X032: base legal e carimbo do operador que confirmou. A confirmacao so e gravada
  -- quando o operador marca o checkbox (confirm_consent); desmarcar limpa o carimbo.
  -- O carimbo original e preservado mais abaixo (update), quando ja existia.
  v_legal_basis := NULLIF(btrim(COALESCE(p_payload ->> 'legal_basis', '')), '');
  IF v_confirm_consent THEN
    v_consent_by := v_actor_profile_id;
    v_consent_at := v_now;
  ELSE
    v_consent_by := NULL;
    v_consent_at := NULL;
  END IF;

  -- X018: ritmo derivado do perfil (clamp na faixa) em vez dos valores crus.
  SELECT * INTO v_pace FROM public.talkx_resolve_speed_pace(
    NULLIF(p_payload ->> 'speed_profile', ''),
    NULLIF(p_payload ->> 'send_interval_min', '')::integer,
    NULLIF(p_payload ->> 'send_interval_max', '')::integer,
    NULLIF(p_payload ->> 'typing_delay_min', '')::integer,
    NULLIF(p_payload ->> 'typing_delay_max', '')::integer
  );
  v_speed_profile := v_pace.speed_profile;
  v_send_interval_min := v_pace.send_interval_min;
  v_send_interval_max := v_pace.send_interval_max;
  v_typing_delay_min := v_pace.typing_delay_min;
  v_typing_delay_max := v_pace.typing_delay_max;

  -- X018: max_per_minute (nulo = usa o padrão do setting; acima do teto -> 22023).
  v_max_per_minute := NULLIF(p_payload ->> 'max_per_minute', '')::smallint;

  -- Unificação owner × responsible_id: owner é o ÚNICO responsável.
  IF v_owner IS NULL THEN
    v_owner := v_actor_profile_id;
  END IF;

  -- X017: recusa desmarcar a supressão.
  IF v_respect_suppression IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_respect_suppression_false_nao_liberado' USING ERRCODE = '22023';
  END IF;

  IF v_name IS NULL OR length(v_name) > 200
     OR v_objective IS NULL OR v_audience_source IS NULL
     OR length(v_message_template) > 4096
     OR (v_description IS NOT NULL AND length(v_description) > 4000)
     OR v_objective NOT IN ('vendas', 'engajamento', 'reativacao', 'relacionamento', 'pesquisa', 'institucional')
     OR v_audience_source NOT IN ('contacts', 'segment', 'crm360')
     OR jsonb_typeof(v_audience_filters) <> 'object'
     OR (v_audience_source = 'segment' AND v_segment_id IS NULL)
     OR (v_audience_source <> 'segment' AND v_segment_id IS NOT NULL)
     OR v_send_interval_min > v_send_interval_max
     OR v_typing_delay_min > v_typing_delay_max
     OR v_speed_profile NOT IN ('slow', 'moderate', 'fast')
     OR (v_media_url IS NOT NULL AND (length(v_media_url) > 8192 OR v_media_url !~ '^https://'))
     OR (v_media_type IS NOT NULL AND v_media_type NOT IN ('image', 'video', 'document', 'audio'))
     OR ((v_media_url IS NULL) <> (v_media_type IS NULL))
     OR public.is_valid_talkx_schedule_timezone(v_schedule_timezone) IS NOT TRUE
     OR ((v_window_start IS NULL) <> (v_window_end IS NULL))
     OR (v_window_start IS NOT NULL AND v_window_start >= v_window_end)
     OR (v_legal_basis IS NOT NULL AND v_legal_basis NOT IN ('consent', 'legitimate_interest', 'contract'))
     OR (v_draft_step < 1 OR v_draft_step > 4)
     OR (v_requested_status IS NOT NULL AND v_requested_status <> 'draft')
     OR (v_max_per_minute IS NOT NULL AND v_max_per_minute < 1) THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_draft' USING ERRCODE = '22023';
  END IF;

  -- X018: max_per_minute acima do teto por minuto da conexão -> 22023.
  IF v_max_per_minute IS NOT NULL
     AND v_max_per_minute > COALESCE((SELECT (settings.value)::text::integer
                                        FROM public.talkx_settings settings
                                       WHERE settings.key = 'max_per_minute_per_connection'), 6) THEN
    RAISE EXCEPTION 'talkx_max_per_minute_acima_do_teto' USING ERRCODE = '22023';
  END IF;

  IF v_connection_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.whatsapp_connections connection
        WHERE connection.id = v_connection_id
          AND connection.status = 'connected'
          AND NULLIF(btrim(connection.instance_id), '') IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'selected_whatsapp_connection_unavailable' USING ERRCODE = '22023';
  END IF;

  IF p_campaign_id IS NULL THEN
    IF p_creation_key IS NULL THEN
      RAISE EXCEPTION 'talkx_draft_creation_key_required' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.talkx_campaigns (
      name, message_template, description, objective, audience_source,
      audience_filters, segment_id, template_id, whatsapp_connection_id,
      media_url, media_type, scheduled_at, schedule_timezone,
      send_window_start, send_window_end, business_hours_only, speed_profile,
      typing_delay_min, typing_delay_max, send_interval_min, send_interval_max,
      max_per_minute,
      respect_suppression, confirm_consent, legal_basis, consent_confirmed_by, consent_confirmed_at,
      draft_step, owner, template_version_id,
      status, created_by, draft_creation_key, revision, created_at, updated_at
    ) VALUES (
      v_name, v_message_template, v_description, v_objective, v_audience_source,
      v_audience_filters, v_segment_id, v_template_id, v_connection_id,
      v_media_url, v_media_type, v_scheduled_at, v_schedule_timezone,
      v_window_start, v_window_end, v_business_hours_only, v_speed_profile,
      v_typing_delay_min, v_typing_delay_max, v_send_interval_min, v_send_interval_max,
      v_max_per_minute,
      v_respect_suppression, v_confirm_consent, v_legal_basis, v_consent_by, v_consent_at,
      v_draft_step, v_owner, v_template_version_id,
      'draft', v_actor_profile_id, p_creation_key, 1, v_now, v_now
    )
    ON CONFLICT (created_by, draft_creation_key) WHERE draft_creation_key IS NOT NULL DO NOTHING
    RETURNING * INTO v_campaign;

    IF FOUND THEN
      -- X057b: a lista ordenada acompanha o rascunho na mesma transacao; o
      -- status espelha a campanha, como no backfill da X057a.
      DELETE FROM public.talkx_campaign_segments AS tcs
       WHERE tcs.campaign_id = v_campaign.id;
      INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position, status)
      SELECT v_campaign.id, seg.segment_id, seg.ord::smallint,
             CASE v_campaign.status
               WHEN 'sending' THEN 'sending'
               WHEN 'paused'  THEN 'paused'
               WHEN 'done'    THEN 'done'
               ELSE 'pending'
             END
        FROM unnest(v_segment_list) WITH ORDINALITY AS seg(segment_id, ord);
      RETURN QUERY SELECT v_campaign.id, v_campaign.revision, false;
      RETURN;
    END IF;

    SELECT * INTO v_campaign
      FROM public.talkx_campaigns campaign
     WHERE campaign.created_by = v_actor_profile_id
       AND campaign.draft_creation_key = p_creation_key
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'talkx_draft_creation_recovery_failed' USING ERRCODE = '40001';
    END IF;

    -- X057b: a lista ordenada tambem entra no contrato de replay. Campanha
    -- criada antes da X057b nao tem linhas — a lista efetiva dela e o
    -- segment_id legado.
    SELECT COALESCE(array_agg(cs.segment_id ORDER BY cs.position), ARRAY[]::uuid[])
      INTO v_stored_segment_ids
      FROM public.talkx_campaign_segments AS cs
     WHERE cs.campaign_id = v_campaign.id;
    IF v_stored_segment_ids = ARRAY[]::uuid[] AND v_campaign.segment_id IS NOT NULL THEN
      v_stored_segment_ids := ARRAY[v_campaign.segment_id];
    END IF;

    IF v_campaign.name IS DISTINCT FROM v_name
       OR v_campaign.message_template IS DISTINCT FROM v_message_template
       OR v_campaign.description IS DISTINCT FROM v_description
       OR v_campaign.objective IS DISTINCT FROM v_objective
       OR v_campaign.audience_source IS DISTINCT FROM v_audience_source
       OR v_campaign.audience_filters IS DISTINCT FROM v_audience_filters
       OR v_campaign.segment_id IS DISTINCT FROM v_segment_id
       OR v_campaign.template_id IS DISTINCT FROM v_template_id
       OR v_campaign.whatsapp_connection_id IS DISTINCT FROM v_connection_id
       OR v_campaign.media_url IS DISTINCT FROM v_media_url
       OR v_campaign.media_type IS DISTINCT FROM v_media_type
       OR v_campaign.scheduled_at IS DISTINCT FROM v_scheduled_at
       OR v_campaign.schedule_timezone IS DISTINCT FROM v_schedule_timezone
       OR v_campaign.send_window_start IS DISTINCT FROM v_window_start
       OR v_campaign.send_window_end IS DISTINCT FROM v_window_end
       OR v_campaign.business_hours_only IS DISTINCT FROM v_business_hours_only
       OR v_campaign.respect_suppression IS DISTINCT FROM v_respect_suppression
       OR v_campaign.confirm_consent IS DISTINCT FROM v_confirm_consent
       OR v_campaign.legal_basis IS DISTINCT FROM v_legal_basis
       OR (v_campaign.consent_confirmed_at IS NOT NULL) IS DISTINCT FROM v_confirm_consent
       OR v_campaign.draft_step IS DISTINCT FROM v_draft_step
       OR v_campaign.owner IS DISTINCT FROM v_owner
       OR v_campaign.template_version_id IS DISTINCT FROM v_template_version_id
       OR v_campaign.speed_profile IS DISTINCT FROM v_speed_profile
       OR v_campaign.typing_delay_min IS DISTINCT FROM v_typing_delay_min
       OR v_campaign.typing_delay_max IS DISTINCT FROM v_typing_delay_max
       OR v_campaign.send_interval_min IS DISTINCT FROM v_send_interval_min
       OR v_campaign.send_interval_max IS DISTINCT FROM v_send_interval_max
       OR v_campaign.max_per_minute IS DISTINCT FROM v_max_per_minute
       OR v_stored_segment_ids IS DISTINCT FROM v_segment_list THEN
      RAISE EXCEPTION 'talkx_draft_creation_key_payload_conflict' USING ERRCODE = '40001';
    END IF;

    RETURN QUERY SELECT v_campaign.id, v_campaign.revision, true;
    RETURN;
  END IF;

  IF p_expected_revision IS NULL OR p_expected_revision < 1 THEN
    RAISE EXCEPTION 'talkx_draft_expected_revision_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_campaign
    FROM public.talkx_campaigns campaign
   WHERE campaign.id = p_campaign_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_campaign.created_by IS DISTINCT FROM v_actor_profile_id
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
  END IF;
  IF v_campaign.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_campaign_not_editable' USING ERRCODE = '55000';
  END IF;
  IF v_campaign.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
  END IF;

  -- X032: nao "piscar" o carimbo — se ja havia confirmacao, mantem o autor/instante originais.
  IF v_confirm_consent AND v_campaign.consent_confirmed_at IS NOT NULL THEN
    v_consent_by := v_campaign.consent_confirmed_by;
    v_consent_at := v_campaign.consent_confirmed_at;
  END IF;

  UPDATE public.talkx_campaigns campaign
     SET name = v_name,
         message_template = v_message_template,
         description = v_description,
         objective = v_objective,
         audience_source = v_audience_source,
         audience_filters = v_audience_filters,
         segment_id = v_segment_id,
         template_id = v_template_id,
         whatsapp_connection_id = v_connection_id,
         media_url = v_media_url,
         media_type = v_media_type,
         scheduled_at = v_scheduled_at,
         schedule_timezone = v_schedule_timezone,
         send_window_start = v_window_start,
         send_window_end = v_window_end,
         business_hours_only = v_business_hours_only,
         respect_suppression = v_respect_suppression,
         confirm_consent = v_confirm_consent,
         legal_basis = v_legal_basis,
         consent_confirmed_by = v_consent_by,
         consent_confirmed_at = v_consent_at,
         draft_step = v_draft_step,
         owner = v_owner,
         template_version_id = v_template_version_id,
         speed_profile = v_speed_profile,
         typing_delay_min = v_typing_delay_min,
         typing_delay_max = v_typing_delay_max,
         send_interval_min = v_send_interval_min,
         send_interval_max = v_send_interval_max,
         max_per_minute = v_max_per_minute,
         status = COALESCE(v_requested_status, campaign.status),
         revision = campaign.revision + 1,
         updated_at = v_now
   WHERE campaign.id = v_campaign.id
   RETURNING * INTO v_campaign;

  -- X057b: a lista ordenada acompanha o rascunho na mesma transacao; o
  -- status espelha a campanha, como no backfill da X057a.
  DELETE FROM public.talkx_campaign_segments AS tcs
   WHERE tcs.campaign_id = v_campaign.id;
  INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position, status)
  SELECT v_campaign.id, seg.segment_id, seg.ord::smallint,
         CASE v_campaign.status
           WHEN 'sending' THEN 'sending'
           WHEN 'paused'  THEN 'paused'
           WHEN 'done'    THEN 'done'
           ELSE 'pending'
         END
    FROM unnest(v_segment_list) WITH ORDINALITY AS seg(segment_id, ord);
  RETURN QUERY SELECT v_campaign.id, v_campaign.revision, false;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb) IS
  'Talk X (X018 + X032 + X057b): grava rascunho com ritmo derivado do perfil, carimbo de consentimento e, quando confirm_consent=true, legal_basis. Aceita segment_ids (1..10 uuids na ordem de envio) no payload: valida a lista (22023), regrava talkx_campaign_segments na mesma transacao e mantem segment_id = primeiro da lista (compatibilidade com segmento unico).';

-- 2) snapshot_talkx_campaign_audience — corpo vivo 20261002421230 + ordem ----
CREATE OR REPLACE FUNCTION public.snapshot_talkx_campaign_audience(
  p_campaign_id uuid,
  p_expected_revision bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_rules jsonb := '{"groups":[]}'::jsonb;
  v_contact_ids uuid[] := NULL;
  v_segment_ids uuid[] := ARRAY[]::uuid[];
  v_respect boolean;
  v_eligible bigint := 0;
  v_suppressed bigint := 0;
  v_skipped_invalid bigint := 0;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_id_segments uuid[] := NULL;
  v_count integer := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor_profile_id
    FROM public.profiles AS profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1
   FOR SHARE;
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;

  -- X014: gerar destinatarios e ato de admin/supervisor.
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_audience_snapshot' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_campaign
    FROM public.talkx_campaigns AS campaign
   WHERE campaign.id = p_campaign_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_campaign.created_by IS DISTINCT FROM v_actor_profile_id
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
  END IF;
  IF v_campaign.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_recipients_locked' USING ERRCODE = '55000';
  END IF;
  -- Revisao otimista: o snapshot so vale para a revisao que acabou de ser salva.
  IF p_expected_revision IS NULL OR v_campaign.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
  END IF;

  -- Origem lida do PROPRIO rascunho.
  IF v_campaign.audience_source = 'segment' THEN
    -- X057b: a lista ordenada de segmentos da campanha. Campanha antiga sem
    -- linhas na tabela cai no segment_id legado (compatibilidade com a X057a).
    SELECT COALESCE(array_agg(cs.segment_id ORDER BY cs.position), ARRAY[]::uuid[])
      INTO v_segment_ids
      FROM public.talkx_campaign_segments AS cs
     WHERE cs.campaign_id = p_campaign_id;
    IF cardinality(v_segment_ids) = 0 AND v_campaign.segment_id IS NOT NULL THEN
      v_segment_ids := ARRAY[v_campaign.segment_id];
    END IF;
  ELSE
    v_rules := COALESCE(v_campaign.audience_filters, '{}'::jsonb);
    IF jsonb_typeof(v_rules) <> 'object' THEN
      v_rules := '{}'::jsonb;
    END IF;
    -- Selecao manual do passo 1 (X017): ids escolhidos a mao no navegador.
    IF jsonb_typeof(v_campaign.audience_filters -> 'contact_ids') = 'array' THEN
      BEGIN
        SELECT COALESCE(array_agg(requested.value::uuid), ARRAY[]::uuid[])
          INTO v_contact_ids
          FROM jsonb_array_elements_text(v_campaign.audience_filters -> 'contact_ids') AS requested(value);
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'invalid_talkx_audience_snapshot' USING ERRCODE = '22023';
      END;
    END IF;
  END IF;

  v_respect := COALESCE(v_campaign.respect_suppression, true);

  IF v_campaign.audience_source = 'segment' THEN
    -- X057b: uma avaliacao do motor (X016) por segmento, na ordem de position.
    -- Cada contato entra UMA vez, com o segment_id do PRIMEIRO segmento que o
    -- contem; total_recipients conta os contatos unicos.
    WITH seg_list AS (
      SELECT ord_seg.segment_id, ord_seg.ord AS position,
             COALESCE(segment.rules, '{"groups":[]}'::jsonb) AS rules
        FROM unnest(v_segment_ids) WITH ORDINALITY AS ord_seg(segment_id, ord)
        JOIN public.talkx_segments AS segment ON segment.id = ord_seg.segment_id
    ),
    hits AS (
      SELECT q.id, q.legacy_or_deleted, q.invalid_phone, q.is_suppressed,
             seg_list.segment_id, seg_list.position
        FROM seg_list
        CROSS JOIN LATERAL public.talkx_audience_query(seg_list.rules, NULL, v_respect) AS q
    ),
    first_hit AS MATERIALIZED (
      SELECT DISTINCT ON (hits.id) hits.id, hits.legacy_or_deleted, hits.invalid_phone,
             hits.is_suppressed, hits.segment_id
        FROM hits
       ORDER BY hits.id, hits.position
    )
    SELECT count(*) FILTER (WHERE NOT f.legacy_or_deleted AND NOT f.invalid_phone AND NOT f.is_suppressed),
           count(*) FILTER (WHERE NOT f.legacy_or_deleted AND NOT f.invalid_phone AND f.is_suppressed),
           count(*) FILTER (WHERE f.legacy_or_deleted OR f.invalid_phone),
           COALESCE(array_agg(f.id ORDER BY f.id) FILTER (WHERE NOT f.legacy_or_deleted AND NOT f.invalid_phone AND NOT f.is_suppressed), ARRAY[]::uuid[]),
           COALESCE(array_agg(f.segment_id ORDER BY f.id) FILTER (WHERE NOT f.legacy_or_deleted AND NOT f.invalid_phone AND NOT f.is_suppressed), ARRAY[]::uuid[])
      INTO v_eligible, v_suppressed, v_skipped_invalid, v_ids, v_id_segments
      FROM first_hit AS f;
  ELSE
    -- Uma unica avaliacao do motor (X016): classifica e coleta os elegiveis.
    WITH classified AS (
      SELECT q.id,
             (NOT q.legacy_or_deleted AND NOT q.invalid_phone AND NOT q.is_suppressed) AS eligible,
             (NOT q.legacy_or_deleted AND NOT q.invalid_phone AND q.is_suppressed) AS suppressed,
             (q.legacy_or_deleted OR q.invalid_phone) AS skipped_invalid
        FROM public.talkx_audience_query(v_rules, v_contact_ids, v_respect) AS q
    )
    SELECT count(*) FILTER (WHERE classified.eligible),
           count(*) FILTER (WHERE classified.suppressed),
           count(*) FILTER (WHERE classified.skipped_invalid),
           COALESCE(array_agg(classified.id ORDER BY classified.id) FILTER (WHERE classified.eligible), ARRAY[]::uuid[])
      INTO v_eligible, v_suppressed, v_skipped_invalid, v_ids
      FROM classified;
  END IF;

  -- Mesma GUC transacional do replace_talkx_draft_recipients: e o que autoriza os
  -- gatilhos de talkx_recipients/talkx_campaigns nesta transacao.
  PERFORM set_config('app.talkx_recipient_snapshot_write', 'on', true);

  DELETE FROM public.talkx_recipients
   WHERE campaign_id = p_campaign_id;

  INSERT INTO public.talkx_recipients (campaign_id, contact_id, segment_id)
  SELECT p_campaign_id, recipient.contact_id, v_id_segments[recipient.ord]
    FROM unnest(v_ids) WITH ORDINALITY AS recipient(contact_id, ord);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.talkx_campaigns
     SET total_recipients = v_count,
         audience_snapshot_at = statement_timestamp(),
         updated_at = statement_timestamp()
   WHERE id = p_campaign_id;

  RETURN jsonb_build_object(
    'eligible', v_eligible,
    'suppressed', v_suppressed,
    'skipped_invalid', v_skipped_invalid
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.snapshot_talkx_campaign_audience(uuid, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.snapshot_talkx_campaign_audience(uuid, bigint)
  TO authenticated;

COMMENT ON FUNCTION public.snapshot_talkx_campaign_audience(uuid, bigint) IS
  'Talk X (X017 + X057b): gera talkx_recipients/total_recipients/audience_snapshot_at a partir do proprio rascunho (origem, segmento, audience_filters e selecao manual), chamando talkx_audience_query (X016). Em audience_source=segment resolve os segmentos de talkx_campaign_segments em ordem de position — cada contato entra uma vez, com o segment_id do primeiro segmento que o contem (campanha antiga sem linhas cai no segment_id legado). Devolve {eligible, suppressed, skipped_invalid}. Exige admin/supervisor (42501) e a revisao atual (40001).';
