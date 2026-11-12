CREATE TABLE public.talkx_suppression_reasons (
  code        text        PRIMARY KEY CHECK (code = lower(code) AND code ~ '^[a-z_]+$'),
  label       text        NOT NULL,
  tone        text        NOT NULL DEFAULT 'informativo' CHECK (tone IN ('informativo','alerta','crítico')),
  is_system   boolean     NOT NULL DEFAULT false,
  active      boolean     NOT NULL DEFAULT true,
  sort_order  int         NOT NULL DEFAULT 100,
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
)

CREATE OR REPLACE FUNCTION public.talkx_suppression_reasons_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_system AND current_user IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'talkx_suppression_reasons: motivo do sistema só nasce por migration'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.code IS DISTINCT FROM NEW.code THEN
    RAISE EXCEPTION 'talkx_suppression_reasons: code imutável após criação'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.is_system IS DISTINCT FROM NEW.is_system THEN
    RAISE EXCEPTION 'talkx_suppression_reasons: is_system imutável após criação'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.is_system AND OLD.label IS DISTINCT FROM NEW.label THEN
    RAISE EXCEPTION 'talkx_suppression_reasons: label de motivo do sistema é imutável'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.is_system AND NOT NEW.active THEN
    RAISE EXCEPTION 'talkx_suppression_reasons: motivo do sistema não pode ser desativado'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$

REVOKE ALL ON FUNCTION public.talkx_suppression_reasons_guard() FROM PUBLIC, anon, authenticated

CREATE TRIGGER talkx_suppression_reasons_guard_trigger
  BEFORE INSERT OR UPDATE ON public.talkx_suppression_reasons
  FOR EACH ROW EXECUTE FUNCTION public.talkx_suppression_reasons_guard()

INSERT INTO public.talkx_suppression_reasons (code, label, tone, is_system, sort_order) VALUES
  ('opt_out',                 'Opt-out solicitado',       'informativo', true, 10),
  ('invalid_number',          'Número inválido',          'alerta',      true, 20),
  ('manual',                  'Bloqueio manual',          'alerta',      true, 30),
  ('lgpd',                    'LGPD',                     'crítico',     true, 40),
  ('no_commercial_permission','Sem permissão comercial',  'alerta',      true, 50),
  ('bounce',                  'Mensagem devolvida',       'alerta',      true, 60)

ALTER TABLE public.talkx_suppression_reasons ENABLE ROW LEVEL SECURITY

REVOKE ALL ON public.talkx_suppression_reasons FROM PUBLIC, anon, authenticated

GRANT SELECT ON public.talkx_suppression_reasons TO authenticated

GRANT INSERT (code, label, tone, active, sort_order, created_by)
  ON public.talkx_suppression_reasons TO authenticated

GRANT UPDATE (label, tone, active, sort_order)
  ON public.talkx_suppression_reasons TO authenticated

GRANT ALL ON public.talkx_suppression_reasons TO service_role

CREATE POLICY "talkx_suppression_reasons_read"
  ON public.talkx_suppression_reasons FOR SELECT TO authenticated USING (true)

CREATE POLICY "talkx_suppression_reasons_write"
  ON public.talkx_suppression_reasons FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()))

CREATE POLICY "talkx_suppression_reasons_update"
  ON public.talkx_suppression_reasons FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()))

DROP VIEW IF EXISTS public.talkx_campaign_optouts

DROP FUNCTION IF EXISTS public.talkx_suppress_contact(
  uuid, text, text, public.talkx_blacklist_reason, text, uuid, uuid
)

ALTER TABLE public.talkx_blacklist
  ALTER COLUMN reason_code TYPE text USING reason_code::text

CREATE VIEW public.talkx_campaign_optouts
WITH (security_invoker = true)
AS
SELECT
  b.campaign_id,
  count(*)::bigint AS optout_count,
  count(*) FILTER (WHERE b.origin = 'auto_optout')::bigint AS auto_optout_count,
  max(b.created_at) AS last_optout_at
FROM public.talkx_blacklist AS b
WHERE b.campaign_id IS NOT NULL
  AND b.reason_code = 'opt_out'
GROUP BY b.campaign_id

COMMENT ON VIEW public.talkx_campaign_optouts IS
  'Talk X (X029/X070): opt-outs por campanha (reason_code opt_out). security_invoker=on: a RLS de talkx_blacklist de quem consulta continua valendo.'

REVOKE ALL ON public.talkx_campaign_optouts FROM PUBLIC, anon

GRANT SELECT ON public.talkx_campaign_optouts TO authenticated, service_role

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.talkx_campaign_optouts FROM authenticated

ALTER TABLE public.talkx_blacklist
  ADD CONSTRAINT talkx_blacklist_reason_code_fk
  FOREIGN KEY (reason_code) REFERENCES public.talkx_suppression_reasons(code)
  ON UPDATE CASCADE ON DELETE RESTRICT

CREATE OR REPLACE FUNCTION public.talkx_blacklist_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Normaliza telefone: so digitos, formato 10-15 digitos; invalido vira NULL
  IF NEW.phone IS NOT NULL THEN
    NEW.phone := regexp_replace(NEW.phone, '[^0-9]', '', 'g');
    IF NEW.phone !~ '^[0-9]{10,15}$' THEN
      NEW.phone := NULL;
    END IF;
  END IF;

  -- Preenche reason_code a partir de origin quando nulo (mapa do passo 7 da X070:
  -- optout/auto_optout -> opt_out, list -> manual, manual/lgpd -> eles mesmos;
  -- system fica NULL de proposito). So usa motivo ativo do catalogo.
  IF NEW.reason_code IS NULL AND NEW.origin IS NOT NULL THEN
    SELECT r.code INTO NEW.reason_code
      FROM public.talkx_suppression_reasons AS r
     WHERE r.active
       AND r.code = CASE NEW.origin
                      WHEN 'optout' THEN 'opt_out'
                      WHEN 'auto_optout' THEN 'opt_out'
                      WHEN 'list' THEN 'manual'
                      WHEN 'system' THEN NULL
                      ELSE NEW.origin
                    END;
  END IF;

  -- Forca blocked_by para o perfil do chamador no INSERT (sobrescreve o
  -- valor enviado pelo cliente); com auth.uid() nulo mantem o informado.
  -- No UPDATE o blocked_by original e preservado quando autenticado
  -- (N-107: a trilha de quem bloqueou nao muda depois do INSERT).
  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL THEN
    NEW.blocked_by := (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1);
  ELSIF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL THEN
    NEW.blocked_by := OLD.blocked_by;
  END IF;

  -- Forca removed_by para o perfil do chamador SOMENTE na transicao
  -- NULL -> preenchido de removed_at (o ato de remover); com auth.uid()
  -- nulo mantem o informado (service_role/backend, ex. talkx_suppress_contact).
  -- Linha ja removida que continua removida preserva a trilha original
  -- (removed_by e removed_at), para que editar removal_reason ou outro
  -- campo nao troque o autor da remocao.
  IF NEW.removed_at IS NOT NULL AND auth.uid() IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.removed_at IS NULL) THEN
    NEW.removed_by := (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1);
  ELSIF TG_OP = 'UPDATE' AND OLD.removed_at IS NOT NULL AND NEW.removed_at IS NOT NULL THEN
    NEW.removed_by := OLD.removed_by;
    NEW.removed_at := OLD.removed_at;
  END IF;

  RETURN NEW;
END;
$$

REVOKE ALL ON FUNCTION public.talkx_blacklist_audit_trigger() FROM PUBLIC, anon, authenticated

CREATE OR REPLACE FUNCTION public.talkx_blacklist_reason_active_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.reason_code IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.reason_code IS NOT DISTINCT FROM OLD.reason_code THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.talkx_suppression_reasons AS r
     WHERE r.code = NEW.reason_code AND NOT r.active
  ) THEN
    RAISE EXCEPTION 'talkx_suppression_reason_inactive'
      USING ERRCODE = '23514',
            DETAIL = format('reason_code %s está desativado no catálogo', NEW.reason_code);
  END IF;
  RETURN NEW;
END;
$$

REVOKE ALL ON FUNCTION public.talkx_blacklist_reason_active_guard() FROM PUBLIC, anon, authenticated

DROP TRIGGER IF EXISTS trg_talkx_blacklist_reason_active ON public.talkx_blacklist

CREATE TRIGGER trg_talkx_blacklist_reason_active
  BEFORE INSERT OR UPDATE OF reason_code ON public.talkx_blacklist
  FOR EACH ROW EXECUTE FUNCTION public.talkx_blacklist_reason_active_guard()

UPDATE public.talkx_blacklist
SET reason_code = CASE origin
  WHEN 'optout' THEN 'opt_out'
  WHEN 'auto_optout' THEN 'opt_out'
  WHEN 'manual' THEN 'manual'
  WHEN 'lgpd' THEN 'lgpd'
  WHEN 'list' THEN 'manual'
END
WHERE reason_code IS NULL
  AND origin IN ('optout', 'auto_optout', 'manual', 'lgpd', 'list')

CREATE FUNCTION public.talkx_suppress_contact(
  p_contact_id uuid,
  p_phone text,
  p_reason text,
  p_reason_code text,
  p_origin text,
  p_source_message_id uuid,
  p_campaign_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_campaign_id uuid := p_campaign_id;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF v_campaign_id IS NULL AND p_origin = 'auto_optout' AND p_contact_id IS NOT NULL THEN
    SELECT r.campaign_id INTO v_campaign_id
      FROM public.talkx_recipients AS r
     WHERE r.contact_id = p_contact_id AND r.sent_at IS NOT NULL
     ORDER BY r.sent_at DESC, r.id DESC LIMIT 1;
  END IF;
  UPDATE public.talkx_blacklist AS b
     SET removed_at = statement_timestamp()
   WHERE b.removed_at IS NULL AND b.expires_at IS NOT NULL
     AND b.expires_at <= statement_timestamp()
     AND ((p_contact_id IS NOT NULL AND b.contact_id = p_contact_id)
       OR (p_phone IS NOT NULL AND b.phone = p_phone));
  INSERT INTO public.talkx_blacklist
    (contact_id, phone, reason, reason_code, origin, source_message_id, campaign_id)
  VALUES
    (p_contact_id, p_phone, p_reason, p_reason_code, p_origin, p_source_message_id, v_campaign_id)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  IF p_origin = 'auto_optout' AND p_contact_id IS NOT NULL THEN
    UPDATE public.contacts AS c
       SET consent_status = 'revoked', updated_at = statement_timestamp()
     WHERE c.id = p_contact_id AND c.consent_status IS DISTINCT FROM 'revoked';
  END IF;
  RETURN v_id;
END;
$function$

REVOKE ALL ON FUNCTION public.talkx_suppress_contact(
  uuid, text, text, text, text, uuid, uuid
) FROM PUBLIC, anon, authenticated

GRANT EXECUTE ON FUNCTION public.talkx_suppress_contact(
  uuid, text, text, text, text, uuid, uuid
) TO service_role

COMMENT ON FUNCTION public.talkx_suppress_contact(
  uuid, text, text, text, text, uuid, uuid
) IS
  'Talk X (X029 + X032 + X070): supressao idempotente nos eixos contact_id e phone. reason_code e texto validado pela FK em talkx_suppression_reasons (motivo inativo recusado). Origem auto_optout marca o contato como consent_status=revoked (N10).'

DROP TYPE IF EXISTS public.talkx_blacklist_reason
