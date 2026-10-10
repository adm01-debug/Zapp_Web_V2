-- Rollback (SQL executável, na ordem):
--   drop function if exists public.talkx_segment_health(jsonb, uuid);
--
-- N-116 / X102 (Fase 9 · Tela 03/02 · banco). Saude do segmento: risco de entrega,
-- sinais e composicao, so com agregados (nunca nome/telefone).
--
-- HOJE: o risco e decidido no front so pelo tamanho do publico (TalkXSegments.tsx:238) e a
-- tela nao enxerga a supressao (talkx_blacklist so e legivel por admin/supervisor).
--
-- FAZER: RPC `talkx_segment_health(p_rules jsonb, p_segment_id uuid)`. Usa o conjunto de
-- `talkx_audience_query` (nao resolve regras por conta propria). Exige admin/supervisor
-- (42501). Sem regras e sem segmento -> 22023; segmento inexistente -> P0002.
-- Com os dois, `p_rules` vence (previa de edicao) e o segmento ainda precisa existir.
--
-- REGRA DO RISCO (limiares nas constantes do topo da funcao):
--   sinal 1 "base qualificada":  warm/eligible >= 70%
--   sinal 2 "baixo bloqueio":    (failed+optout)/sent < 2%         (so com sent >= 100)
--   sinal 3 "engajamento":       replied/delivered >= media do modulo (so com sent >= 100)
--   nivel: sem eligible -> NULL; Alto se warm/eligible < 40% ou bloqueio >= 5%;
--          Baixo so com os tres sinais existentes e verdadeiros; senao Moderado
--          (sem historico de envio o maximo e Moderado, nota 'sem_historico_de_envio').
--   warm = contato com ao menos uma mensagem recebida (messages.sender = 'contact').
--   janela de envio = 90 dias; inativo = sem mensagem recebida ha 180 dias.
--   sent = recipients do conjunto casado (inclusive suprimidos, que sao quem descadastrou)
--   com sent_at ou status 'failed'; optout = contatos do conjunto com
--   bloqueio ativo reason_code 'opt_out' criado na janela.
--
-- NAO FEITO neste cartao: composicao por genero (contacts nao tem coluna de genero),
-- sugestao por `dados:status_cliente` (campo inexistente) e a reescrita de
-- talkx_segment_tags para ler o publico.
--
-- Classe: ADITIVA (funcao nova; nada existente e alterado).

CREATE OR REPLACE FUNCTION public.talkx_segment_health(
  p_rules jsonb DEFAULT NULL,
  p_segment_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  c_window_days constant integer := 90;
  c_inactive_days constant integer := 180;
  c_min_sent constant integer := 100;
  c_warm_ok constant numeric := 0.70;
  c_warm_high constant numeric := 0.40;
  c_block_ok constant numeric := 0.02;
  c_block_high constant numeric := 0.05;
  c_sug_inactive constant numeric := 0.25;
  c_sug_suppressed constant numeric := 0.05;
  c_sug_consent constant numeric := 0.50;
  v_uid uuid := auth.uid();
  v_rules jsonb;
  v_since timestamptz := statement_timestamp() - make_interval(days => c_window_days);
  v_matched bigint := 0;
  v_eligible bigint := 0;
  v_suppressed bigint := 0;
  v_base_total bigint := 0;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_hist_ids uuid[] := ARRAY[]::uuid[];
  v_warm bigint := 0;
  v_inactive bigint := 0;
  v_no_consent bigint := 0;
  v_pessoas bigint := 0;
  v_empresas bigint := 0;
  v_nao_inf bigint := 0;
  v_sent bigint := 0;
  v_delivered bigint := 0;
  v_replied bigint := 0;
  v_failed bigint := 0;
  v_optout bigint := 0;
  v_mod_delivered bigint := 0;
  v_mod_replied bigint := 0;
  v_warm_ratio numeric;
  v_block_ratio numeric;
  v_reply_ratio numeric;
  v_mod_ratio numeric;
  v_sig1 boolean;
  v_sig2 boolean;
  v_sig3 boolean;
  v_level text;
  v_note text;
  v_score integer;
  v_top_tags jsonb := '[]'::jsonb;
  v_sugs jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR COALESCE(public.is_admin_or_supervisor(v_uid), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_segment_health_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_rules IS NULL AND p_segment_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_segment_health_input' USING ERRCODE = '22023';
  END IF;

  IF p_segment_id IS NOT NULL THEN
    SELECT s.rules INTO v_rules FROM public.talkx_segments s WHERE s.id = p_segment_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'talkx_segment_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  v_rules := COALESCE(p_rules, v_rules);

  SELECT count(*),
         count(*) FILTER (WHERE NOT q.legacy_or_deleted AND NOT q.invalid_phone AND NOT q.is_suppressed),
         count(*) FILTER (WHERE NOT q.legacy_or_deleted AND NOT q.invalid_phone AND q.is_suppressed),
         COALESCE(array_agg(q.id) FILTER (WHERE NOT q.legacy_or_deleted AND NOT q.invalid_phone AND NOT q.is_suppressed),
                  ARRAY[]::uuid[]),
         COALESCE(array_agg(q.id) FILTER (WHERE NOT q.legacy_or_deleted AND NOT q.invalid_phone),
                  ARRAY[]::uuid[])
    INTO v_matched, v_eligible, v_suppressed, v_ids, v_hist_ids
    FROM public.talkx_audience_query(v_rules, NULL, true) AS q;

  SELECT count(*) INTO v_base_total
    FROM public.talkx_audience_query('{"groups":[]}'::jsonb, NULL, true) AS b
   WHERE NOT b.legacy_or_deleted AND NOT b.invalid_phone AND NOT b.is_suppressed;

  IF v_eligible > 0 THEN
    SELECT count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM public.messages m WHERE m.contact_id = c.id AND m.sender = 'contact')),
           count(*) FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM public.messages m
              WHERE m.contact_id = c.id AND m.sender = 'contact'
                AND m.created_at >= statement_timestamp() - make_interval(days => c_inactive_days))),
           count(*) FILTER (WHERE c.consent_status IS DISTINCT FROM 'granted'),
           count(*) FILTER (WHERE c.contact_type IN ('pessoa', 'cliente', 'prospect')),
           count(*) FILTER (WHERE c.contact_type IN ('empresa', 'company')),
           count(*) FILTER (WHERE c.contact_type IS NULL
                              OR c.contact_type NOT IN ('pessoa', 'cliente', 'prospect', 'empresa', 'company'))
      INTO v_warm, v_inactive, v_no_consent, v_pessoas, v_empresas, v_nao_inf
      FROM public.contacts c
     WHERE c.id = ANY(v_ids);

    SELECT count(*) FILTER (WHERE r.sent_at IS NOT NULL OR r.status = 'failed'),
           count(*) FILTER (WHERE r.delivered_at IS NOT NULL),
           count(*) FILTER (WHERE r.replied_at IS NOT NULL),
           count(*) FILTER (WHERE r.status = 'failed')
      INTO v_sent, v_delivered, v_replied, v_failed
      FROM public.talkx_recipients r
     WHERE r.contact_id = ANY(v_hist_ids)
       AND COALESCE(r.sent_at, r.created_at) >= v_since;

    SELECT count(DISTINCT b.contact_id) INTO v_optout
      FROM public.talkx_blacklist b
     WHERE b.contact_id = ANY(v_hist_ids)
       AND b.reason_code = 'opt_out'
       AND b.removed_at IS NULL
       AND b.created_at >= v_since;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('tag', t.tag, 'count', t.cnt) ORDER BY t.cnt DESC, t.tag), '[]'::jsonb)
      INTO v_top_tags
      FROM (
        SELECT tag, count(*) AS cnt
          FROM public.contacts c
         CROSS JOIN LATERAL unnest(c.tags) AS tag
         WHERE c.id = ANY(v_ids)
         GROUP BY tag
         ORDER BY cnt DESC, tag
         LIMIT 10
      ) t;
  END IF;

  SELECT count(*) FILTER (WHERE r.delivered_at IS NOT NULL),
         count(*) FILTER (WHERE r.replied_at IS NOT NULL)
    INTO v_mod_delivered, v_mod_replied
    FROM public.talkx_recipients r
   WHERE COALESCE(r.sent_at, r.created_at) >= v_since;

  IF v_eligible > 0 THEN
    v_warm_ratio := v_warm::numeric / v_eligible;
    v_sig1 := v_warm_ratio >= c_warm_ok;

    IF v_sent >= c_min_sent THEN
      v_block_ratio := (v_failed + v_optout)::numeric / v_sent;
      v_sig2 := v_block_ratio < c_block_ok;
      IF v_delivered > 0 AND v_mod_delivered > 0 THEN
        v_reply_ratio := v_replied::numeric / v_delivered;
        v_mod_ratio := v_mod_replied::numeric / v_mod_delivered;
        v_sig3 := v_reply_ratio >= v_mod_ratio;
      END IF;
    END IF;

    IF v_warm_ratio < c_warm_high OR COALESCE(v_block_ratio, 0) >= c_block_high THEN
      v_level := 'alto';
    ELSIF v_sig1 AND v_sig2 IS TRUE AND v_sig3 IS TRUE THEN
      v_level := 'baixo';
    ELSE
      v_level := 'moderado';
    END IF;
    IF v_sent < c_min_sent THEN
      v_note := 'sem_historico_de_envio';
    END IF;

    v_score := round(100 * v_warm_ratio * (1 - least(COALESCE(v_block_ratio, 0), 1)))::integer;

    IF v_inactive::numeric / v_eligible >= c_sug_inactive THEN
      v_sugs := v_sugs || jsonb_build_object('code', 'split_active_inactive', 'count', v_inactive, 'of', v_eligible,
        'action', 'Dividir em ativos e inativos');
    END IF;
    IF v_no_consent::numeric / v_eligible >= c_sug_consent
       AND position('consent_status' IN v_rules::text) = 0 THEN
      v_sugs := v_sugs || jsonb_build_object('code', 'add_consent_filter', 'count', v_no_consent, 'of', v_eligible,
        'action', 'Adicionar filtro de consentimento');
    END IF;
  END IF;

  IF v_matched > 0 AND v_suppressed::numeric / v_matched >= c_sug_suppressed THEN
    v_sugs := v_sugs || jsonb_build_object('code', 'review_suppressed_origin', 'count', v_suppressed, 'of', v_matched,
      'action', 'Revisar a origem dos contatos bloqueados');
  END IF;

  RETURN jsonb_build_object(
    'matched', v_matched,
    'eligible', v_eligible,
    'base_total', v_base_total,
    'suppressed', v_suppressed,
    'warm', v_warm,
    'inactive_180d', v_inactive,
    'no_consent', v_no_consent,
    'last_90d', jsonb_build_object('sent', v_sent, 'delivered', v_delivered, 'replied', v_replied,
                                   'failed', v_failed, 'optout', v_optout),
    'composition', jsonb_build_object('pessoas', v_pessoas, 'empresas', v_empresas, 'nao_informado', v_nao_inf),
    'top_tags', v_top_tags,
    'signals', jsonb_build_object('qualified_base', to_jsonb(v_sig1), 'low_block', to_jsonb(v_sig2),
                                  'engagement', to_jsonb(v_sig3)),
    'level', to_jsonb(v_level),
    'note', to_jsonb(v_note),
    'score', to_jsonb(v_score),
    'suggestions', v_sugs
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_segment_health(jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_segment_health(jsonb, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.talkx_segment_health(jsonb, uuid) IS
  'Talk X (X102/N-116): saude do segmento (risco de entrega, sinais, composicao, sugestoes) so com agregados. Usa talkx_audience_query. Exige admin/supervisor (42501); segmento inexistente P0002; sem regras e sem segmento 22023.';
