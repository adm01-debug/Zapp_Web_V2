-- contact_consents_lgpd
-- Rollback: dropa a view, as duas RPCs e a tabela contact_consents (histórico de consentimento some).
-- Rollback (SQL executável, na ordem):
--   drop view if exists public.contact_consents_current;
--   drop function if exists public.grant_contact_consent(uuid, text, text, text);
--   drop function if exists public.revoke_contact_consent(uuid, text, text);
--   drop table if exists public.contact_consents;
--
-- LGPD — registro de consentimento por finalidade e canal, com histórico preservado.
--
-- O que entra:
--   * public.contact_consents: tabela APPEND-ONLY. Cada chamada grava UMA linha (evento); o
--     estado atual de (contato, finalidade, canal) é a linha mais recente. Nada é UPDATE/DELETE:
--     o histórico é a própria trilha.
--   * public.contact_consents_current: view do estado atual (DISTINCT ON), security_invoker para
--     herdar a RLS da tabela base.
--   * public.grant_contact_consent / public.revoke_contact_consent: RPCs para staff e para o
--     atendente do contato (mesma regra da policy de contatos: can_edit_contact).
--   * Revogar marketing no WhatsApp inclui o contato na supressão do Talk X pela função
--     EXISTENTE public.talkx_suppress_contact (reuso, sem duplicar a regra de supressão) e marca
--     contacts.consent_status='revoked' — que talkx_audience_query SEMPRE exclui.
--   * Conceder marketing no WhatsApp marca contacts.consent_status='granted'.
--   * Cada evento gera UMA linha em public.audit_logs (sem dado pessoal no details).
--
-- RLS: SELECT conforme a visibilidade do contato (is_contact_visible_to_user). Escrita SÓ pelas
-- RPCs SECURITY DEFINER — a tabela nasce sem policy de INSERT/UPDATE/DELETE.

-- 1) Tabela append-only ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_consents (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  seq            bigint      GENERATED ALWAYS AS IDENTITY NOT NULL, -- ordem de inserção (estado atual deterministico)
  contact_id     uuid        NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  finalidade     text        NOT NULL,
  canal          text        NOT NULL,
  concedido      boolean     NOT NULL,
  base_legal     text,
  registrado_por uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  registrado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_consents_finalidade_check
    CHECK (finalidade IN ('marketing', 'compartilhamento', 'perfilamento', 'atendimento')),
  CONSTRAINT contact_consents_canal_check
    CHECK (canal IN ('whatsapp', 'email')),
  CONSTRAINT contact_consents_base_legal_check
    CHECK (base_legal IS NULL OR base_legal IN
           ('consentimento', 'interesse_legitimo', 'contrato', 'obrigacao_legal')),
  -- Invariante de forma: conceder EXIGE base legal; revogar não carrega base legal.
  CONSTRAINT contact_consents_shape_check CHECK (
    (concedido AND base_legal IS NOT NULL)
    OR ((NOT concedido) AND base_legal IS NULL)
  )
);

-- Reaplicação idempotente: em base onde a tabela já existe, o CREATE TABLE IF NOT EXISTS acima
-- não acrescenta a coluna nova; este ALTER garante o mesmo estado final nos dois caminhos.
ALTER TABLE public.contact_consents
  ADD COLUMN IF NOT EXISTS seq bigint GENERATED ALWAYS AS IDENTITY;

-- RLS IMEDIATAMENTE depois do CREATE TABLE: se algo abortar entre os dois passos, a tabela
-- já está com RLS ligada e zero policies (nega tudo a qualquer non-owner).
ALTER TABLE public.contact_consents ENABLE ROW LEVEL SECURITY;

-- O default do schema concede DML a anon/authenticated/service_role em tabela nova; sem estes
-- REVOKEs a trilha nasceria com escrita direta pela API. service_role também entra: quem escreve
-- é a RPC SECURITY DEFINER (dona postgres), não o papel da API.
REVOKE ALL ON TABLE public.contact_consents FROM PUBLIC, anon, authenticated, service_role;

-- authenticated precisa de SELECT para a policy ser avaliada. Sem INSERT/UPDATE/DELETE: a
-- trilha é append-only e o único caminho de escrita são as RPCs abaixo.
GRANT SELECT ON TABLE public.contact_consents TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_contact_consents_contact_finalidade_canal
  ON public.contact_consents (contact_id, finalidade, canal, seq DESC);

-- 2) Policy de leitura: quem vê o contato vê o consentimento dele ------------------------
DROP POLICY IF EXISTS "contact_consents_select_visible" ON public.contact_consents;
CREATE POLICY "contact_consents_select_visible" ON public.contact_consents
  FOR SELECT
  TO authenticated
  USING (public.is_contact_visible_to_user(contact_id, auth.uid()));

-- 3) View do estado atual (security_invoker herda a RLS da tabela base) ------------------
CREATE OR REPLACE VIEW public.contact_consents_current
  WITH (security_invoker = true)
AS
  SELECT DISTINCT ON (c.contact_id, c.finalidade, c.canal)
    c.id,
    c.contact_id,
    c.finalidade,
    c.canal,
    c.concedido,
    c.base_legal,
    c.registrado_por,
    c.registrado_em
  FROM public.contact_consents AS c
  ORDER BY c.contact_id, c.finalidade, c.canal, c.seq DESC;

REVOKE ALL ON TABLE public.contact_consents_current FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.contact_consents_current TO authenticated, service_role;

-- 4) RPC de concessão -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_contact_consent(
  p_contact_id uuid,
  p_finalidade text,
  p_canal text,
  p_base_legal text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_contact public.contacts;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF p_finalidade IS NULL OR p_finalidade NOT IN
     ('marketing', 'compartilhamento', 'perfilamento', 'atendimento') THEN
    RAISE EXCEPTION 'invalid_consent_purpose' USING ERRCODE = '22023';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('whatsapp', 'email') THEN
    RAISE EXCEPTION 'invalid_consent_channel' USING ERRCODE = '22023';
  END IF;
  IF p_base_legal IS NULL OR p_base_legal NOT IN
     ('consentimento', 'interesse_legitimo', 'contrato', 'obrigacao_legal') THEN
    RAISE EXCEPTION 'invalid_legal_basis' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_contact FROM public.contacts WHERE id = p_contact_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_contact.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'contact_deleted' USING ERRCODE = '55000';
  END IF;
  IF NOT public.can_edit_contact(v_contact.assigned_to, v_contact.queue_id) THEN
    RAISE EXCEPTION 'consent_forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.contact_consents
    (contact_id, finalidade, canal, concedido, base_legal, registrado_por)
  VALUES
    (p_contact_id, p_finalidade, p_canal, true, p_base_legal,
     public.get_profile_id_for_user(auth.uid()))
  RETURNING id INTO v_id;

  -- Talk X: só o eixo que a audiência consulta muda consent_status (marketing/WhatsApp).
  IF p_finalidade = 'marketing' AND p_canal = 'whatsapp' THEN
    UPDATE public.contacts
       SET consent_status = 'granted'
     WHERE id = p_contact_id
       AND consent_status IS DISTINCT FROM 'granted';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'grant_contact_consent',
    'contact',
    p_contact_id,
    jsonb_build_object('finalidade', p_finalidade, 'canal', p_canal, 'base_legal', p_base_legal)
  );

  RETURN v_id;
END;
$fn$;

-- 5) RPC de revogação -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_contact_consent(
  p_contact_id uuid,
  p_finalidade text,
  p_canal text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_contact public.contacts;
  v_id uuid;
  v_prev_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF p_finalidade IS NULL OR p_finalidade NOT IN
     ('marketing', 'compartilhamento', 'perfilamento', 'atendimento') THEN
    RAISE EXCEPTION 'invalid_consent_purpose' USING ERRCODE = '22023';
  END IF;
  IF p_canal IS NULL OR p_canal NOT IN ('whatsapp', 'email') THEN
    RAISE EXCEPTION 'invalid_consent_channel' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_contact FROM public.contacts WHERE id = p_contact_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_contact.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'contact_deleted' USING ERRCODE = '55000';
  END IF;
  IF NOT public.can_edit_contact(v_contact.assigned_to, v_contact.queue_id) THEN
    RAISE EXCEPTION 'consent_forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.contact_consents
    (contact_id, finalidade, canal, concedido, base_legal, registrado_por)
  VALUES
    (p_contact_id, p_finalidade, p_canal, false, NULL,
     public.get_profile_id_for_user(auth.uid()))
  RETURNING id INTO v_id;

  IF p_finalidade = 'marketing' AND p_canal = 'whatsapp' THEN
    UPDATE public.contacts
       SET consent_status = 'revoked'
     WHERE id = p_contact_id
       AND consent_status IS DISTINCT FROM 'revoked';

    -- Reuso da supressão do Talk X (NÃO reimplementamos a regra de supressão). A função exige
    -- auth.role()='service_role'; elevamos a claim só dentro desta transação e devolvemos depois.
    v_prev_role := current_setting('request.jwt.claim.role', true);
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    PERFORM public.talkx_suppress_contact(
      p_contact_id        => p_contact_id,
      p_phone             => v_contact.phone,
      p_reason            => 'Revogação de consentimento de marketing (LGPD)',
      p_reason_code       => 'lgpd'::public.talkx_blacklist_reason,
      p_origin            => 'manual',
      p_source_message_id => NULL
    );
    PERFORM set_config('request.jwt.claim.role', coalesce(v_prev_role, ''), true);
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'revoke_contact_consent',
    'contact',
    p_contact_id,
    jsonb_build_object('finalidade', p_finalidade, 'canal', p_canal)
  );

  RETURN v_id;
END;
$fn$;

-- 6) ACL das RPCs: negar o default PUBLIC, liberar só o papel necessário -----------------
REVOKE ALL ON FUNCTION public.grant_contact_consent(uuid, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_contact_consent(uuid, text, text, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.revoke_contact_consent(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_contact_consent(uuid, text, text)
  TO authenticated, service_role;

-- 7) Comentários de contrato -------------------------------------------------------------
COMMENT ON TABLE public.contact_consents IS
  'LGPD: histórico append-only de consentimento por finalidade e canal. Estado atual em contact_consents_current. Escrita só pelas RPCs grant_contact_consent/revoke_contact_consent.';
COMMENT ON VIEW public.contact_consents_current IS
  'LGPD: estado atual do consentimento (linha mais recente por contato/finalidade/canal). security_invoker — herda a RLS de contact_consents.';
COMMENT ON FUNCTION public.grant_contact_consent(uuid, text, text, text) IS
  'LGPD: registra consentimento (staff ou atendente do contato). marketing+whatsapp marca contacts.consent_status=granted. Audita em audit_logs.';
COMMENT ON FUNCTION public.revoke_contact_consent(uuid, text, text) IS
  'LGPD: registra revogação (staff ou atendente do contato). marketing+whatsapp marca contacts.consent_status=revoked e inclui o contato na supressão do Talk X (talkx_suppress_contact). Audita em audit_logs.';
