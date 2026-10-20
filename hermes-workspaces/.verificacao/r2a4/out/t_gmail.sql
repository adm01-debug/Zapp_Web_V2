\set ON_ERROR_STOP on
CREATE TABLE public.gmail_accounts(id int primary key, user_id uuid, email_address text, is_active bool);
INSERT INTO public.gmail_accounts VALUES
 (1,'11111111-1111-1111-1111-111111111111','alice@empresa.com',true),
 (2,'22222222-2222-2222-2222-222222222222','bob@empresa.com',true);
ALTER TABLE public.gmail_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own gmail accounts" ON public.gmail_accounts FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT, MAINTAIN ON public.gmail_accounts TO anon;
GRANT ALL ON public.gmail_accounts TO authenticated, service_role;
CREATE VIEW public.gmail_accounts_safe WITH (security_invoker=true) AS
  SELECT id,user_id,email_address,is_active FROM public.gmail_accounts;
GRANT ALL ON public.gmail_accounts_safe TO anon, authenticated, service_role;

\echo '=== G1) anon via gmail_accounts_safe ==='
SET ROLE anon; SELECT * FROM public.gmail_accounts_safe; RESET ROLE;
\echo '=== G2) authenticated DONO (uid=alice) via view ==='
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) IS NOT NULL AS setado;
SELECT * FROM public.gmail_accounts_safe;
\echo '=== G3) authenticated OUTRO usuario (uid=bob) via view ==='
SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false) IS NOT NULL AS setado;
SELECT * FROM public.gmail_accounts_safe;
RESET ROLE;
