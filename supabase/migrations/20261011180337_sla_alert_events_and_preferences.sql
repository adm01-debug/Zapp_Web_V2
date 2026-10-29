-- sla_alert_events_and_preferences
-- Rollback: remove as duas tabelas novas e as duas funcoes; nada pre-existente e tocado.
-- Rollback (SQL executável, na ordem):
--   DROP FUNCTION IF EXISTS public.resolve_sla_alert(uuid);
--   DROP FUNCTION IF EXISTS public.record_sla_alert(uuid, text, text);
--   DROP TABLE IF EXISTS public.sla_alert_preferences;
--   DROP TABLE IF EXISTS public.sla_alert_events;
--
-- ETAPA: historico de alertas de SLA + preferencias de alerta por usuario (paridade V3 -> V2).
-- Origem: auditoria de paridade V3 frontend (pages/SLAAlertHistory.tsx,
-- pages/SLAAlertPreferences.tsx) e pedido do Joaquim em 11/10/2026.
--
-- O QUE ESTA MIGRATION CRIA (tudo ADITIVO — nenhuma coluna, policy ou GRANT existente muda):
--
--   1. public.sla_alert_events — o historico. Cada alerta disparado vira UMA linha
--      (contact_id, alert_type in 'first_response'|'resolution', severity in 'warning'|
--      'breached'). Um indice unico PARCIAL em (contact_id, alert_type, severity)
--      WHERE resolved_at IS NULL garante no maximo UM alerta ATIVO por combinacao —
--      e o que torna record_sla_alert idempotente. Resolver (resolved_at/resolved_by)
--      fecha a linha ativa e libera o par para um novo alerta futuro.
--
--   2. public.sla_alert_preferences — preferencias do PROPRIO usuario: chave geral
--      (enabled) + quais tipos (alert_first_response, alert_resolution) e quais
--      severidades (severity_warning, severity_breached) receber. Preferencia
--      ausente = defaults da tabela; nao ha linha obrigatoria.
--
--   3. Funcoes SECURITY DEFINER (dono = owner das tabelas, por isso ignoram a RLS e
--      sao a UNICA via de escrita):
--        record_sla_alert(contact, type, severity) -> uuid  (idempotente)
--        resolve_sla_alert(id)                     -> uuid  (staff)
--
-- RLS:
--   sla_alert_events    — SELECT so para quem VE o contato (mesmo predicado canonico
--                         public.is_contact_visible_to_user, que ja inclui admin/
--                         supervisor = staff). INSERT/UPDATE/DELETE nao sao concedidos
--                         a nenhum papel de cliente: so as funcoes SECURITY DEFINER
--                         escrevem. Sem USING (true) em lugar nenhum.
--   sla_alert_preferences — SELECT/INSERT/UPDATE so da propria linha (user_id = auth.uid());
--                         DELETE nao e concedido (reset = UPDATE dos campos).
--
-- AUDITORIA SEM DADO PESSOAL: a "auditoria" de resolver sao as colunas resolved_at /
-- resolved_by da propria linha (id de perfil + instante). Nenhum telefone, texto de
-- mensagem ou payload entra em log/gatilho.
--
-- search_path = pg_catalog, public (todas as funcoes; nomes publicos qualificados).
-- Sem BEGIN/COMMIT de topo de proposito (o gateway/replay controla a transacao).

-- ============================================================================
-- 1) Historico de alertas de SLA
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sla_alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  alert_type text NOT NULL CHECK (alert_type IN ('first_response', 'resolution')),
  severity text NOT NULL CHECK (severity IN ('warning', 'breached')),
  queue_id uuid REFERENCES public.queues(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT sla_alert_events_resolved_consistente
    CHECK (resolved_at IS NOT NULL OR resolved_by IS NULL)
);

-- No maximo UM alerta ATIVO por (contato, tipo, severidade). Sustenta a
-- idempotencia de record_sla_alert via ON CONFLICT ... WHERE resolved_at IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS sla_alert_events_ativos_unicos
  ON public.sla_alert_events (contact_id, alert_type, severity)
  WHERE resolved_at IS NULL;

-- Apoio ao DELETE em cascata de contacts e as leituras por contato.
CREATE INDEX IF NOT EXISTS sla_alert_events_contact_id_idx
  ON public.sla_alert_events (contact_id);

ALTER TABLE public.sla_alert_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sla_alert_events FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.sla_alert_events TO authenticated;
GRANT SELECT ON TABLE public.sla_alert_events TO service_role;

-- Leitura pela MESMA regra de visibilidade de contato (o helper ja concede a
-- admin/supervisor). INSERT/UPDATE/DELETE nao tem policy: por padrao a RLS nega,
-- e nenhum papel de cliente tem o GRANT — so as funcoes DEFINER escrevem.
CREATE POLICY "sla_alert_events_select_policy"
  ON public.sla_alert_events
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    OR public.is_contact_visible_to_user(contact_id, auth.uid())
  );

-- ============================================================================
-- 2) Preferencias de alerta por usuario
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sla_alert_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  alert_first_response boolean NOT NULL DEFAULT true,
  alert_resolution boolean NOT NULL DEFAULT true,
  severity_warning boolean NOT NULL DEFAULT true,
  severity_breached boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sla_alert_preferences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sla_alert_preferences FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sla_alert_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sla_alert_preferences TO service_role;

-- Cada usuario so enxerga e escreve a PROPRIA linha. DELETE nao e concedido.
CREATE POLICY "sla_alert_preferences_select_policy"
  ON public.sla_alert_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "sla_alert_preferences_insert_policy"
  ON public.sla_alert_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "sla_alert_preferences_update_policy"
  ON public.sla_alert_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER sla_alert_preferences_set_updated_at
  BEFORE UPDATE ON public.sla_alert_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3) Funcoes de escrita (SECURITY DEFINER) — unica via de INSERT/UPDATE no historico
-- ============================================================================

-- Idempotente: se ja existe alerta ATIVO para (contato, tipo, severidade), devolve o
-- id existente sem criar linha nova nem reordenar/reescrever nada. Autorizacao: precisa
-- ver o contato (ou ser staff); service_role (cron futuro) pode registrar.
CREATE OR REPLACE FUNCTION public.record_sla_alert(
  p_contact_id uuid,
  p_alert_type text,
  p_severity text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_queue_id uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'sessao_nao_autenticada' USING ERRCODE = '42501';
  END IF;

  IF p_alert_type IS NULL OR p_alert_type NOT IN ('first_response', 'resolution') THEN
    RAISE EXCEPTION 'alert_type_invalido' USING ERRCODE = '22023';
  END IF;

  IF p_severity IS NULL OR p_severity NOT IN ('warning', 'breached') THEN
    RAISE EXCEPTION 'severity_invalida' USING ERRCODE = '22023';
  END IF;

  SELECT c.queue_id INTO v_queue_id
    FROM public.contacts c
   WHERE c.id = p_contact_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contato_inexistente' USING ERRCODE = '23503';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT (
       public.is_admin_or_supervisor(auth.uid())
       OR public.is_contact_visible_to_user(p_contact_id, auth.uid())
     ) THEN
    RAISE EXCEPTION 'sem_permissao_para_o_contato' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.sla_alert_events (contact_id, alert_type, severity, queue_id)
  VALUES (p_contact_id, p_alert_type, p_severity, v_queue_id)
  ON CONFLICT (contact_id, alert_type, severity) WHERE resolved_at IS NULL
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT e.id INTO v_id
      FROM public.sla_alert_events e
     WHERE e.contact_id = p_contact_id
       AND e.alert_type = p_alert_type
       AND e.severity = p_severity
       AND e.resolved_at IS NULL;
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_sla_alert(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_sla_alert(uuid, text, text)
  TO authenticated, service_role;

-- Resolver e' ato de STAFF (admin/supervisor). Marca resolved_at/resolved_by na linha
-- ATIVA (auditoria = id de perfil + instante, sem dado pessoal). Nao e idempotente:
-- resolver de novo levanta P0002 (nada a resolver).
CREATE OR REPLACE FUNCTION public.resolve_sla_alert(p_event_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_id uuid;
  v_profile_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sessao_nao_autenticada' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'somente_staff_resolve_alerta' USING ERRCODE = '42501';
  END IF;

  v_profile_id := public.get_profile_id_for_user(auth.uid());

  UPDATE public.sla_alert_events e
     SET resolved_at = now(),
         resolved_by = coalesce(v_profile_id, e.resolved_by)
   WHERE e.id = p_event_id
     AND e.resolved_at IS NULL
  RETURNING e.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'alerta_inexistente_ou_ja_resolvido' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_sla_alert(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_sla_alert(uuid) TO authenticated, service_role;
