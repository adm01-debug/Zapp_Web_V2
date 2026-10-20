\set ON_ERROR_STOP on
-- simula auth.uid() (JWT) e helpers
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
CREATE FUNCTION public.is_admin_or_supervisor(u uuid) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT false $$;
CREATE FUNCTION public.has_role(u uuid, r text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT false $$;

-- tabela de contato/conversa: whatsapp_connections (espelha producao)
CREATE TABLE public.whatsapp_connections(
  id int primary key, name text, phone_number text, status text, is_default bool,
  qr_code text, instance_id text, created_by uuid);
INSERT INTO public.whatsapp_connections VALUES
 (1,'Comercial','+55999990000','connected',true,'QR-SECRETO','INST-1', gen_random_uuid()),
 (2,'Suporte','+55999991111','connected',false,'QR-2','INST-2', gen_random_uuid());
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin supervisor view connections" ON public.whatsapp_connections FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));
GRANT SELECT, MAINTAIN ON public.whatsapp_connections TO anon;              -- prod: anon=rm
GRANT ALL ON public.whatsapp_connections TO authenticated, service_role;    -- prod: arwdDxtm

-- as 3 views do vetor (security_invoker=true, owner postgres) + grants espelhando prod
CREATE VIEW public.whatsapp_connections_public WITH (security_invoker=true) AS
  SELECT id,name,status,is_default FROM public.whatsapp_connections;
CREATE VIEW public.whatsapp_connections_agent WITH (security_invoker=true) AS
  SELECT id,name,status,phone_number,is_default FROM public.whatsapp_connections;
CREATE VIEW public.whatsapp_connections_safe WITH (security_invoker=true) AS
  SELECT id,name,phone_number,status,is_default,
    CASE WHEN public.has_role(auth.uid(),'admin') THEN qr_code ELSE NULL END AS qr_code,
    CASE WHEN public.has_role(auth.uid(),'admin') THEN instance_id ELSE NULL END AS instance_id
  FROM public.whatsapp_connections;
GRANT ALL ON public.whatsapp_connections_public, public.whatsapp_connections_agent, public.whatsapp_connections_safe TO anon, authenticated, service_role;

-- CONTRAFACTUAL: mesma view SEM security_invoker (default = security definer)
CREATE VIEW public.wa_public_SEM_invoker AS SELECT id,name,status FROM public.whatsapp_connections;
GRANT SELECT ON public.wa_public_SEM_invoker TO anon;

\echo '=== V1) ANON lendo as views (security_invoker=true) ==='
SET ROLE anon;
\echo '-- anon: whatsapp_connections_public'
SELECT * FROM public.whatsapp_connections_public;
\echo '-- anon: whatsapp_connections_agent'
SELECT * FROM public.whatsapp_connections_agent;
\echo '-- anon: whatsapp_connections_safe'
SELECT * FROM public.whatsapp_connections_safe;
\echo '-- anon: tabela base direto'
SELECT * FROM public.whatsapp_connections;
RESET ROLE;
\echo '=== V2) ANON lendo a view SEM security_invoker (contrafactual) ==='
SET ROLE anon; SELECT * FROM public.wa_public_SEM_invoker; RESET ROLE;
\echo '=== V3) AUTHENTICATED SEM VINCULO (nao-admin) lendo as views ==='
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', gen_random_uuid()::text, false);
\echo '-- authenticated nao-admin: public'
SELECT * FROM public.whatsapp_connections_public;
\echo '-- authenticated nao-admin: agent (phone_number)'
SELECT * FROM public.whatsapp_connections_agent;
\echo '-- authenticated nao-admin: safe (qr_code deve vir NULL)'
SELECT * FROM public.whatsapp_connections_safe;
RESET ROLE;
