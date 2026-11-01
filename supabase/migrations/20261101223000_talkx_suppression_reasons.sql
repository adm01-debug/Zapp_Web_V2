-- X070: catálogo de motivos de supressão e FK de talkx_blacklist.reason_code

-- 1. Tabela de motivos
CREATE TABLE talkx_suppression_reasons (
  code        text        PRIMARY KEY CHECK (code = lower(code) AND code ~ '^[a-z_]+$'),
  label       text        NOT NULL,
  tone        text        NOT NULL DEFAULT 'informativo' CHECK (tone IN ('informativo','alerta','crítico')),
  is_system   boolean     NOT NULL DEFAULT false,
  active      boolean     NOT NULL DEFAULT true,
  sort_order  int         NOT NULL DEFAULT 100,
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Trigger: impede alterar code e desativar motivo do sistema
CREATE OR REPLACE FUNCTION talkx_suppression_reasons_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.code IS DISTINCT FROM NEW.code THEN
    RAISE EXCEPTION 'talkx_suppression_reasons: code imutável após criação';
  END IF;
  IF OLD.is_system AND NOT NEW.active THEN
    RAISE EXCEPTION 'talkx_suppression_reasons: motivo do sistema não pode ser desativado';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER talkx_suppression_reasons_guard_trigger
  BEFORE UPDATE ON talkx_suppression_reasons
  FOR EACH ROW EXECUTE FUNCTION talkx_suppression_reasons_guard();

-- 3. Seed dos 6 motivos do sistema (codes = valores do enum original)
INSERT INTO talkx_suppression_reasons (code, label, tone, is_system, sort_order) VALUES
  ('opt_out',                 'Opt-out solicitado',       'informativo', true, 10),
  ('invalid_number',          'Número inválido',          'alerta',      true, 20),
  ('manual',                  'Bloqueio manual',          'alerta',      true, 30),
  ('lgpd',                    'LGPD',                     'crítico',     true, 40),
  ('no_commercial_permission','Sem permissão comercial',  'alerta',      true, 50),
  ('bounce',                  'Mensagem devolvida',       'alerta',      true, 60);

-- 4. RLS
ALTER TABLE talkx_suppression_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "talkx_suppression_reasons_read"
  ON talkx_suppression_reasons FOR SELECT TO authenticated USING (true);

CREATE POLICY "talkx_suppression_reasons_write"
  ON talkx_suppression_reasons FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_supervisor(auth.uid()));

CREATE POLICY "talkx_suppression_reasons_update"
  ON talkx_suppression_reasons FOR UPDATE TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));

-- 4.5. Descartar view que depende de reason_code como enum
DROP VIEW IF EXISTS talkx_campaign_optouts;

-- 5. Converter reason_code de enum para text
ALTER TABLE talkx_blacklist
  ALTER COLUMN reason_code TYPE text USING reason_code::text;

-- 5.1. Recriar view sem dependência de enum
CREATE OR REPLACE VIEW talkx_campaign_optouts AS
SELECT campaign_id,
    count(*) AS optout_count,
    count(*) FILTER (WHERE origin = 'auto_optout') AS auto_optout_count,
    max(created_at) AS last_optout_at
  FROM talkx_blacklist b
 WHERE campaign_id IS NOT NULL
   AND reason_code = 'opt_out'
 GROUP BY campaign_id;

-- 6. Adicionar FK (todos os valores existentes já estão na tabela de motivos)
ALTER TABLE talkx_blacklist
  ADD CONSTRAINT talkx_blacklist_reason_code_fk
  FOREIGN KEY (reason_code) REFERENCES talkx_suppression_reasons(code)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- 7. Preencher nulos a partir de origin
UPDATE talkx_blacklist
SET reason_code = CASE
  WHEN origin IN ('opt_out','OPT_OUT') THEN 'opt_out'
  WHEN origin IN ('invalid','INVALID','invalid_number') THEN 'invalid_number'
  WHEN origin IN ('manual','MANUAL','manual_block') THEN 'manual'
  WHEN origin IN ('lgpd','LGPD') THEN 'lgpd'
  WHEN origin IN ('bounced','BOUNCED','bounce') THEN 'bounce'
  ELSE 'manual'
END
WHERE reason_code IS NULL AND origin IS NOT NULL;

-- 8. Recriar talkx_suppress_contact sem dependência do enum
CREATE OR REPLACE FUNCTION public.talkx_suppress_contact(
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

  -- X029: sem campanha informada, o opt-out automatico herda a campanha do envio
  -- mais recente ao contato.
  IF v_campaign_id IS NULL
     AND p_origin = 'auto_optout'
     AND p_contact_id IS NOT NULL THEN
    SELECT r.campaign_id
      INTO v_campaign_id
      FROM public.talkx_recipients AS r
     WHERE r.contact_id = p_contact_id
       AND r.sent_at IS NOT NULL
     ORDER BY r.sent_at DESC, r.id DESC
     LIMIT 1;
  END IF;

  -- X029: encerra supressao expirada antes de inserir nova.
  UPDATE public.talkx_blacklist AS b
     SET removed_at = statement_timestamp()
   WHERE b.removed_at IS NULL
     AND b.expires_at IS NOT NULL
     AND b.expires_at <= statement_timestamp()
     AND (
       (p_contact_id IS NOT NULL AND b.contact_id = p_contact_id)
       OR (p_phone IS NOT NULL AND b.phone = p_phone)
     );

  INSERT INTO public.talkx_blacklist
    (contact_id, phone, reason, reason_code, origin, source_message_id, campaign_id)
  VALUES
    (p_contact_id, p_phone, p_reason, p_reason_code, p_origin, p_source_message_id, v_campaign_id)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  -- X032 (N10): opt-out automatico marca o contato como 'revoked'.
  IF p_origin = 'auto_optout' AND p_contact_id IS NOT NULL THEN
    UPDATE public.contacts AS c
       SET consent_status = 'revoked',
           updated_at = statement_timestamp()
     WHERE c.id = p_contact_id
       AND c.consent_status IS DISTINCT FROM 'revoked';
  END IF;

  RETURN v_id;
END;
$function$;

-- 9. Dropar o enum (sem dependências remanescentes)
DROP TYPE IF EXISTS talkx_blacklist_reason;
