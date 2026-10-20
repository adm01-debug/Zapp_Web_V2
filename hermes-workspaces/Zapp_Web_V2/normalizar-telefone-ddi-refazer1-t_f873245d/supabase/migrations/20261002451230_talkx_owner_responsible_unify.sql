-- talkx_owner_responsible_unify
-- versão 20261002451230 reservada para hermes-owner-responsible-unify-2610020826bea4 em 2026-10-02T08:26:16-03:00 (hermes-db-migrar --nova)
--
-- rollback: 1) recriar public.save_talkx_campaign_draft com o corpo de
--   supabase/migrations/20261002431230_talkx_regressoes_fix.sql (versão que
--   ainda lê/grava responsible_id); 2) COMMENT ON COLUMN
--   public.talkx_campaigns.responsible_id IS NULL (limpa a marca de obsoleta).
--
-- Classe: contrato (CREATE OR REPLACE FUNCTION + COMMENT + REVOKE/GRANT).
-- Idempotente/replayável (CREATE OR REPLACE + COMMENT).
--
-- AUDITORIA DO JOAQUIM — owner × responsible_id (duas fontes divergentes):
--
--   O front SÓ grava `owner` (src/components/talkx/useCampaignEditor.ts:
--   `buildPayload` manda `owner`, o select "Responsável" chama `setOwner`).
--   Mesmo assim o banco tinha DUAS colunas de responsável:
--     * `owner` (V25 / 20261001271230) — perfil responsável pela campanha;
--     * `responsible_id` (X009 / 20261001281230) — coluna criada depois, com o
--       mesmo sentido, e recriada pela X014 (20261002381230) e pela X017
--       (20261002421230).
--   `save_talkx_campaign_draft` lia `responsible_id` do payload — que o front
--   NUNCA enviava — e caía no default (perfil do ator). Resultado: o responsável
--   escolhido na tela ia para `owner`, mas `responsible_id` guardava o ator.
--   Duas fontes de verdade para o mesmo campo.
--
--   DECISÃO (Joaquim, 02/10): UNIFICAR em `owner`. NÃO dropar a coluna
--   responsible_id — ela PERMANECE no banco, marcada como OBSOLETA via
--   COMMENT ON COLUMN. O código para de escrevê-la (save_talkx_campaign_draft
--   passa a gravar só `owner`).
--
--   Esta migration: (a) marca responsible_id como obsoleta (COMMENT ON COLUMN);
--   (b) recria save_talkx_campaign_draft lendo `owner` do payload
--   (vazio -> o próprio ator) e gravando SÓ `owner`. Preserva template_version_id
--   (V26), o gate respect_suppression (X017) e o portão de papel
--   is_admin_or_supervisor (X014).

-- ============================================================================
-- (a) talkx_campaigns.responsible_id — mantida, marcada como OBSOLETA
-- ============================================================================
-- Decisão 02/10: NÃO dropar a coluna. O código para de gravá-la (a função
-- recriada abaixo grava só `owner`) e ela fica documentada como obsoleta.
COMMENT ON COLUMN public.talkx_campaigns.responsible_id IS
  'obsoleta: usar owner (decisão 02/10)';

-- ============================================================================
-- (b) save_talkx_campaign_draft — recriada lendo/gravando só `owner`
-- ============================================================================
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
  v_draft_step integer;
  v_owner uuid;
  v_template_version_id uuid;
  v_requested_status text;
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

  -- X014: criar/editar rascunho é ato de admin/supervisor (o front já esconde o
  -- módulo do agente; aqui a barreira é do banco).
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR pg_column_size(p_payload) > 65536 THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_payload' USING ERRCODE = '22023';
  END IF;

  v_name := NULLIF(btrim(p_payload ->> 'name'), '');
  -- X009: mensagem ausente/vazia é aceita enquanto o rascunho está em draft.
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
  v_speed_profile := COALESCE(NULLIF(p_payload ->> 'speed_profile', ''), 'moderate');
  v_typing_delay_min := COALESCE(NULLIF(p_payload ->> 'typing_delay_min', '')::integer, 1500);
  v_typing_delay_max := COALESCE(NULLIF(p_payload ->> 'typing_delay_max', '')::integer, 4000);
  v_send_interval_min := COALESCE(NULLIF(p_payload ->> 'send_interval_min', '')::integer, 8000);
  v_send_interval_max := COALESCE(NULLIF(p_payload ->> 'send_interval_max', '')::integer, 20000);
  v_business_hours_only := COALESCE((p_payload ->> 'business_hours_only')::boolean, false);
  v_respect_suppression := COALESCE((p_payload ->> 'respect_suppression')::boolean, true);
  v_confirm_consent := COALESCE((p_payload ->> 'confirm_consent')::boolean, false);
  -- X009: passo do wizard, padrão 1 quando o payload não traz draft_step.
  v_draft_step := COALESCE(NULLIF(p_payload ->> 'draft_step', '')::integer, 1);
  v_owner := NULLIF(p_payload ->> 'owner', '')::uuid;
  v_template_version_id := NULLIF(p_payload ->> 'template_version_id', '')::uuid;
  v_requested_status := NULLIF(p_payload ->> 'status', '');

  -- Unificação owner × responsible_id: `owner` é o ÚNICO responsável. Ausente ->
  -- o próprio ator (perfil ativo, já validado acima). Antes, este papel era do
  -- `responsible_id`, que o front nunca enviava e caía no default do ator.
  IF v_owner IS NULL THEN
    v_owner := v_actor_profile_id;
  END IF;

  -- X017: ate a decisao N12 o contrato RECUSA desmarcar a supressao. A coluna
  -- existe desde a V21; o valor `false` simplesmente nao pode ser gravado ainda.
  IF v_respect_suppression IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_respect_suppression_false_nao_liberado' USING ERRCODE = '22023';
  END IF;

  -- X009: mensagem vazia permitida em draft (limite 4.096); objective/audience_source
  -- seguem obrigatórios (colunas NOT NULL no schema).
  IF v_name IS NULL OR length(v_name) > 200
     OR v_objective IS NULL OR v_audience_source IS NULL
     OR length(v_message_template) > 4096
     OR (v_description IS NOT NULL AND length(v_description) > 4000)
     OR v_objective NOT IN ('vendas', 'engajamento', 'reativacao', 'relacionamento', 'pesquisa', 'institucional')
     OR v_audience_source NOT IN ('contacts', 'segment', 'crm360')
     OR jsonb_typeof(v_audience_filters) <> 'object'
     OR (v_audience_source = 'segment' AND v_segment_id IS NULL)
     OR (v_audience_source <> 'segment' AND v_segment_id IS NOT NULL)
     OR v_typing_delay_min < 0 OR v_typing_delay_min > v_typing_delay_max OR v_typing_delay_max > 60000
     OR v_send_interval_min < 0 OR v_send_interval_min > v_send_interval_max OR v_send_interval_max > 300000
     OR v_speed_profile NOT IN ('slow', 'moderate', 'fast')
     OR (v_media_url IS NOT NULL AND (length(v_media_url) > 8192 OR v_media_url !~ '^https://'))
     OR (v_media_type IS NOT NULL AND v_media_type NOT IN ('image', 'video', 'document', 'audio'))
     OR ((v_media_url IS NULL) <> (v_media_type IS NULL))
     OR public.is_valid_talkx_schedule_timezone(v_schedule_timezone) IS NOT TRUE
     OR ((v_window_start IS NULL) <> (v_window_end IS NULL))
     OR (v_window_start IS NOT NULL AND v_window_start >= v_window_end)
     OR (v_draft_step < 1 OR v_draft_step > 4)
     OR (v_requested_status IS NOT NULL AND v_requested_status <> 'draft') THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_draft' USING ERRCODE = '22023';
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
      respect_suppression, confirm_consent, draft_step, owner, template_version_id,
      status, created_by, draft_creation_key, revision, created_at, updated_at
    ) VALUES (
      v_name, v_message_template, v_description, v_objective, v_audience_source,
      v_audience_filters, v_segment_id, v_template_id, v_connection_id,
      v_media_url, v_media_type, v_scheduled_at, v_schedule_timezone,
      v_window_start, v_window_end, v_business_hours_only, v_speed_profile,
      v_typing_delay_min, v_typing_delay_max, v_send_interval_min, v_send_interval_max,
      v_respect_suppression, v_confirm_consent, v_draft_step, v_owner, v_template_version_id,
      'draft', v_actor_profile_id, p_creation_key, 1, v_now, v_now
    )
    ON CONFLICT (created_by, draft_creation_key) WHERE draft_creation_key IS NOT NULL DO NOTHING
    RETURNING * INTO v_campaign;

    IF FOUND THEN
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
       OR v_campaign.draft_step IS DISTINCT FROM v_draft_step
       OR v_campaign.owner IS DISTINCT FROM v_owner
       OR v_campaign.template_version_id IS DISTINCT FROM v_template_version_id
       OR v_campaign.speed_profile IS DISTINCT FROM v_speed_profile
       OR v_campaign.typing_delay_min IS DISTINCT FROM v_typing_delay_min
       OR v_campaign.typing_delay_max IS DISTINCT FROM v_typing_delay_max
       OR v_campaign.send_interval_min IS DISTINCT FROM v_send_interval_min
       OR v_campaign.send_interval_max IS DISTINCT FROM v_send_interval_max THEN
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
         draft_step = v_draft_step,
         owner = v_owner,
         template_version_id = v_template_version_id,
         speed_profile = v_speed_profile,
         typing_delay_min = v_typing_delay_min,
         typing_delay_max = v_typing_delay_max,
         send_interval_min = v_send_interval_min,
         send_interval_max = v_send_interval_max,
         status = COALESCE(v_requested_status, campaign.status),
         revision = campaign.revision + 1,
         updated_at = v_now
   WHERE campaign.id = v_campaign.id
   RETURNING * INTO v_campaign;

  RETURN QUERY SELECT v_campaign.id, v_campaign.revision, false;
END;
$function$;


REVOKE ALL ON FUNCTION public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb) IS
  'Talk X (unificação owner × responsible_id): salva rascunho com revisão otimista e idempotência de criação. Lê/grava SOMENTE owner (vazio = o próprio ator). Preserva template_version_id (V26) e recusa respect_suppression=false (22023) até a decisão N12.';

COMMENT ON COLUMN public.talkx_campaigns.owner IS
  'Perfil responsável pela campanha (V25). Único responsável desde a unificação owner × responsible_id (20261002451230). Distinto de created_by, que identifica o rascunho.';
