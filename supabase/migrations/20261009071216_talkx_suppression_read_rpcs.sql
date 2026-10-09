-- talkx_suppression_read_rpcs
-- Rollback: dropa as três funções novas e o índice novo; nada mais foi criado, alterado ou apagado por esta migration.
-- Rollback (SQL executável, na ordem):
--   DROP FUNCTION IF EXISTS public.talkx_suppression_activity(integer, integer);
--   DROP FUNCTION IF EXISTS public.talkx_suppression_stats(integer);
--   DROP FUNCTION IF EXISTS public.talkx_suppression_list(text, text[], text[], uuid, date, date, text, text, text, integer, integer);
--   DROP INDEX IF EXISTS public.idx_talkx_blacklist_created_at_desc;
--
-- X176 (Fase 14 · Tela 06 · camada banco + testes · DDL: sim). Fecha T06-009, T06-011,
-- T06-014, T06-017, T06-018, T06-042, T06-062 e T06-064 (a tela fecha em X178/X179/X184).
--
-- HOJE: não existe UMA RPC de leitura da supressão (`git grep -n "\"talkx_suppression_list\"\|\"talkx_suppression_stats\"\|\"talkx_suppression_activity\"" src supabase` = 0).
-- A tela lê a tabela inteira sem `count` nem `range` e filtra em memória (SUP:53-64,83-91);
-- os totais são `length` do que veio (SUP:93-98); o hook corta em 500 (HSUP:48). Os KPIs não
-- têm período anterior nem série, e a "Atividade recente" não existe.
--
-- FAZER (esta migration): três funções SECURITY INVOKER que devolvem 42501 para quem não é
-- admin/supervisor — a barreira é EXPLÍCITA no corpo (a RLS de talkx_blacklist já é
-- admin-only, mas o erro precisa ser 42501 determinístico, igual para qualquer chamador):
--   (a) public.talkx_suppression_list(...) -> {total, rows}; pagina no servidor, busca casa
--       nome, e-mail e dígitos do telefone, e o status é DERIVADO (suprimido|expirado|removido);
--   (b) public.talkx_suppression_stats(p_days) -> valor, valor do período anterior e série de
--       8 pontos para suprimidos ativos, opt-outs, bloqueios manuais e campanhas protegidas,
--       mais o total de campanhas iniciadas e a lista de campanhas que têm supressão;
--   (c) public.talkx_suppression_activity(p_limite, p_offset) -> {total, rows} lendo os eventos
--       de entidade `suppression_*` com ator e contato.
--   Índice simples em talkx_blacklist(created_at desc), que a lista e as séries usam.
--
-- CONTRATO (para X177/X178/X179/X184 consumirem; nenhum deles precisa reabrir esta função):
--   * motivo: `reason_code` (enum text) -> `reason_label`/`reason_tone`. A tabela
--     `talkx_suppression_reasons` (X070, Fase 6) AINDA NÃO EXISTE no repositório nem no
--     catálogo — por isso o rótulo/tom sai do mapa fixo abaixo, espelhando os 6 códigos do
--     enum e os rótulos do mock (F06). Quando o X070 entrar, o mapa troca por um JOIN, com
--     esta migration como histórico; hoje um JOIN quebraria com 42P01.
--   * `reason` (texto livre) vai no campo `reason` = observação, sem tocar no rótulo.
--   * status: `removido` (removed_at) tem precedência sobre `expirado` (expires_at <= agora).
--   * atividade: os eventos de entidade gravam `campaign_id` nulo, `entity_type='talkx_blacklist'`
--     e `entity_id` = id da linha de talkx_blacklist (ou `entity_type='contact'` + id do contato).
--     A contagem do lote de importação NÃO é devolvida: ela exigiria a coluna
--     `talkx_blacklist.import_batch_id`, que é DDL do X177 — fora do meu cartão (diff maior que
--     o título). O evento leva o número no campo `message`, que a função devolve.
--   * ACL: as três nascem fechadas para PUBLIC/anon/service_role e abertas SÓ para
--     authenticated (service_role não tem auth.uid() e não passa pela barreira admin/supervisor).
--
-- Classe: contrato (CREATE OR REPLACE FUNCTION x3 + REVOKE/GRANT + CREATE INDEX).
-- Idempotente/replayável: CREATE OR REPLACE + CREATE INDEX IF NOT EXISTS + REVOKE/GRANT explícitos.
-- Nada de dado existente é lido, alterado ou apagado por esta migration (nenhum UPDATE/DELETE/INSERT).

CREATE INDEX IF NOT EXISTS idx_talkx_blacklist_created_at_desc
  ON public.talkx_blacklist USING btree (created_at DESC);

-- ============================================================================
-- (a) listagem paginada
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_suppression_list(
  p_busca     text    DEFAULT NULL,
  p_origens   text[]  DEFAULT NULL,
  p_motivos   text[]  DEFAULT NULL,
  p_campanha  uuid    DEFAULT NULL,
  p_de        date    DEFAULT NULL,
  p_ate       date    DEFAULT NULL,
  p_status    text    DEFAULT NULL,
  p_ordenacao text    DEFAULT 'data',
  p_direcao   text    DEFAULT 'desc',
  p_limite    integer DEFAULT 25,
  p_offset    integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
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
$fn$;

REVOKE ALL ON FUNCTION public.talkx_suppression_list(text, text[], text[], uuid, date, date, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
-- service_role NAO tem EXECUTE: a barreira exige admin/supervisor e service_role nao tem
-- auth.uid(); a leitura e da tela por sessao autenticada.
GRANT EXECUTE ON FUNCTION public.talkx_suppression_list(text, text[], text[], uuid, date, date, text, text, text, integer, integer) TO authenticated;

-- ============================================================================
-- (b) KPIs: valor, valor do período anterior e série de 8 pontos
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_suppression_stats(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid             uuid := auth.uid();
  v_days            integer;
  v_now             timestamptz := statement_timestamp();
  v_start           timestamptz;
  v_prev_start      timestamptz;
  v_active_value    integer;
  v_active_prev     integer;
  v_active_series   jsonb;
  v_optout_value    integer;
  v_optout_prev     integer;
  v_optout_series   jsonb;
  v_manual_value    integer;
  v_manual_prev     integer;
  v_manual_series   jsonb;
  v_prot_value      integer;
  v_prot_prev       integer;
  v_prot_series     jsonb;
  v_total_campaigns integer;
  v_campaigns       jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(public.is_admin_or_supervisor(v_uid), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_suppression_read_role_required' USING ERRCODE = '42501';
  END IF;

  v_days := COALESCE(p_days, 30);
  IF v_days < 1 OR v_days > 365 THEN
    RAISE EXCEPTION 'invalid_talkx_suppression_days' USING ERRCODE = '22023';
  END IF;

  v_start := v_now - make_interval(days => v_days);
  v_prev_start := v_start - make_interval(days => v_days);

  -- suprimidos ativos (estoque): nem expirados nem removidos
  SELECT count(*) INTO v_active_value
    FROM public.talkx_blacklist b
   WHERE b.removed_at IS NULL
     AND (b.expires_at IS NULL OR b.expires_at > v_now);

  -- estoque é comparável no INÍCIO do período (v_start), não na janela anterior (v_prev_start)
  SELECT count(*) INTO v_active_prev
    FROM public.talkx_blacklist b
   WHERE b.created_at <= v_start
     AND (b.removed_at IS NULL OR b.removed_at > v_start)
     AND (b.expires_at IS NULL OR b.expires_at > v_start);

  SELECT COALESCE(jsonb_agg(cnt::integer ORDER BY g), '[]'::jsonb) INTO v_active_series
    FROM generate_series(0, 7) AS g
    CROSS JOIN LATERAL (
      SELECT count(*) AS cnt
        FROM public.talkx_blacklist b
       WHERE b.created_at <= v_start + make_interval(days => v_days * (g + 1) / 8)
         AND (b.removed_at IS NULL OR b.removed_at > v_start + make_interval(days => v_days * (g + 1) / 8))
         AND (b.expires_at IS NULL OR b.expires_at > v_start + make_interval(days => v_days * (g + 1) / 8))
    ) s;

  -- opt-outs do período (reason_code='opt_out', o que inclui auto_optout)
  SELECT count(*) INTO v_optout_value
    FROM public.talkx_blacklist b
   WHERE b.reason_code = 'opt_out'
     AND b.created_at >= v_start AND b.created_at <= v_now;

  SELECT count(*) INTO v_optout_prev
    FROM public.talkx_blacklist b
   WHERE b.reason_code = 'opt_out'
     AND b.created_at >= v_prev_start AND b.created_at < v_start;

  SELECT COALESCE(jsonb_agg(cnt::integer ORDER BY g), '[]'::jsonb) INTO v_optout_series
    FROM generate_series(0, 7) AS g
    CROSS JOIN LATERAL (
      SELECT count(*) AS cnt
        FROM public.talkx_blacklist b
       WHERE b.reason_code = 'opt_out'
         AND b.created_at >= v_start + make_interval(days => v_days * g / 8)
         AND b.created_at <  v_start + make_interval(days => v_days * (g + 1) / 8)
    ) s;

  -- bloqueios manuais (origem manual), mesma janela e mesma série
  SELECT count(*) INTO v_manual_value
    FROM public.talkx_blacklist b
   WHERE b.origin = 'manual'
     AND b.created_at >= v_start AND b.created_at <= v_now;

  SELECT count(*) INTO v_manual_prev
    FROM public.talkx_blacklist b
   WHERE b.origin = 'manual'
     AND b.created_at >= v_prev_start AND b.created_at < v_start;

  SELECT COALESCE(jsonb_agg(cnt::integer ORDER BY g), '[]'::jsonb) INTO v_manual_series
    FROM generate_series(0, 7) AS g
    CROSS JOIN LATERAL (
      SELECT count(*) AS cnt
        FROM public.talkx_blacklist b
       WHERE b.origin = 'manual'
         AND b.created_at >= v_start + make_interval(days => v_days * g / 8)
         AND b.created_at <  v_start + make_interval(days => v_days * (g + 1) / 8)
    ) s;

  -- campanhas protegidas (estoque: iniciadas com respect_suppression)
  SELECT count(*) INTO v_prot_value
    FROM public.talkx_campaigns c
   WHERE c.started_at IS NOT NULL AND c.respect_suppression;

  -- estoque é comparável no INÍCIO do período (v_start), não na janela anterior (v_prev_start)
  SELECT count(*) INTO v_prot_prev
    FROM public.talkx_campaigns c
   WHERE c.started_at IS NOT NULL AND c.respect_suppression
     AND c.started_at <= v_start;

  SELECT COALESCE(jsonb_agg(cnt::integer ORDER BY g), '[]'::jsonb) INTO v_prot_series
    FROM generate_series(0, 7) AS g
    CROSS JOIN LATERAL (
      SELECT count(*) AS cnt
        FROM public.talkx_campaigns c
       WHERE c.started_at IS NOT NULL AND c.respect_suppression
         AND c.started_at <= v_start + make_interval(days => v_days * (g + 1) / 8)
    ) s;

  SELECT count(*) INTO v_total_campaigns
    FROM public.talkx_campaigns c
   WHERE c.started_at IS NOT NULL;

  -- campanhas que têm supressão (alimentam o filtro "Campanha")
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) ORDER BY x.name), '[]'::jsonb)
    INTO v_campaigns
    FROM (
      SELECT DISTINCT tc.id, tc.name
        FROM public.talkx_blacklist b
        JOIN public.talkx_campaigns tc ON tc.id = b.campaign_id
    ) x;

  RETURN jsonb_build_object(
    'period_days',     v_days,
    'active',          jsonb_build_object('value', v_active_value, 'previous', v_active_prev, 'series', v_active_series),
    'optouts',         jsonb_build_object('value', v_optout_value, 'previous', v_optout_prev, 'series', v_optout_series),
    'manual',          jsonb_build_object('value', v_manual_value, 'previous', v_manual_prev, 'series', v_manual_series),
    'protected',       jsonb_build_object('value', v_prot_value,   'previous', v_prot_prev,   'series', v_prot_series),
    'total_campaigns', v_total_campaigns,
    'campaigns',       v_campaigns
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.talkx_suppression_stats(integer) FROM PUBLIC, anon, authenticated;
-- service_role NAO tem EXECUTE: a barreira exige admin/supervisor e service_role nao tem
-- auth.uid(); a leitura e da tela por sessao autenticada.
GRANT EXECUTE ON FUNCTION public.talkx_suppression_stats(integer) TO authenticated;

-- ============================================================================
-- (c) atividade recente lida dos eventos de entidade suppression*
-- ============================================================================
CREATE OR REPLACE FUNCTION public.talkx_suppression_activity(
  p_limite integer DEFAULT 5,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_limite integer;
  v_offset integer;
  v_total  integer := 0;
  v_rows   jsonb := '[]'::jsonb;
  v_rec    record;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(public.is_admin_or_supervisor(v_uid), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_suppression_read_role_required' USING ERRCODE = '42501';
  END IF;

  v_limite := COALESCE(p_limite, 5);
  IF v_limite < 1 OR v_limite > 200 THEN
    RAISE EXCEPTION 'invalid_talkx_suppression_limit' USING ERRCODE = '22023';
  END IF;

  v_offset := COALESCE(p_offset, 0);
  IF v_offset < 0 THEN
    RAISE EXCEPTION 'invalid_talkx_suppression_offset' USING ERRCODE = '22023';
  END IF;

  FOR v_rec IN
    WITH base AS (
      SELECT e.id,
             e.event_type,
             e.message,
             e.created_at,
             e.entity_type,
             e.entity_id,
             pr.name AS actor_name,
             c.name  AS contact_name,
             c.email AS contact_email,
             COALESCE(c.phone, b.phone) AS contact_phone,
             CASE e.event_type
               WHEN 'suppression_add'    THEN 'adicionado'
               WHEN 'suppression_remove' THEN 'removido'
               WHEN 'suppression_update' THEN 'atualizado'
               WHEN 'suppression_import' THEN 'importacao'
               WHEN 'suppression_export' THEN 'exportacao'
             END AS kind
        FROM public.talkx_campaign_events e
        LEFT JOIN public.profiles pr ON pr.id = e.actor_id
        LEFT JOIN public.talkx_blacklist b
               ON e.entity_type = 'talkx_blacklist' AND b.id = e.entity_id
        LEFT JOIN public.contacts c
               ON c.id = COALESCE(b.contact_id, CASE WHEN e.entity_type = 'contact' THEN e.entity_id END)
       WHERE e.event_type IN (
               'suppression_add', 'suppression_remove', 'suppression_update',
               'suppression_import', 'suppression_export'
             )
    )
    SELECT b.*, count(*) OVER () AS total_count
      FROM base b
     ORDER BY b.created_at DESC, b.id DESC
     LIMIT v_limite OFFSET v_offset
  LOOP
    v_total := v_rec.total_count;
    v_rows := v_rows || jsonb_build_object(
      'id',            v_rec.id,
      'event_type',    v_rec.event_type,
      'kind',          v_rec.kind,
      'actor_name',    v_rec.actor_name,
      'contact_name',  v_rec.contact_name,
      'contact_email', v_rec.contact_email,
      'contact_phone', v_rec.contact_phone,
      'message',       v_rec.message,
      'created_at',    v_rec.created_at
    );
  END LOOP;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$fn$;

REVOKE ALL ON FUNCTION public.talkx_suppression_activity(integer, integer) FROM PUBLIC, anon, authenticated;
-- service_role NAO tem EXECUTE: a barreira exige admin/supervisor e service_role nao tem
-- auth.uid(); a leitura e da tela por sessao autenticada.
GRANT EXECUTE ON FUNCTION public.talkx_suppression_activity(integer, integer) TO authenticated;
