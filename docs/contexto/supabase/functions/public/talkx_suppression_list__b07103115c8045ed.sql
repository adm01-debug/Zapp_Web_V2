CREATE OR REPLACE FUNCTION public.talkx_suppression_list(p_busca text DEFAULT NULL::text, p_origens text[] DEFAULT NULL::text[], p_motivos text[] DEFAULT NULL::text[], p_campanha uuid DEFAULT NULL::uuid, p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date, p_status text DEFAULT NULL::text, p_ordenacao text DEFAULT 'data'::text, p_direcao text DEFAULT 'desc'::text, p_limite integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_busca   text;
  v_limite  integer;
  v_offset  integer;
  v_ordem   text;
  v_direcao text;
  v_status  text;
  v_total   integer := 0;
  v_rows    jsonb := '[]'::jsonb;
  v_rec     record;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(public.is_admin_or_supervisor(v_uid), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_suppression_read_role_required' USING ERRCODE = '42501';
  END IF;

  v_limite := COALESCE(p_limite, 25);
  IF v_limite < 1 OR v_limite > 200 THEN
    RAISE EXCEPTION 'invalid_talkx_suppression_limit' USING ERRCODE = '22023';
  END IF;

  v_offset := COALESCE(p_offset, 0);
  IF v_offset < 0 THEN
    RAISE EXCEPTION 'invalid_talkx_suppression_offset' USING ERRCODE = '22023';
  END IF;

  v_direcao := lower(COALESCE(NULLIF(btrim(p_direcao), ''), 'desc'));
  IF v_direcao NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'invalid_talkx_suppression_direction' USING ERRCODE = '22023';
  END IF;

  v_ordem := lower(COALESCE(NULLIF(btrim(p_ordenacao), ''), 'data'));
  IF v_ordem NOT IN ('contato', 'origem', 'motivo', 'data', 'status') THEN
    RAISE EXCEPTION 'invalid_talkx_suppression_sort' USING ERRCODE = '22023';
  END IF;

  v_status := lower(COALESCE(NULLIF(btrim(p_status), ''), 'suprimido'));
  IF v_status NOT IN ('suprimido', 'expirado', 'removido', 'todos') THEN
    RAISE EXCEPTION 'invalid_talkx_suppression_status' USING ERRCODE = '22023';
  END IF;

  v_busca := NULLIF(btrim(COALESCE(p_busca, '')), '');

  FOR v_rec IN
    WITH filtrado AS (
      SELECT b.id,
             b.contact_id,
             b.phone,
             b.origin,
             b.reason,
             b.reason_code::text AS reason_code,
             b.campaign_id,
             b.created_at,
             b.expires_at,
             b.removed_at,
             c.name AS contact_name,
             c.email AS contact_email,
             c.avatar_url AS contact_avatar,
             COALESCE(c.phone, b.phone) AS telefone,
             tc.name AS campaign_name,
             CASE b.reason_code
               WHEN 'opt_out' THEN 'Opt-out solicitado'
               WHEN 'invalid_number' THEN 'Número inválido'
               WHEN 'manual' THEN 'Bloqueio manual'
               WHEN 'lgpd' THEN 'LGPD'
               WHEN 'no_commercial_permission' THEN 'Sem permissão comercial'
               WHEN 'bounce' THEN 'Mensagem devolvida'
               ELSE 'Não informado'
             END AS reason_label,
             CASE b.reason_code
               WHEN 'opt_out' THEN 'destructive'
               WHEN 'invalid_number' THEN 'warning'
               WHEN 'manual' THEN 'info'
               WHEN 'lgpd' THEN 'primary'
               WHEN 'no_commercial_permission' THEN 'muted'
               WHEN 'bounce' THEN 'warning'
               ELSE 'muted'
             END AS reason_tone,
             CASE WHEN b.removed_at IS NOT NULL THEN 'removido'
                  WHEN b.expires_at IS NOT NULL AND b.expires_at <= statement_timestamp() THEN 'expirado'
                  ELSE 'suprimido'
             END AS row_status
        FROM public.talkx_blacklist b
        LEFT JOIN public.contacts c ON c.id = b.contact_id
        LEFT JOIN public.talkx_campaigns tc ON tc.id = b.campaign_id
       WHERE (p_origens IS NULL OR b.origin = ANY (p_origens))
         AND (p_motivos IS NULL OR b.reason_code::text = ANY (p_motivos))
         AND (p_campanha IS NULL OR b.campaign_id = p_campanha)
         AND (p_de IS NULL OR b.created_at >= p_de::timestamp with time zone)
         AND (p_ate IS NULL OR b.created_at < (p_ate + 1)::timestamp with time zone)
         AND (
           v_busca IS NULL
           OR c.name ILIKE '%' || replace(replace(replace(v_busca, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\'
           OR c.email ILIKE '%' || replace(replace(replace(v_busca, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\'
           OR (NULLIF(regexp_replace(v_busca, '\D', '', 'g'), '') IS NOT NULL
               AND regexp_replace(COALESCE(c.phone, b.phone), '\D', '', 'g')
                   LIKE '%' || regexp_replace(v_busca, '\D', '', 'g') || '%')
         )
    ),
    base AS (
      SELECT * FROM filtrado f WHERE (v_status = 'todos' OR f.row_status = v_status)
    )
    SELECT b.*, count(*) OVER () AS total_count
      FROM base b
     ORDER BY
       CASE WHEN v_ordem <> 'data' AND v_direcao = 'asc' THEN
         CASE v_ordem
           WHEN 'contato' THEN lower(b.contact_name)
           WHEN 'origem'  THEN lower(b.origin)
           WHEN 'motivo'  THEN lower(b.reason_label)
           WHEN 'status'  THEN b.row_status
           ELSE NULL
         END
       END ASC NULLS LAST,
       CASE WHEN v_ordem <> 'data' AND v_direcao = 'desc' THEN
         CASE v_ordem
           WHEN 'contato' THEN lower(b.contact_name)
           WHEN 'origem'  THEN lower(b.origin)
           WHEN 'motivo'  THEN lower(b.reason_label)
           WHEN 'status'  THEN b.row_status
           ELSE NULL
         END
       END DESC NULLS LAST,
       CASE WHEN v_ordem = 'data' AND v_direcao = 'asc' THEN b.created_at END ASC NULLS LAST,
       CASE WHEN v_ordem = 'data' AND v_direcao = 'desc' THEN b.created_at END DESC NULLS LAST,
       b.id DESC
     LIMIT v_limite OFFSET v_offset
  LOOP
    v_total := v_rec.total_count;
    v_rows := v_rows || jsonb_build_object(
      'id',             v_rec.id,
      'contact_id',     v_rec.contact_id,
      'contact_name',   v_rec.contact_name,
      'contact_email',  v_rec.contact_email,
      'contact_avatar', v_rec.contact_avatar,
      'phone',          v_rec.telefone,
      'origin',         v_rec.origin,
      'reason_code',    v_rec.reason_code,
      'reason_label',   v_rec.reason_label,
      'reason_tone',    v_rec.reason_tone,
      'reason',         v_rec.reason,
      'campaign_id',    v_rec.campaign_id,
      'campaign_name',  v_rec.campaign_name,
      'created_at',     v_rec.created_at,
      'expires_at',     v_rec.expires_at,
      'removed_at',     v_rec.removed_at,
      'status',         v_rec.row_status
    );
  END LOOP;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$function$
