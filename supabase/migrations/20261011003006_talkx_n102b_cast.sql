-- talkx_n102b_cast
-- Rollback: recria as duas RPCs com os corpos ANTERIORES (abaixo) — CREATE OR REPLACE de funcao, sem DDL de schema nem GRANT a desfazer.
-- Rollback (SQL executável, na ordem):
--   CREATE OR REPLACE FUNCTION public.save_talkx_campaign_draft( p_campaign_id uuid, p_expected_revision bigint, p_creation_key uuid, p_payload jsonb ) RETURNS TABLE(campaign_id uuid, revision bigint, creation_replayed boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$ DECLARE v_actor_profile_id uuid; v_campaign public.talkx_campaigns%ROWTYPE; v_now timestamptz := statement_timestamp(); v_name text; v_message_template text; v_description text; v_objective text; v_audience_source text; v_audience_filters jsonb; v_segment_id uuid; v_template_id uuid; v_connection_id uuid; v_media_url text; v_media_type text; v_scheduled_at timestamptz; v_schedule_timezone text; v_window_start time; v_window_end time; v_speed_profile text; v_typing_delay_min integer; v_typing_delay_max integer; v_send_interval_min integer; v_send_interval_max integer; v_business_hours_only boolean; v_respect_suppression boolean; v_confirm_consent boolean; v_legal_basis text; v_consent_by uuid; v_consent_at timestamptz; v_draft_step integer; v_owner uuid; v_template_version_id uuid; v_requested_status text; v_max_per_minute smallint; v_pace record; BEGIN IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501'; END IF; SELECT profile.id INTO v_actor_profile_id FROM public.profiles profile WHERE profile.user_id = auth.uid() AND profile.is_active = true LIMIT 1 FOR SHARE; IF v_actor_profile_id IS NULL THEN RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501'; END IF; -- X014: criar/editar rascunho é ato de admin/supervisor. IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501'; END IF; IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR pg_column_size(p_payload) > 65536 THEN RAISE EXCEPTION 'invalid_talkx_campaign_payload' USING ERRCODE = '22023'; END IF; v_name := NULLIF(btrim(p_payload ->> 'name'), ''); v_message_template := COALESCE(p_payload ->> 'message_template', ''); v_description := p_payload ->> 'description'; v_objective := p_payload ->> 'objective'; v_audience_source := p_payload ->> 'audience_source'; v_audience_filters := COALESCE(p_payload -> 'audience_filters', '{}'::jsonb); v_segment_id := NULLIF(p_payload ->> 'segment_id', '')::uuid; v_template_id := NULLIF(p_payload ->> 'template_id', '')::uuid; v_connection_id := NULLIF(p_payload ->> 'whatsapp_connection_id', '')::uuid; v_media_url := p_payload ->> 'media_url'; v_media_type := p_payload ->> 'media_type'; v_scheduled_at := NULLIF(p_payload ->> 'scheduled_at', '')::timestamptz; v_schedule_timezone := COALESCE(NULLIF(p_payload ->> 'schedule_timezone', ''), 'America/Sao_Paulo'); v_window_start := NULLIF(p_payload ->> 'send_window_start', '')::time; v_window_end := NULLIF(p_payload ->> 'send_window_end', '')::time; v_business_hours_only := COALESCE((p_payload ->> 'business_hours_only')::boolean, false); v_respect_suppression := COALESCE((p_payload ->> 'respect_suppression')::boolean, true); v_confirm_consent := COALESCE((p_payload ->> 'confirm_consent')::boolean, false); v_draft_step := COALESCE(NULLIF(p_payload ->> 'draft_step', '')::integer, 1); v_owner := NULLIF(p_payload ->> 'owner', '')::uuid; v_template_version_id := NULLIF(p_payload ->> 'template_version_id', '')::uuid; v_requested_status := NULLIF(p_payload ->> 'status', ''); -- X032: base legal e carimbo do operador que confirmou. A confirmacao so e gravada -- quando o operador marca o checkbox (confirm_consent); desmarcar limpa o carimbo. -- O carimbo original e preservado mais abaixo (update), quando ja existia. v_legal_basis := NULLIF(btrim(COALESCE(p_payload ->> 'legal_basis', '')), ''); IF v_confirm_consent THEN v_consent_by := v_actor_profile_id; v_consent_at := v_now; ELSE v_consent_by := NULL; v_consent_at := NULL; END IF; -- X018: ritmo derivado do perfil (clamp na faixa) em vez dos valores crus. SELECT * INTO v_pace FROM public.talkx_resolve_speed_pace( NULLIF(p_payload ->> 'speed_profile', ''), NULLIF(p_payload ->> 'send_interval_min', '')::integer, NULLIF(p_payload ->> 'send_interval_max', '')::integer, NULLIF(p_payload ->> 'typing_delay_min', '')::integer, NULLIF(p_payload ->> 'typing_delay_max', '')::integer ); v_speed_profile := v_pace.speed_profile; v_send_interval_min := v_pace.send_interval_min; v_send_interval_max := v_pace.send_interval_max; v_typing_delay_min := v_pace.typing_delay_min; v_typing_delay_max := v_pace.typing_delay_max; -- X018: max_per_minute (nulo = usa o padrão do setting; acima do teto -> 22023). v_max_per_minute := NULLIF(p_payload ->> 'max_per_minute', '')::smallint; -- Unificação owner × responsible_id: owner é o ÚNICO responsável. IF v_owner IS NULL THEN v_owner := v_actor_profile_id; END IF; -- X017: recusa desmarcar a supressão. IF v_respect_suppression IS NOT TRUE THEN RAISE EXCEPTION 'talkx_respect_suppression_false_nao_liberado' USING ERRCODE = '22023'; END IF; IF v_name IS NULL OR length(v_name) > 200 OR v_objective IS NULL OR v_audience_source IS NULL OR length(v_message_template) > 4096 OR (v_description IS NOT NULL AND length(v_description) > 4000) OR v_objective NOT IN ('vendas', 'engajamento', 'reativacao', 'relacionamento', 'pesquisa', 'institucional') OR v_audience_source NOT IN ('contacts', 'segment', 'crm360') OR jsonb_typeof(v_audience_filters) <> 'object' OR (v_audience_source = 'segment' AND v_segment_id IS NULL) OR (v_audience_source <> 'segment' AND v_segment_id IS NOT NULL) OR v_send_interval_min > v_send_interval_max OR v_typing_delay_min > v_typing_delay_max OR v_speed_profile NOT IN ('slow', 'moderate', 'fast') OR (v_media_url IS NOT NULL AND (length(v_media_url) > 8192 OR v_media_url !~ '^https://')) OR (v_media_type IS NOT NULL AND v_media_type NOT IN ('image', 'video', 'document', 'audio')) OR ((v_media_url IS NULL) <> (v_media_type IS NULL)) OR public.is_valid_talkx_schedule_timezone(v_schedule_timezone) IS NOT TRUE OR ((v_window_start IS NULL) <> (v_window_end IS NULL)) OR (v_window_start IS NOT NULL AND v_window_start >= v_window_end) OR (v_legal_basis IS NOT NULL AND v_legal_basis NOT IN ('consent', 'legitimate_interest', 'contract')) OR (v_draft_step < 1 OR v_draft_step > 4) OR (v_requested_status IS NOT NULL AND v_requested_status <> 'draft') OR (v_max_per_minute IS NOT NULL AND v_max_per_minute < 1) THEN RAISE EXCEPTION 'invalid_talkx_campaign_draft' USING ERRCODE = '22023'; END IF; -- X018: max_per_minute acima do teto por minuto da conexão -> 22023. IF v_max_per_minute IS NOT NULL AND v_max_per_minute > COALESCE((SELECT (settings.value)::text::integer FROM public.talkx_settings settings WHERE settings.key = 'max_per_minute_per_connection'), 6) THEN RAISE EXCEPTION 'talkx_max_per_minute_acima_do_teto' USING ERRCODE = '22023'; END IF; IF v_connection_id IS NOT NULL AND NOT EXISTS ( SELECT 1 FROM public.whatsapp_connections connection WHERE connection.id = v_connection_id AND connection.status = 'connected' AND NULLIF(btrim(connection.instance_id), '') IS NOT NULL ) THEN RAISE EXCEPTION 'selected_whatsapp_connection_unavailable' USING ERRCODE = '22023'; END IF; IF p_campaign_id IS NULL THEN IF p_creation_key IS NULL THEN RAISE EXCEPTION 'talkx_draft_creation_key_required' USING ERRCODE = '22023'; END IF; INSERT INTO public.talkx_campaigns ( name, message_template, description, objective, audience_source, audience_filters, segment_id, template_id, whatsapp_connection_id, media_url, media_type, scheduled_at, schedule_timezone, send_window_start, send_window_end, business_hours_only, speed_profile, typing_delay_min, typing_delay_max, send_interval_min, send_interval_max, max_per_minute, respect_suppression, confirm_consent, legal_basis, consent_confirmed_by, consent_confirmed_at, draft_step, owner, template_version_id, status, created_by, draft_creation_key, revision, created_at, updated_at ) VALUES ( v_name, v_message_template, v_description, v_objective, v_audience_source, v_audience_filters, v_segment_id, v_template_id, v_connection_id, v_media_url, v_media_type, v_scheduled_at, v_schedule_timezone, v_window_start, v_window_end, v_business_hours_only, v_speed_profile, v_typing_delay_min, v_typing_delay_max, v_send_interval_min, v_send_interval_max, v_max_per_minute, v_respect_suppression, v_confirm_consent, v_legal_basis, v_consent_by, v_consent_at, v_draft_step, v_owner, v_template_version_id, 'draft', v_actor_profile_id, p_creation_key, 1, v_now, v_now ) ON CONFLICT (created_by, draft_creation_key) WHERE draft_creation_key IS NOT NULL DO NOTHING RETURNING * INTO v_campaign; IF FOUND THEN RETURN QUERY SELECT v_campaign.id, v_campaign.revision, false; RETURN; END IF; SELECT * INTO v_campaign FROM public.talkx_campaigns campaign WHERE campaign.created_by = v_actor_profile_id AND campaign.draft_creation_key = p_creation_key FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'talkx_draft_creation_recovery_failed' USING ERRCODE = '40001'; END IF; IF v_campaign.name IS DISTINCT FROM v_name OR v_campaign.message_template IS DISTINCT FROM v_message_template OR v_campaign.description IS DISTINCT FROM v_description OR v_campaign.objective IS DISTINCT FROM v_objective OR v_campaign.audience_source IS DISTINCT FROM v_audience_source OR v_campaign.audience_filters IS DISTINCT FROM v_audience_filters OR v_campaign.segment_id IS DISTINCT FROM v_segment_id OR v_campaign.template_id IS DISTINCT FROM v_template_id OR v_campaign.whatsapp_connection_id IS DISTINCT FROM v_connection_id OR v_campaign.media_url IS DISTINCT FROM v_media_url OR v_campaign.media_type IS DISTINCT FROM v_media_type OR v_campaign.scheduled_at IS DISTINCT FROM v_scheduled_at OR v_campaign.schedule_timezone IS DISTINCT FROM v_schedule_timezone OR v_campaign.send_window_start IS DISTINCT FROM v_window_start OR v_campaign.send_window_end IS DISTINCT FROM v_window_end OR v_campaign.business_hours_only IS DISTINCT FROM v_business_hours_only OR v_campaign.respect_suppression IS DISTINCT FROM v_respect_suppression OR v_campaign.confirm_consent IS DISTINCT FROM v_confirm_consent OR v_campaign.legal_basis IS DISTINCT FROM v_legal_basis OR (v_campaign.consent_confirmed_at IS NOT NULL) IS DISTINCT FROM v_confirm_consent OR v_campaign.draft_step IS DISTINCT FROM v_draft_step OR v_campaign.owner IS DISTINCT FROM v_owner OR v_campaign.template_version_id IS DISTINCT FROM v_template_version_id OR v_campaign.speed_profile IS DISTINCT FROM v_speed_profile OR v_campaign.typing_delay_min IS DISTINCT FROM v_typing_delay_min OR v_campaign.typing_delay_max IS DISTINCT FROM v_typing_delay_max OR v_campaign.send_interval_min IS DISTINCT FROM v_send_interval_min OR v_campaign.send_interval_max IS DISTINCT FROM v_send_interval_max OR v_campaign.max_per_minute IS DISTINCT FROM v_max_per_minute THEN RAISE EXCEPTION 'talkx_draft_creation_key_payload_conflict' USING ERRCODE = '40001'; END IF; RETURN QUERY SELECT v_campaign.id, v_campaign.revision, true; RETURN; END IF; IF p_expected_revision IS NULL OR p_expected_revision < 1 THEN RAISE EXCEPTION 'talkx_draft_expected_revision_required' USING ERRCODE = '22023'; END IF; SELECT * INTO v_campaign FROM public.talkx_campaigns campaign WHERE campaign.id = p_campaign_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002'; END IF; IF v_campaign.created_by IS DISTINCT FROM v_actor_profile_id AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501'; END IF; IF v_campaign.status NOT IN ('draft', 'scheduled') THEN RAISE EXCEPTION 'talkx_campaign_not_editable' USING ERRCODE = '55000'; END IF; IF v_campaign.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001'; END IF; -- X032: nao "piscar" o carimbo — se ja havia confirmacao, mantem o autor/instante originais. IF v_confirm_consent AND v_campaign.consent_confirmed_at IS NOT NULL THEN v_consent_by := v_campaign.consent_confirmed_by; v_consent_at := v_campaign.consent_confirmed_at; END IF; UPDATE public.talkx_campaigns campaign SET name = v_name, message_template = v_message_template, description = v_description, objective = v_objective, audience_source = v_audience_source, audience_filters = v_audience_filters, segment_id = v_segment_id, template_id = v_template_id, whatsapp_connection_id = v_connection_id, media_url = v_media_url, media_type = v_media_type, scheduled_at = v_scheduled_at, schedule_timezone = v_schedule_timezone, send_window_start = v_window_start, send_window_end = v_window_end, business_hours_only = v_business_hours_only, respect_suppression = v_respect_suppression, confirm_consent = v_confirm_consent, legal_basis = v_legal_basis, consent_confirmed_by = v_consent_by, consent_confirmed_at = v_consent_at, draft_step = v_draft_step, owner = v_owner, template_version_id = v_template_version_id, speed_profile = v_speed_profile, typing_delay_min = v_typing_delay_min, typing_delay_max = v_typing_delay_max, send_interval_min = v_send_interval_min, send_interval_max = v_send_interval_max, max_per_minute = v_max_per_minute, status = COALESCE(v_requested_status, campaign.status), revision = campaign.revision + 1, updated_at = v_now WHERE campaign.id = v_campaign.id RETURNING * INTO v_campaign; RETURN QUERY SELECT v_campaign.id, v_campaign.revision, false; END; $function$;
--   CREATE OR REPLACE FUNCTION public.update_talkx_campaign_limits( p_campaign_id uuid, p_expected_revision bigint, p_limits jsonb ) RETURNS TABLE(campaign_id uuid, revision bigint) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$ DECLARE v_actor_profile_id uuid; v_campaign public.talkx_campaigns%ROWTYPE; v_now timestamptz := statement_timestamp(); v_speed_profile text; v_send_interval_min integer; v_send_interval_max integer; v_typing_delay_min integer; v_typing_delay_max integer; v_max_per_minute smallint; v_send_window_start time; v_send_window_end time; v_eff_start time; v_eff_end time; v_business_hours_only boolean; v_before jsonb; v_after jsonb; v_pace record; BEGIN IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501'; END IF; SELECT profile.id INTO v_actor_profile_id FROM public.profiles profile WHERE profile.user_id = auth.uid() AND profile.is_active = true LIMIT 1 FOR SHARE; IF v_actor_profile_id IS NULL THEN RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501'; END IF; -- X014: editar limites de campanha é ato de admin/supervisor. IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501'; END IF; IF p_limits IS NULL OR jsonb_typeof(p_limits) <> 'object' OR pg_column_size(p_limits) > 8192 THEN RAISE EXCEPTION 'invalid_talkx_limits_payload' USING ERRCODE = '22023'; END IF; IF EXISTS ( SELECT 1 FROM jsonb_object_keys(p_limits) AS k WHERE k NOT IN ('speed_profile','send_interval_min','send_interval_max', 'typing_delay_min','typing_delay_max','max_per_minute', 'send_window_start','send_window_end','business_hours_only') ) THEN RAISE EXCEPTION 'invalid_talkx_limits_field' USING ERRCODE = '22023'; END IF; -- Conversões de tipo: erro de conversão vira contrato 22023. BEGIN v_max_per_minute := NULLIF(p_limits ->> 'max_per_minute', '')::smallint; v_send_window_start := NULLIF(p_limits ->> 'send_window_start', '')::time; v_send_window_end := NULLIF(p_limits ->> 'send_window_end', '')::time; v_business_hours_only := NULLIF(p_limits ->> 'business_hours_only', '')::boolean; EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range OR SQLSTATE '22009' THEN RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023'; END; SELECT * INTO v_campaign FROM public.talkx_campaigns campaign WHERE campaign.id = p_campaign_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002'; END IF; IF v_campaign.created_by IS DISTINCT FROM v_actor_profile_id AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501'; END IF; IF p_expected_revision IS NULL OR v_campaign.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001'; END IF; -- X018: deriva o ritmo do perfil, clampa valores fora da faixa. Perfil ausente -- no payload mantém o atual da campanha; intervalos ausentes derivam do perfil. v_pace := NULL; SELECT * INTO v_pace FROM public.talkx_resolve_speed_pace( CASE WHEN p_limits ? 'speed_profile' THEN NULLIF(p_limits ->> 'speed_profile', '') ELSE v_campaign.speed_profile END, NULLIF(p_limits ->> 'send_interval_min', '')::integer, NULLIF(p_limits ->> 'send_interval_max', '')::integer, NULLIF(p_limits ->> 'typing_delay_min', '')::integer, NULLIF(p_limits ->> 'typing_delay_max', '')::integer ); v_speed_profile := v_pace.speed_profile; v_send_interval_min := v_pace.send_interval_min; v_send_interval_max := v_pace.send_interval_max; v_typing_delay_min := v_pace.typing_delay_min; v_typing_delay_max := v_pace.typing_delay_max; IF v_send_interval_min > v_send_interval_max OR v_typing_delay_min > v_typing_delay_max THEN RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023'; END IF; -- X018: max_per_minute acima do teto por minuto da conexão -> 22023. IF v_max_per_minute IS NOT NULL AND v_max_per_minute > COALESCE((SELECT (settings.value)::text::integer FROM public.talkx_settings settings WHERE settings.key = 'max_per_minute_per_connection'), 6) THEN RAISE EXCEPTION 'talkx_max_per_minute_acima_do_teto' USING ERRCODE = '22023'; END IF; -- Janela de envio EFETIVA (mesma lógica da V09b). v_eff_start := CASE WHEN p_limits ? 'send_window_start' THEN v_send_window_start ELSE v_campaign.send_window_start END; v_eff_end := CASE WHEN p_limits ? 'send_window_end' THEN v_send_window_end ELSE v_campaign.send_window_end END; IF NOT ( (v_eff_start IS NULL AND v_eff_end IS NULL) OR (v_eff_start IS NOT NULL AND v_eff_end IS NOT NULL AND v_eff_start < v_eff_end) ) THEN RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023'; END IF; v_before := jsonb_build_object( 'speed_profile', v_campaign.speed_profile, 'send_interval_min', v_campaign.send_interval_min, 'send_interval_max', v_campaign.send_interval_max, 'typing_delay_min', v_campaign.typing_delay_min, 'typing_delay_max', v_campaign.typing_delay_max, 'max_per_minute', v_campaign.max_per_minute, 'send_window_start', v_campaign.send_window_start, 'send_window_end', v_campaign.send_window_end, 'business_hours_only', v_campaign.business_hours_only ); PERFORM set_config('app.talkx_limits_write', 'on', true); UPDATE public.talkx_campaigns campaign SET speed_profile = v_speed_profile, send_interval_min = v_send_interval_min, send_interval_max = v_send_interval_max, typing_delay_min = v_typing_delay_min, typing_delay_max = v_typing_delay_max, max_per_minute = COALESCE(v_max_per_minute, campaign.max_per_minute), send_window_start = CASE WHEN p_limits ? 'send_window_start' THEN v_send_window_start ELSE campaign.send_window_start END, send_window_end = CASE WHEN p_limits ? 'send_window_end' THEN v_send_window_end ELSE campaign.send_window_end END, business_hours_only = COALESCE(v_business_hours_only, campaign.business_hours_only), revision = campaign.revision + 1, updated_at = v_now WHERE campaign.id = p_campaign_id AND campaign.revision = p_expected_revision RETURNING * INTO v_campaign; IF NOT FOUND THEN RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001'; END IF; PERFORM set_config('app.talkx_limits_write', '', true); v_after := jsonb_build_object( 'speed_profile', v_campaign.speed_profile, 'send_interval_min', v_campaign.send_interval_min, 'send_interval_max', v_campaign.send_interval_max, 'typing_delay_min', v_campaign.typing_delay_min, 'typing_delay_max', v_campaign.typing_delay_max, 'max_per_minute', v_campaign.max_per_minute, 'send_window_start', v_campaign.send_window_start, 'send_window_end', v_campaign.send_window_end, 'business_hours_only', v_campaign.business_hours_only ); INSERT INTO public.talkx_campaign_events (campaign_id, event_type, actor_id, message) VALUES (p_campaign_id, 'limits_updated', v_actor_profile_id, jsonb_build_object('before', v_before, 'after', v_after)::text); RETURN QUERY SELECT p_campaign_id, v_campaign.revision; END; $function$;
--
-- N-102b (fatia de cast): corrige a conversao de send_weekdays nas RPCs
-- save_talkx_campaign_draft e update_talkx_campaign_limits. No PostgreSQL NAO existe
-- cast jsonb -> smallint[]: o cast direto (jsonb -> 'send_weekdays')::smallint[]
-- estoura 42846 (cannot cast type jsonb to smallint[]) em QUALQUER valor, inclusive
-- um array valido. Agora a conversao e validada elemento a elemento (jsonb_typeof='array',
-- item 'number' e sem '.eE') e feita por TEXTO (::text::smallint), recusando entrada
-- invalida com SQLSTATE 22023. Corpos copiados de 20261010124150_talkx_n102_window_fixes.sql
-- (commit 2c186a480), SOMENTE as 2 RPCs. Sem ALTER/ADD/DROP, sem GRANT/REVOKE/policy e
-- sem tocar window_open/fuso/dnd_hours (fatias a e c).

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
  v_requested_status text;
  v_send_weekdays smallint[];
  v_respect_dnd boolean;
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

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR pg_column_size(p_payload) > 65536 THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_payload' USING ERRCODE = '22023';
  END IF;

  v_name := NULLIF(btrim(p_payload ->> 'name'), '');
  v_message_template := p_payload ->> 'message_template';
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
  v_requested_status := NULLIF(p_payload ->> 'status', '');
  IF (p_payload -> 'send_weekdays') IS NOT NULL AND jsonb_typeof((p_payload -> 'send_weekdays')) <> 'null' THEN
    IF jsonb_typeof((p_payload -> 'send_weekdays')) <> 'array' THEN
      RAISE EXCEPTION 'invalid_talkx_campaign_draft' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM jsonb_array_elements((p_payload -> 'send_weekdays')) AS item
       WHERE jsonb_typeof(item) <> 'number'
          OR (item)::text ~ '[.eE]'
    ) THEN
      RAISE EXCEPTION 'invalid_talkx_campaign_draft' USING ERRCODE = '22023';
    END IF;
    v_send_weekdays := ARRAY(
      SELECT element.value::text::smallint
        FROM jsonb_array_elements((p_payload -> 'send_weekdays')) WITH ORDINALITY AS element(value, ord)
       ORDER BY element.ord
    );
  ELSE
    v_send_weekdays := NULL;
  END IF;
  v_respect_dnd := COALESCE((p_payload ->> 'respect_dnd')::boolean, true);

  IF v_name IS NULL OR length(v_name) > 200
     OR v_message_template IS NULL OR length(btrim(v_message_template)) = 0 OR length(v_message_template) > 65536
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
     OR (v_requested_status IS NOT NULL AND v_requested_status <> 'draft')
     OR (v_send_weekdays IS NOT NULL AND (
       SELECT bool_or(n < 0 OR n > 6) FROM unnest(v_send_weekdays) AS n
     )) THEN
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
      send_weekdays, respect_dnd,
      status, created_by, draft_creation_key, revision, created_at, updated_at
    ) VALUES (
      v_name, v_message_template, v_description, v_objective, v_audience_source,
      v_audience_filters, v_segment_id, v_template_id, v_connection_id,
      v_media_url, v_media_type, v_scheduled_at, v_schedule_timezone,
      v_window_start, v_window_end, v_business_hours_only, v_speed_profile,
      v_typing_delay_min, v_typing_delay_max, v_send_interval_min, v_send_interval_max,
      v_send_weekdays, v_respect_dnd,
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
       OR v_campaign.speed_profile IS DISTINCT FROM v_speed_profile
       OR v_campaign.typing_delay_min IS DISTINCT FROM v_typing_delay_min
       OR v_campaign.typing_delay_max IS DISTINCT FROM v_typing_delay_max
       OR v_campaign.send_interval_min IS DISTINCT FROM v_send_interval_min
       OR v_campaign.send_interval_max IS DISTINCT FROM v_send_interval_max
       OR v_campaign.send_weekdays IS DISTINCT FROM v_send_weekdays
       OR v_campaign.respect_dnd IS DISTINCT FROM v_respect_dnd THEN
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
         speed_profile = v_speed_profile,
         typing_delay_min = v_typing_delay_min,
         typing_delay_max = v_typing_delay_max,
         send_interval_min = v_send_interval_min,
         send_interval_max = v_send_interval_max,
         send_weekdays = v_send_weekdays,
         respect_dnd = v_respect_dnd,
         revision = campaign.revision + 1,
         updated_at = v_now
   WHERE campaign.id = p_campaign_id
     AND campaign.revision = p_expected_revision
   RETURNING * INTO v_campaign;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
  END IF;

  RETURN QUERY SELECT p_campaign_id, v_campaign.revision, false;
END;
$function$;


CREATE OR REPLACE FUNCTION public.update_talkx_campaign_limits(
  p_campaign_id uuid,
  p_expected_revision bigint,
  p_limits jsonb
)
RETURNS TABLE(campaign_id uuid, revision bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_now timestamptz := statement_timestamp();
  v_speed_profile text;
  v_send_interval_min integer;
  v_send_interval_max integer;
  v_typing_delay_min integer;
  v_typing_delay_max integer;
  v_send_window_start time;
  v_send_window_end time;
  v_business_hours_only boolean;
  v_send_weekdays smallint[];
  v_respect_dnd boolean;
  v_eff_start time;
  v_eff_end time;
  v_before jsonb;
  v_after jsonb;
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

  IF p_limits IS NULL OR jsonb_typeof(p_limits) <> 'object' OR pg_column_size(p_limits) > 8192 THEN
    RAISE EXCEPTION 'invalid_talkx_limits_payload' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_limits) AS k
     WHERE k NOT IN ('speed_profile','send_interval_min','send_interval_max',
                     'typing_delay_min','typing_delay_max','send_window_start',
                     'send_window_end','business_hours_only','send_weekdays','respect_dnd')
  ) THEN
    RAISE EXCEPTION 'invalid_talkx_limits_field' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_speed_profile := NULLIF(p_limits ->> 'speed_profile', '');
    v_send_interval_min := NULLIF(p_limits ->> 'send_interval_min', '')::integer;
    v_send_interval_max := NULLIF(p_limits ->> 'send_interval_max', '')::integer;
    v_typing_delay_min := NULLIF(p_limits ->> 'typing_delay_min', '')::integer;
    v_typing_delay_max := NULLIF(p_limits ->> 'typing_delay_max', '')::integer;
    v_send_window_start := NULLIF(p_limits ->> 'send_window_start', '')::time;
    v_send_window_end := NULLIF(p_limits ->> 'send_window_end', '')::time;
    v_business_hours_only := NULLIF(p_limits ->> 'business_hours_only', '')::boolean;
    IF (p_limits -> 'send_weekdays') IS NOT NULL AND jsonb_typeof((p_limits -> 'send_weekdays')) <> 'null' THEN
      IF jsonb_typeof((p_limits -> 'send_weekdays')) <> 'array' THEN
        RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023';
      END IF;
      IF EXISTS (
        SELECT 1
          FROM jsonb_array_elements((p_limits -> 'send_weekdays')) AS item
         WHERE jsonb_typeof(item) <> 'number'
            OR (item)::text ~ '[.eE]'
      ) THEN
        RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023';
      END IF;
      v_send_weekdays := ARRAY(
        SELECT element.value::text::smallint
          FROM jsonb_array_elements((p_limits -> 'send_weekdays')) WITH ORDINALITY AS element(value, ord)
         ORDER BY element.ord
      );
    ELSE
      v_send_weekdays := NULL;
    END IF;
    v_respect_dnd := COALESCE((p_limits ->> 'respect_dnd')::boolean, true);
  EXCEPTION
    WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023';
  END;

  IF (v_speed_profile IS NOT NULL AND v_speed_profile NOT IN ('slow','moderate','fast'))
     OR (v_send_interval_min IS NOT NULL AND v_send_interval_min < 1)
     OR (v_send_interval_max IS NOT NULL AND v_send_interval_max < 1)
     OR (v_send_interval_min IS NOT NULL AND v_send_interval_max IS NOT NULL
         AND v_send_interval_min > v_send_interval_max)
     OR (v_typing_delay_min IS NOT NULL AND v_typing_delay_min < 0)
     OR (v_typing_delay_max IS NOT NULL AND v_typing_delay_max < 0)
     OR (v_typing_delay_min IS NOT NULL AND v_typing_delay_max IS NOT NULL
         AND v_typing_delay_min > v_typing_delay_max) THEN
    RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023';
  END IF;

  IF (v_send_weekdays IS NOT NULL AND (
    SELECT bool_or(n < 0 OR n > 6) FROM unnest(v_send_weekdays) AS n
  )) THEN
    RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023';
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
  IF p_expected_revision IS NULL OR v_campaign.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
  END IF;

  v_eff_start := CASE WHEN p_limits ? 'send_window_start' THEN v_send_window_start ELSE v_campaign.send_window_start END;
  v_eff_end   := CASE WHEN p_limits ? 'send_window_end'   THEN v_send_window_end   ELSE v_campaign.send_window_end END;
  IF NOT (
    (v_eff_start IS NULL AND v_eff_end IS NULL)
    OR (v_eff_start IS NOT NULL AND v_eff_end IS NOT NULL AND v_eff_start < v_eff_end)
  ) THEN
    RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023';
  END IF;

  v_before := jsonb_build_object(
    'speed_profile', v_campaign.speed_profile,
    'send_interval_min', v_campaign.send_interval_min,
    'send_interval_max', v_campaign.send_interval_max,
    'typing_delay_min', v_campaign.typing_delay_min,
    'typing_delay_max', v_campaign.typing_delay_max,
    'send_window_start', v_campaign.send_window_start,
    'send_window_end', v_campaign.send_window_end,
    'business_hours_only', v_campaign.business_hours_only,
    'send_weekdays', v_campaign.send_weekdays,
    'respect_dnd', v_campaign.respect_dnd
  );

  PERFORM set_config('app.talkx_limits_write', 'on', true);

  UPDATE public.talkx_campaigns campaign
     SET speed_profile = COALESCE(v_speed_profile, campaign.speed_profile),
         send_interval_min = COALESCE(v_send_interval_min, campaign.send_interval_min),
         send_interval_max = COALESCE(v_send_interval_max, campaign.send_interval_max),
         typing_delay_min = COALESCE(v_typing_delay_min, campaign.typing_delay_min),
         typing_delay_max = COALESCE(v_typing_delay_max, campaign.typing_delay_max),
         send_window_start = CASE WHEN p_limits ? 'send_window_start' THEN v_send_window_start ELSE campaign.send_window_start END,
         send_window_end = CASE WHEN p_limits ? 'send_window_end' THEN v_send_window_end ELSE campaign.send_window_end END,
         business_hours_only = COALESCE(v_business_hours_only, campaign.business_hours_only),
         send_weekdays = CASE WHEN p_limits ? 'send_weekdays' THEN v_send_weekdays ELSE campaign.send_weekdays END,
         respect_dnd = CASE WHEN p_limits ? 'respect_dnd' THEN v_respect_dnd ELSE campaign.respect_dnd END,
         revision = campaign.revision + 1,
         updated_at = v_now
   WHERE campaign.id = p_campaign_id
     AND campaign.revision = p_expected_revision
   RETURNING * INTO v_campaign;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
  END IF;

  PERFORM set_config('app.talkx_limits_write', '', true);

  v_after := jsonb_build_object(
    'speed_profile', v_campaign.speed_profile,
    'send_interval_min', v_campaign.send_interval_min,
    'send_interval_max', v_campaign.send_interval_max,
    'typing_delay_min', v_campaign.typing_delay_min,
    'typing_delay_max', v_campaign.typing_delay_max,
    'send_window_start', v_campaign.send_window_start,
    'send_window_end', v_campaign.send_window_end,
    'business_hours_only', v_campaign.business_hours_only,
    'send_weekdays', v_campaign.send_weekdays,
    'respect_dnd', v_campaign.respect_dnd
  );

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, actor_id, message)
  VALUES (p_campaign_id, 'limits_updated', v_actor_profile_id,
          jsonb_build_object('before', v_before, 'after', v_after)::text);

  RETURN QUERY SELECT p_campaign_id, v_campaign.revision;
END;
$function$;
