CREATE TABLE public.contact_identity_map (lid text PRIMARY KEY, jid text NOT NULL, first_seen timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now(), source text)

CREATE INDEX idx_contact_identity_map_jid ON public.contact_identity_map (jid)

ALTER TABLE public.contact_identity_map ENABLE ROW LEVEL SECURITY

CREATE POLICY service_role_full_access ON public.contact_identity_map FOR ALL TO service_role USING (true) WITH CHECK (true)

CREATE POLICY supervisor_read ON public.contact_identity_map FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()))
