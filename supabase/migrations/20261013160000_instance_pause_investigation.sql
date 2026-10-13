-- instance_pause_investigation
-- Rollback: remove as duas RPC novas (serie de auth e investigacao) e as tres colunas de investigacao da tabela de pausas; nenhuma tabela, policy ou grant pre-existente e tocado.
-- Rollback (SQL executável, na ordem):
--   DROP FUNCTION IF EXISTS public.instance_auth_event_series(text);
--   DROP FUNCTION IF EXISTS public.mark_pause_investigated(uuid, text);
--   ALTER TABLE public.instance_pauses DROP CONSTRAINT IF EXISTS instance_pauses_investigacao_completa;
--   ALTER TABLE public.instance_pauses DROP CONSTRAINT IF EXISTS instance_pauses_notas_sem_html;
--   ALTER TABLE public.instance_pauses DROP CONSTRAINT IF EXISTS instance_pauses_notas_tamanho;
--   ALTER TABLE public.instance_pauses DROP COLUMN IF EXISTS investigation_notes;
--   ALTER TABLE public.instance_pauses DROP COLUMN IF EXISTS investigated_by;
--   ALTER TABLE public.instance_pauses DROP COLUMN IF EXISTS investigated_at;
--
-- IP2 — investigacao de incidentes de pausa de instancia (filho do IP1, cartao t_8215f5f9,
-- migration 20261011183812_instance_pauses.sql). Duas partes, ambas ADITIVAS:
--
--   1. Investigacao com ator. A pausa do IP1 dizia SE e POR QUE a instancia foi pausada,
--      mas nao dizia se alguem olhou o incidente. Acrescenta investigated_at /
--      investigated_by / investigation_notes e a RPC mark_pause_investigated(id, notes),
--      restrita a admin/supervisor. NAO ha re-escrita de auditoria: quem investigou primeiro
--      e quando ficam congelados (COALESCE); uma segunda chamada so acrescenta/atualiza as
--      notas. Alem das colunas, grava UMA linha em public.audit_logs (acao
--      'instance_pause_investigated') — e a auditoria consultavel do ato administrativo.
--      As notas NAO sao copiadas para o audit_logs (nao duplicar texto livre).
--
--   2. Serie de eventos de autenticacao da instancia. FONTE REAL no V2: o watchdog
--      `connection-health-check` ja grava UMA linha por conexao a cada verificacao em
--      public.connection_health_logs, com status 'no_credentials' quando a Evolution
--      devolve 401/403 (credencial da instancia recusada) e 'error'/'timeout'/'disconnected'
--      para as demais falhas. A RPC instance_auth_event_series('24h'|'7d') agrega essa
--      tabela em baldes (1 hora em 24h, 1 dia em 7d) por instancia, devolvendo SOMENTE
--      contagens — nada de error_message, IP, telefone ou identificacao de pessoa.
--      O V3 mostrava a mesma serie a partir de uma tabela propria de eventos de auth; o V2
--      nao precisa de tabela nova (nem de appender novo) porque o watchdog ja registra o
--      fato. Diferente do V3, que separava 'invalid_signature'/'auth_401'/'auth_403', aqui a
--      origem so distingue 401/403 das demais falhas: a coluna se chama auth_failures e nao
--      inventa um motivo que a fonte nao guarda.
--
-- ETAPA: IP2 (paridade com o outro sistema). Nada aqui toca DADOS existentes: as colunas
-- nascem NULL e as funcoes sao novas.

-- ============================================================ 1. colunas de investigacao
ALTER TABLE public.instance_pauses
  ADD COLUMN IF NOT EXISTS investigated_at     timestamptz,
  ADD COLUMN IF NOT EXISTS investigated_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS investigation_notes text;

COMMENT ON COLUMN public.instance_pauses.investigated_at IS
  'Quando o incidente foi investigado (congelado na primeira investigacao).';
COMMENT ON COLUMN public.instance_pauses.investigated_by IS
  'Perfil de quem investigou (congelado na primeira investigacao).';
COMMENT ON COLUMN public.instance_pauses.investigation_notes IS
  'Notas da investigacao: texto puro, ate 1000 caracteres, sem HTML.';

-- a investigacao e um ato completo: ou tem autor e data, ou nao aconteceu
ALTER TABLE public.instance_pauses
  DROP CONSTRAINT IF EXISTS instance_pauses_investigacao_completa;
ALTER TABLE public.instance_pauses
  ADD CONSTRAINT instance_pauses_investigacao_completa
  CHECK ((investigated_at IS NULL) = (investigated_by IS NULL));

-- limite de tamanho e ausencia de HTML tambem no BANCO (nao so na funcao)
ALTER TABLE public.instance_pauses
  DROP CONSTRAINT IF EXISTS instance_pauses_notas_tamanho;
ALTER TABLE public.instance_pauses
  ADD CONSTRAINT instance_pauses_notas_tamanho
  CHECK (investigation_notes IS NULL OR char_length(investigation_notes) <= 1000);

ALTER TABLE public.instance_pauses
  DROP CONSTRAINT IF EXISTS instance_pauses_notas_sem_html;
ALTER TABLE public.instance_pauses
  ADD CONSTRAINT instance_pauses_notas_sem_html
  CHECK (investigation_notes IS NULL OR investigation_notes !~ '[<>]');

-- ============================================================ 2. RPC de investigacao
CREATE OR REPLACE FUNCTION public.mark_pause_investigated(
  p_pause_id uuid,
  p_notes    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $mark_pause_investigated$
DECLARE
  v_uid     uuid := auth.uid();
  v_profile uuid;
  v_notes   text;
  v_row     public.instance_pauses;
  v_ja      boolean;
BEGIN
  -- autorizacao ANTES de qualquer efeito
  IF v_uid IS NULL OR NOT public.is_admin_or_supervisor(v_uid) THEN
    RAISE EXCEPTION 'sem_permissao_para_investigar_pausa' USING ERRCODE = '42501';
  END IF;

  IF p_pause_id IS NULL THEN
    RAISE EXCEPTION 'pausa_invalida' USING ERRCODE = '22023';
  END IF;

  -- o ator gravado e o PERFIL (mesma FK de paused_by/resumed_by), nao o auth.users
  v_profile := public.get_profile_id_for_user(v_uid);
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'perfil_nao_encontrado' USING ERRCODE = '42501';
  END IF;

  IF p_notes IS NOT NULL THEN
    v_notes := btrim(p_notes);
    IF v_notes = '' THEN
      v_notes := NULL;                       -- nota em branco = sem nota (nao apaga a antiga)
    END IF;
    IF v_notes IS NOT NULL THEN
      IF char_length(v_notes) > 1000 THEN
        RAISE EXCEPTION 'notas_acima_do_limite' USING ERRCODE = '22023';
      END IF;
      IF v_notes ~ '[<>]' THEN
        RAISE EXCEPTION 'notas_com_html' USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  SELECT * INTO v_row
    FROM public.instance_pauses
   WHERE id = p_pause_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pausa_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  v_ja := v_row.investigated_at IS NOT NULL;

  UPDATE public.instance_pauses
     SET investigated_at     = COALESCE(investigated_at, now()),
         investigated_by     = COALESCE(investigated_by, v_profile),
         investigation_notes = COALESCE(v_notes, investigation_notes)
   WHERE id = p_pause_id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (v_uid, 'instance_pause_investigated', 'instance_pause', v_row.id,
          jsonb_build_object(
            'instance', v_row.instance,
            'ja_investigada', v_ja,
            'com_notas', v_row.investigation_notes IS NOT NULL
          ));

  RETURN jsonb_build_object(
    'id', v_row.id,
    'instance', v_row.instance,
    'investigated_at', v_row.investigated_at,
    'investigated_by', v_row.investigated_by,
    'investigation_notes', v_row.investigation_notes,
    'ja_investigada', v_ja
  );
END
$mark_pause_investigated$;

REVOKE ALL ON FUNCTION public.mark_pause_investigated(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_pause_investigated(uuid, text) TO authenticated;

-- ============================================================ 3. serie de auth (somente contagens)
CREATE OR REPLACE FUNCTION public.instance_auth_event_series(p_window text DEFAULT '24h')
RETURNS TABLE (
  bucket        timestamptz,
  instance      text,
  auth_failures integer,
  disconnected  integer,
  errors        integer,
  total         integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $instance_auth_event_series$
DECLARE
  v_desde timestamptz;
  v_passo interval;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'sem_permissao_para_ver_eventos_de_auth' USING ERRCODE = '42501';
  END IF;

  IF p_window IS NULL OR p_window NOT IN ('24h', '7d') THEN
    RAISE EXCEPTION 'janela_invalida' USING ERRCODE = '22023';
  END IF;

  IF p_window = '24h' THEN
    v_desde := now() - interval '24 hours';
    v_passo := interval '1 hour';
  ELSE
    v_desde := now() - interval '7 days';
    v_passo := interval '1 day';
  END IF;

  RETURN QUERY
  SELECT
    date_bin(v_passo, l.checked_at, timestamptz '2000-01-01 00:00:00+00') AS bucket,
    l.instance_id,
    count(*) FILTER (WHERE l.status = 'no_credentials')::integer          AS auth_failures,
    count(*) FILTER (WHERE l.status = 'disconnected')::integer            AS disconnected,
    count(*) FILTER (WHERE l.status IN ('error', 'timeout'))::integer     AS errors,
    count(*)::integer                                                     AS total
  FROM public.connection_health_logs l
  WHERE l.checked_at >= v_desde
  GROUP BY 1, 2
  ORDER BY 1 ASC, 2 ASC;
END
$instance_auth_event_series$;

REVOKE ALL ON FUNCTION public.instance_auth_event_series(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.instance_auth_event_series(text) TO authenticated;

COMMENT ON FUNCTION public.instance_auth_event_series(text) IS
  'Serie de eventos de autenticacao/falha da instancia (24h por hora, 7d por dia) a partir do watchdog connection_health_logs. Somente contagens, somente admin/supervisor.';
COMMENT ON FUNCTION public.mark_pause_investigated(uuid, text) IS
  'Registra a investigacao de uma pausa de instancia (ator + data + notas), somente admin/supervisor, com trilha em audit_logs.';
