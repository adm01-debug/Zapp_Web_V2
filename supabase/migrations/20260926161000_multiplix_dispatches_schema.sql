-- 20260926161000_multiplix_dispatches_schema
-- Fase 2 do Multiplix (composer de campanha). Cria multiplix_dispatches e
-- multiplix_recipients seguindo ADR-007 D2: ritmo/janela/teto reaproveitam os
-- mesmos parametros de talkx_campaigns (copiados na confirmacao do composer),
-- nao uma segunda tabela de politica. company_id em multiplix_recipients
-- referencia public.companies do banco Singu (pgxfvjmuubtbowutlide) — sem FK,
-- pois e um banco externo (mesmo padrao ja usado por crm-integration).
-- destino_e164/company_name_snapshot sao capturados na confirmacao do disparo
-- via edge multiplix-audience (resolve), para nao depender do Singu estar no
-- ar no momento do envio real.

CREATE TABLE public.multiplix_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  message_template text NOT NULL,
  media_url text,
  media_type text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'paused', 'completed', 'failed', 'cancelled')),
  audience_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  typing_delay_min integer NOT NULL DEFAULT 1500,
  typing_delay_max integer NOT NULL DEFAULT 4000,
  send_interval_min integer NOT NULL DEFAULT 5000,
  send_interval_max integer NOT NULL DEFAULT 15000,
  send_window_start time without time zone,
  send_window_end time without time zone,
  business_hours_only boolean NOT NULL DEFAULT false,
  schedule_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  speed_profile text NOT NULL DEFAULT 'moderate',
  whatsapp_connection_id uuid,
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  scheduled_at timestamp with time zone,
  started_at timestamp with time zone,
  paused_at timestamp with time zone,
  pause_reason text,
  completed_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.multiplix_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.multiplix_dispatches(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  company_name_snapshot text,
  destino_e164 text,
  destino_origem text,
  personalized_message text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'skipped')),
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  error_message text,
  delivery_claim_token uuid,
  delivery_claimed_at timestamp with time zone,
  delivery_claim_expires_at timestamp with time zone,
  delivery_claimed_by text,
  delivery_attempt_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_multiplix_recipients_dispatch_id ON public.multiplix_recipients(dispatch_id);
CREATE INDEX idx_multiplix_recipients_pending ON public.multiplix_recipients(dispatch_id) WHERE status = 'pending';
CREATE INDEX idx_multiplix_dispatches_status ON public.multiplix_dispatches(status);
CREATE INDEX idx_multiplix_dispatches_created_by ON public.multiplix_dispatches(created_by);

CREATE TRIGGER update_multiplix_dispatches_updated_at
  BEFORE UPDATE ON public.multiplix_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_multiplix_recipients_updated_at
  BEFORE UPDATE ON public.multiplix_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.multiplix_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.multiplix_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all dispatches" ON public.multiplix_dispatches
  FOR SELECT USING (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Users can view own dispatches" ON public.multiplix_dispatches
  FOR SELECT USING (
    created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "Users can create dispatches" ON public.multiplix_dispatches
  FOR INSERT WITH CHECK (
    created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "Users can update own dispatches" ON public.multiplix_dispatches
  FOR UPDATE USING (
    created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "Users can delete own draft dispatches" ON public.multiplix_dispatches
  FOR DELETE USING (
    created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    AND status = 'draft'
  );

CREATE POLICY "Users can view recipients of accessible dispatches" ON public.multiplix_recipients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND (
          md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
          OR public.is_admin_or_supervisor(auth.uid())
        )
    )
  );

CREATE POLICY "Users can insert recipients into own dispatches" ON public.multiplix_recipients
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    )
  );

CREATE POLICY "Users can update recipients of own dispatches" ON public.multiplix_recipients
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    )
  );

CREATE POLICY "Users can delete recipients of own draft dispatches" ON public.multiplix_recipients
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.multiplix_dispatches md
      WHERE md.id = multiplix_recipients.dispatch_id
        AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        AND md.status = 'draft'
    )
  );
