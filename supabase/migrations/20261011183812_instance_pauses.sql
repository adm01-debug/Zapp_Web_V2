-- instance_pauses
-- Rollback: remove a tabela nova e as quatro funcoes; nada pre-existente e tocado.
-- Rollback (SQL executável, na ordem):
--   DROP FUNCTION IF EXISTS public.auto_pause_instance(text, integer, text);
--   DROP FUNCTION IF EXISTS public.resume_instance(text);
--   DROP FUNCTION IF EXISTS public.pause_instance(text, integer, text);
--   DROP FUNCTION IF EXISTS public.is_instance_paused(text);
--   DROP TABLE IF EXISTS public.instance_pauses;
--
-- ETAPA: pausa de instancia de WhatsApp por TEMPO DETERMINADO (paridade com o outro
-- sistema, que tinha `public.instance_processing_pauses (instance_name, paused_until)`
-- — ver supabase/migrations/_foreign/20260612110000_*.sql, que NAO se aplica aqui).
-- No V2 o identificador de conexao e' `public.whatsapp_connections.instance_id`.
--
-- O QUE ESTA MIGRATION CRIA (tudo ADITIVO — nenhuma coluna, policy ou GRANT existente muda):
--
--   1. public.instance_pauses — o HISTORICO de pausas. Cada pausa e' UMA linha:
--      `instance` (a conexao), `paused_until` (fim da pausa), `reason`, `paused_by`
--      (perfil de quem pausou; NULL quando automatica), `auto` (true = pausada pelo
--      sistema), `resumed_at`/`resumed_by` (retomada antecipada pelo staff) e
--      `created_at`. Um indice unico PARCIAL em (instance) WHERE resumed_at IS NULL
--      garante no maximo UMA pausa ABERTA por instancia — e' o que torna
--      pause_instance idempotente (pausar de novo ESTENDE a pausa aberta em vez de
--      criar uma segunda). Retomar (resumed_at/resumed_by) fecha a linha aberta e
--      libera a instancia para uma pausa futura.
--
--   2. Funcoes SECURITY DEFINER (dono = owner das tabelas, por isso ignoram a RLS e
--      sao a UNICA via de escrita):
--        pause_instance(instancia, minutos, motivo)   -> jsonb  (staff; 5..1440 min)
--        resume_instance(instancia)                   -> integer (staff; nº de pausas fechadas)
--        is_instance_paused(instancia)                -> boolean (STABLE; o que a ENTREGA consulta)
--        auto_pause_instance(instancia, minutos, motivo) -> jsonb (SO service_role)
--
--   `is_instance_paused` e' a leitura que a entrega usa: true somente quando existe
--   pausa ABERTA e ainda NO PRAZO (resumed_at IS NULL AND paused_until > now()). Pausa
--   vencida (mas nao retomada) NAO conta — a instancia volta a enviar sozinha. A funcao
--   nega por padrao para quem nao e' staff nem service_role (42501).
--
-- RLS:
--   instance_pauses — SELECT so para STAFF (public.is_admin_or_supervisor(auth.uid())).
--   INSERT/UPDATE/DELETE nao sao concedidos a anon nem a authenticated: do lado do
--   cliente, so as funcoes SECURITY DEFINER escrevem. Sem USING (true) em lugar nenhum.
--   O service_role (chave de servidor, fora da RLS) mantem o DML direto.
--
-- AUTORIZACAO ANTES DO EFEITO: as funcoes de escrita checam sessao + staff (ou o
-- service_role, no caso da automatica) ANTES de tocar a tabela; entrada invalida
-- (instancia em branco, minutos fora de 5..1440, motivo vazio) levanta 22023 sem gravar.
--
-- AUDITORIA SEM DADO PESSOAL: a "auditoria" da pausa sao as colunas paused_by/
-- paused_until/auto/resumed_by da propria linha (id de perfil + instante + motivo curto).
-- Nenhum telefone, texto de mensagem ou payload entra em log/gatilho.
--
-- search_path = pg_catalog, public (todas as funcoes; nomes publicos qualificados).
-- Sem BEGIN/COMMIT de topo de proposito (o gateway/replay controla a transacao).

-- ============================================================================
-- 1) Historico de pausas de instancia
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.instance_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance text NOT NULL,
  paused_until timestamptz NOT NULL,
  reason text NOT NULL,
  paused_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  auto boolean NOT NULL DEFAULT false,
  resumed_at timestamptz,
  resumed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instance_pauses_reason_nao_vazio CHECK (btrim(reason) <> ''),
  CONSTRAINT instance_pauses_autor_obrigatorio CHECK (auto OR paused_by IS NOT NULL),
  CONSTRAINT instance_pauses_resume_consistente CHECK (resumed_at IS NOT NULL OR resumed_by IS NULL)
);

COMMENT ON COLUMN public.instance_pauses.instance IS
  'Identificador da conexao de WhatsApp (public.whatsapp_connections.instance_id).';

-- No maximo UMA pausa ABERTA (nao retomada) por instancia. Sustenta a idempotencia
-- de pause_instance/auto_pause_instance via ON CONFLICT ... WHERE resumed_at IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS instance_pauses_abertas_unicas
  ON public.instance_pauses (instance)
  WHERE resumed_at IS NULL;

-- Apoio a is_instance_paused e ao historico por instancia.
CREATE INDEX IF NOT EXISTS instance_pauses_instance_idx
  ON public.instance_pauses (instance);

ALTER TABLE public.instance_pauses ENABLE ROW LEVEL SECURITY;

-- O Supabase concede ALL por padrao a anon/authenticated em tabela NOVA do schema
-- public: por isso o REVOKE e' explicito e total, e devolvemos SO o SELECT ao staff.
-- Escrever direto passa a ser impossivel para papel de cliente — so as funcoes
-- SECURITY DEFINER escrevem.
REVOKE ALL ON TABLE public.instance_pauses FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.instance_pauses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.instance_pauses TO service_role;

-- Leitura apenas por STAFF (admin/supervisor). Nao ha policy de INSERT/UPDATE/DELETE,
-- e anon/authenticated nao tem esse GRANT (revogado acima): por padrao a RLS nega e,
-- do lado do cliente, so as funcoes SECURITY DEFINER escrevem.
CREATE POLICY "instance_pauses_select_staff"
  ON public.instance_pauses
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- ============================================================================
-- 2) Funcoes SECURITY DEFINER — unica via de escrita / leitura da entrega
-- ============================================================================

-- Pausa MANUAL (staff). Autorizacao e validacao ANTES de qualquer efeito. Idempotente:
-- se ja existe pausa aberta para a instancia, ESTENDE (paused_until/reason/paused_by)
-- em vez de criar uma segunda — o autor passa a ser quem estendeu.
CREATE OR REPLACE FUNCTION public.pause_instance(
  p_instance text,
  p_minutes integer,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_profile_id uuid;
  v_row public.instance_pauses;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sessao_nao_autenticada' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'somente_staff_pausa_instancia' USING ERRCODE = '42501';
  END IF;

  IF p_instance IS NULL OR btrim(p_instance) = '' THEN
    RAISE EXCEPTION 'instancia_invalida' USING ERRCODE = '22023';
  END IF;

  IF p_minutes IS NULL OR p_minutes < 5 OR p_minutes > 1440 THEN
    RAISE EXCEPTION 'minutos_fora_da_faixa_5_1440' USING ERRCODE = '22023';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'motivo_obrigatorio' USING ERRCODE = '22023';
  END IF;

  v_profile_id := public.get_profile_id_for_user(auth.uid());

  INSERT INTO public.instance_pauses AS ip (instance, paused_until, reason, paused_by, auto)
  VALUES (
    btrim(p_instance),
    now() + make_interval(mins => p_minutes),
    btrim(p_reason),
    v_profile_id,
    false
  )
  ON CONFLICT (instance) WHERE resumed_at IS NULL
  DO UPDATE SET
    paused_until = EXCLUDED.paused_until,
    reason       = EXCLUDED.reason,
    paused_by    = EXCLUDED.paused_by,
    auto         = EXCLUDED.auto
  RETURNING ip.* INTO v_row;

  RETURN to_jsonb(v_row);
END;
$function$;

REVOKE ALL ON FUNCTION public.pause_instance(text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pause_instance(text, integer, text)
  TO authenticated, service_role;

-- Retoma ANTECIPADA (staff). Fecha a pausa aberta (resumed_at/resumed_by) e devolve
-- quantas fechou (0 quando nao havia pausa aberta — idempotente).
CREATE OR REPLACE FUNCTION public.resume_instance(p_instance text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_profile_id uuid;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sessao_nao_autenticada' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'somente_staff_retoma_instancia' USING ERRCODE = '42501';
  END IF;

  IF p_instance IS NULL OR btrim(p_instance) = '' THEN
    RAISE EXCEPTION 'instancia_invalida' USING ERRCODE = '22023';
  END IF;

  v_profile_id := public.get_profile_id_for_user(auth.uid());

  UPDATE public.instance_pauses
     SET resumed_at = now(),
         resumed_by = v_profile_id
   WHERE instance = btrim(p_instance)
     AND resumed_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.resume_instance(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resume_instance(text) TO authenticated, service_role;

-- Leitura da ENTREGA: true somente com pausa ABERTA e no prazo. STABLE (nao muda a
-- linha) e SECURITY DEFINER com negacao por padrao: staff ou service_role; qualquer
-- outro chamador autenticado recebe 42501.
CREATE OR REPLACE FUNCTION public.is_instance_paused(p_instance text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
     AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'sem_permissao_para_consultar_pausa' USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.instance_pauses p
     WHERE p.instance = p_instance
       AND p.resumed_at IS NULL
       AND p.paused_until > now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.is_instance_paused(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_instance_paused(text) TO authenticated, service_role;

-- Pausa AUTOMATICA (sistema): SO o service_role executa. paused_by fica NULL e
-- auto=true. Se ja existe pausa aberta, apenas ESTENDE o prazo (greatest) e atualiza
-- o motivo — sem roubar o autor nem o `auto` de uma pausa manual ja aberta.
CREATE OR REPLACE FUNCTION public.auto_pause_instance(
  p_instance text,
  p_minutes integer,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_row public.instance_pauses;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'somente_service_role' USING ERRCODE = '42501';
  END IF;

  IF p_instance IS NULL OR btrim(p_instance) = '' THEN
    RAISE EXCEPTION 'instancia_invalida' USING ERRCODE = '22023';
  END IF;

  IF p_minutes IS NULL OR p_minutes < 5 OR p_minutes > 1440 THEN
    RAISE EXCEPTION 'minutos_fora_da_faixa_5_1440' USING ERRCODE = '22023';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'motivo_obrigatorio' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.instance_pauses AS ip (instance, paused_until, reason, paused_by, auto)
  VALUES (
    btrim(p_instance),
    now() + make_interval(mins => p_minutes),
    btrim(p_reason),
    NULL,
    true
  )
  ON CONFLICT (instance) WHERE resumed_at IS NULL
  DO UPDATE SET
    paused_until = greatest(ip.paused_until, EXCLUDED.paused_until),
    reason       = EXCLUDED.reason
  RETURNING ip.* INTO v_row;

  RETURN to_jsonb(v_row);
END;
$function$;

REVOKE ALL ON FUNCTION public.auto_pause_instance(text, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_pause_instance(text, integer, text) TO service_role;
