-- instance_auth_events
-- Rollback: remove a tabela nova, as tres funcoes e o agendamento do expurgo; nada pre-existente e tocado.
-- Rollback (SQL executável, na ordem):
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-instance-auth-events';
--   DROP FUNCTION IF EXISTS public.purge_instance_auth_events(integer);
--   DROP FUNCTION IF EXISTS public.instance_auth_event_summary(integer, text);
--   DROP FUNCTION IF EXISTS public.instance_auth_event_trend(integer, text);
--   DROP TABLE IF EXISTS public.instance_auth_events;
--
-- ETAPA: fonte de dados do painel de pausas de instancia (PD-28/PD-29: investigacao
-- e grafico de 24 h / 7 d). Paridade com o outro sistema, que grava a serie em
-- `zapp.instance_auth_events` (instance_name, reason invalid_signature|auth_401|auth_403,
-- source, http_status, detail) e expoe `rpc_instance_auth_event_trend` e
-- `rpc_instance_auth_event_summary` (ver scripts/decouple/snapshots/zapp_schema_snapshot.sql).
-- No V2 o identificador de conexao e' `public.whatsapp_connections.instance_id`.
--
-- O QUE ESTA MIGRATION CRIA (tudo ADITIVO — nenhuma coluna, policy ou GRANT existente muda):
--   1. Tabela `public.instance_auth_events` com RLS LIGADA, leitura so para STAFF
--      (public.is_admin_or_supervisor(auth.uid())) e escrita so pelo service_role;
--      `detail` limitado a 200 caracteres (nunca dado pessoal) e `reason` restrito
--      aos tres valores que o webhook sabe emitir.
--   2. `public.instance_auth_event_trend(p_hours, p_instance)` — serie: balde de
--      1 HORA quando p_hours <= 24 e de 1 DIA quando p_hours > 24 (24 h e 7 d).
--   3. `public.instance_auth_event_summary(p_hours, p_instance)` — resumo com a
--      janela EXPLICITA devolvida (`window_hours`), para o painel calcular eventos/h
--      sobre a MESMA janela das contagens (falha corrigida na origem).
--   4. `public.purge_instance_auth_events(p_days DEFAULT 30)` + agendamento diario
--      no pg_cron — retencao de 30 dias.
-- As tres funcoes sao SECURITY DEFINER com search_path = pg_catalog, public, validam
-- a entrada ANTES de qualquer efeito e deixam o erro PROPAGAR (nunca devolvem zero
-- silencioso): janela invalida -> 22023, acesso indevido -> 42501.
--
-- ============================================================================
-- 1) Serie de eventos de autenticacao por instancia
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.instance_auth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name text NOT NULL,
  reason text NOT NULL,
  source text NOT NULL DEFAULT 'webhook',
  http_status integer,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instance_auth_events_instance_nao_vazio CHECK (btrim(instance_name) <> ''),
  CONSTRAINT instance_auth_events_reason_valida
    CHECK (reason IN ('invalid_signature', 'auth_401', 'auth_403')),
  CONSTRAINT instance_auth_events_source_valido
    CHECK (source IN ('webhook', 'evolution-api')),
  CONSTRAINT instance_auth_events_http_status_valido
    CHECK (http_status IS NULL OR (http_status >= 100 AND http_status <= 599)),
  CONSTRAINT instance_auth_events_detail_tamanho
    CHECK (detail IS NULL OR char_length(detail) <= 200)
);

COMMENT ON TABLE public.instance_auth_events IS
  'Falhas de autenticacao por instancia de WhatsApp (serie 24 h/7 d e resumo do painel de pausas). Retencao de 30 dias (purge_instance_auth_events).';
COMMENT ON COLUMN public.instance_auth_events.detail IS
  'Mensagem curta do erro, ate 200 caracteres. NUNCA gravar dado pessoal (telefone, nome, CPF, conteudo de conversa).';
COMMENT ON COLUMN public.instance_auth_events.instance_name IS
  'Identificador da conexao de WhatsApp (public.whatsapp_connections.instance_id).';

-- Expurgo (retencao de 30 dias) e serie/resumo filtram por created_at.
CREATE INDEX IF NOT EXISTS instance_auth_events_created_at_idx
  ON public.instance_auth_events (created_at);
CREATE INDEX IF NOT EXISTS instance_auth_events_instance_created_idx
  ON public.instance_auth_events (instance_name, created_at DESC);

ALTER TABLE public.instance_auth_events ENABLE ROW LEVEL SECURITY;

-- O Supabase concede ALL por padrao a anon/authenticated em tabela NOVA do schema
-- public: por isso o REVOKE e' explicito e total, e devolvemos SO o SELECT ao staff.
-- Escrever direto passa a ser impossivel para papel de cliente — o webhook grava
-- como service_role e o painel le como staff.
REVOKE ALL ON TABLE public.instance_auth_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.instance_auth_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.instance_auth_events TO service_role;

-- Leitura apenas por STAFF (admin/supervisor). Nao ha policy de INSERT/UPDATE/DELETE,
-- e anon/authenticated nao tem esse GRANT (revogado acima): por padrao a RLS nega.
DROP POLICY IF EXISTS "instance_auth_events_select_staff" ON public.instance_auth_events;
CREATE POLICY "instance_auth_events_select_staff"
  ON public.instance_auth_events
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- ============================================================================
-- 2) Serie (trend): 1 hora ate 24 h, 1 dia acima disso (janela de 7 dias)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.instance_auth_event_trend(
  p_hours integer DEFAULT 24,
  p_instance text DEFAULT NULL
) RETURNS TABLE (
  bucket timestamptz,
  instance_name text,
  invalid_signature integer,
  auth_401 integer,
  auth_403 integer,
  total integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_instance text := nullif(btrim(p_instance), '');
BEGIN
  -- Autorizacao ANTES de qualquer leitura; erro igual para caso existente e inexistente.
  IF coalesce(auth.role(), '') <> 'service_role'
     AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'sem_permissao_para_consultar_eventos' USING ERRCODE = '42501';
  END IF;

  -- Janela EXPLICITA: nao ha clamp silencioso — fora de 1..168 h o erro propaga.
  IF p_hours IS NULL OR p_hours < 1 OR p_hours > 168 THEN
    RAISE EXCEPTION 'janela_de_horas_fora_da_faixa_1_168' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    date_trunc(CASE WHEN p_hours <= 24 THEN 'hour' ELSE 'day' END, e.created_at) AS bucket,
    e.instance_name,
    (count(*) FILTER (WHERE e.reason = 'invalid_signature'))::integer AS invalid_signature,
    (count(*) FILTER (WHERE e.reason = 'auth_401'))::integer AS auth_401,
    (count(*) FILTER (WHERE e.reason = 'auth_403'))::integer AS auth_403,
    (count(*))::integer AS total
  FROM public.instance_auth_events e
  WHERE e.created_at >= now() - make_interval(hours => p_hours)
    AND (v_instance IS NULL OR e.instance_name = v_instance)
  GROUP BY 1, 2
  ORDER BY 1, 2;
END;
$$;

REVOKE ALL ON FUNCTION public.instance_auth_event_trend(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instance_auth_event_trend(integer, text)
  TO authenticated, service_role;

-- ============================================================================
-- 3) Resumo com a JANELA explicita devolvida (window_hours)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.instance_auth_event_summary(
  p_hours integer DEFAULT 24,
  p_instance text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_instance text := nullif(btrim(p_instance), '');
  v_since timestamptz;
  v_total integer;
  v_inv integer;
  v_401 integer;
  v_403 integer;
  v_first timestamptz;
  v_last timestamptz;
  v_top jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
     AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'sem_permissao_para_consultar_eventos' USING ERRCODE = '42501';
  END IF;

  IF p_hours IS NULL OR p_hours < 1 OR p_hours > 168 THEN
    RAISE EXCEPTION 'janela_de_horas_fora_da_faixa_1_168' USING ERRCODE = '22023';
  END IF;

  v_since := now() - make_interval(hours => p_hours);

  SELECT
    (count(*))::integer,
    (count(*) FILTER (WHERE e.reason = 'invalid_signature'))::integer,
    (count(*) FILTER (WHERE e.reason = 'auth_401'))::integer,
    (count(*) FILTER (WHERE e.reason = 'auth_403'))::integer,
    min(e.created_at),
    max(e.created_at)
  INTO v_total, v_inv, v_401, v_403, v_first, v_last
  FROM public.instance_auth_events e
  WHERE e.created_at >= v_since
    AND (v_instance IS NULL OR e.instance_name = v_instance);

  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object('instance_name', t.instance_name, 'total', t.total)
             ORDER BY t.total DESC, t.instance_name
           ),
           '[]'::jsonb)
  INTO v_top
  FROM (
    SELECT e.instance_name, (count(*))::integer AS total
    FROM public.instance_auth_events e
    WHERE e.created_at >= v_since
      AND (v_instance IS NULL OR e.instance_name = v_instance)
    GROUP BY e.instance_name
    ORDER BY (count(*)) DESC, e.instance_name
    LIMIT 5
  ) t;

  RETURN jsonb_build_object(
    'window_hours', p_hours,
    'instance', v_instance,
    'total', v_total,
    'invalid_signature', v_inv,
    'auth_401', v_401,
    'auth_403', v_403,
    'first_event_at', v_first,
    'last_event_at', v_last,
    'top_instances', v_top
  );
END;
$$;

REVOKE ALL ON FUNCTION public.instance_auth_event_summary(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instance_auth_event_summary(integer, text)
  TO authenticated, service_role;

-- ============================================================================
-- 4) Retencao de 30 dias (funcao + agendamento diario)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.purge_instance_auth_events(
  p_days integer DEFAULT 30
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_n integer;
BEGIN
  -- So service_role (o agendador do pg_cron roda sem claims: auth.role() e' NULL).
  IF coalesce(auth.role(), '') NOT IN ('', 'service_role') THEN
    RAISE EXCEPTION 'somente_service_role' USING ERRCODE = '42501';
  END IF;

  IF p_days IS NULL OR p_days < 1 OR p_days > 3650 THEN
    RAISE EXCEPTION 'dias_fora_da_faixa_1_3650' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.instance_auth_events
   WHERE created_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_instance_auth_events(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_instance_auth_events(integer) TO service_role;

-- Agendamento: 1x/dia as 03:45 UTC retendo 30 dias. Tolerante a base SEM pg_cron
-- (extensao ausente, instalada sob outro schema ou com o schema cron removido):
-- a guarda e' a EXISTENCIA de cron.job (to_regclass), nao a linha em pg_extension,
-- e o EXCEPTION cobre a remocao no meio do caminho. Sem agenda, o expurgo segue
-- disponivel via SELECT public.purge_instance_auth_events(30) como service_role.
DO $agenda_purge$
DECLARE
  v_tem_agenda boolean;
BEGIN
  SELECT to_regclass('cron.job') IS NOT NULL INTO v_tem_agenda;
  IF NOT v_tem_agenda THEN
    RAISE NOTICE 'pg_cron ausente: agendamento do expurgo ignorado (purge_instance_auth_events segue disponivel)';
    RETURN;
  END IF;

  BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-instance-auth-events') THEN
      PERFORM cron.unschedule(job_name := 'purge-instance-auth-events');
    END IF;
    -- Notacao NOMEADA (job_name/schedule/command, como na assinatura real
    -- schedule(job_name text, schedule text, command text)): a ligacao nao
    -- depende da ordem posicional dos argumentos.
    PERFORM cron.schedule(
      job_name := 'purge-instance-auth-events',
      schedule := '45 3 * * *',
      command  := 'SELECT public.purge_instance_auth_events(30)'
    );
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'pg_cron removido durante o agendamento: expurgo nao agendado (purge_instance_auth_events segue disponivel)';
  END;
END
$agenda_purge$;
