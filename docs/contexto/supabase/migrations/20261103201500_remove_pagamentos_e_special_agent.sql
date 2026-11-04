DROP FUNCTION IF EXISTS public.talkx_attribute_purchases(timestamp with time zone)

DROP FUNCTION IF EXISTS public.talkx_recompute_purchase_metrics(integer)

DROP POLICY IF EXISTS "Agents can delete purchases for assigned contacts" ON public.contact_purchases

DROP POLICY IF EXISTS "Agents can insert purchases for assigned contacts" ON public.contact_purchases

DROP POLICY IF EXISTS "Agents can update purchases for assigned contacts" ON public.contact_purchases

DROP POLICY IF EXISTS "Agents can view purchases for assigned contacts" ON public.contact_purchases

DROP POLICY IF EXISTS "Admins can delete payment links" ON public.payment_links

DROP POLICY IF EXISTS "Authenticated can insert payment links" ON public.payment_links

DROP POLICY IF EXISTS "Users can update own payment links" ON public.payment_links

DROP POLICY IF EXISTS "Users can view own payment links" ON public.payment_links

DROP TABLE IF EXISTS public.contact_purchases CASCADE

DROP TABLE IF EXISTS public.payment_links CASCADE

DROP FUNCTION IF EXISTS public.guard_contact_purchase_identity()

CREATE OR REPLACE FUNCTION public.effective_role(_user_id uuid) RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$ SELECT CASE WHEN bool_or(role = 'admin'::app_role) THEN 'admin'::app_role WHEN bool_or(role = 'supervisor'::app_role) THEN 'supervisor'::app_role ELSE 'agent'::app_role END FROM public.user_roles WHERE user_id = _user_id $function$

CREATE OR REPLACE FUNCTION public.sync_profile_role_from_user_roles() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$ DECLARE v_user_id uuid; v_new_role app_role; BEGIN v_user_id := COALESCE(NEW.user_id, OLD.user_id); SELECT CASE WHEN bool_or(role = 'admin'::app_role) THEN 'admin'::app_role WHEN bool_or(role = 'supervisor'::app_role) THEN 'supervisor'::app_role ELSE 'agent'::app_role END INTO v_new_role FROM public.user_roles WHERE user_id = v_user_id; IF v_new_role IS NOT NULL THEN PERFORM set_config('app.internal_role_sync', 'true', true); UPDATE public.profiles SET role = v_new_role::text WHERE user_id = v_user_id AND role IS DISTINCT FROM v_new_role::text; PERFORM set_config('app.internal_role_sync', 'false', true); END IF; RETURN NULL; END; $function$

CREATE OR REPLACE FUNCTION public.get_visible_agent_ids(_user_id uuid) RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$ SELECT profile.id FROM public.profiles AS profile WHERE _user_id = auth.uid() AND profile.user_id = _user_id UNION SELECT visibility.can_see_agent_id FROM public.agent_visibility_grants AS visibility JOIN public.profiles AS viewer ON viewer.id = visibility.agent_id WHERE _user_id = auth.uid() AND viewer.user_id = _user_id AND EXISTS ( SELECT 1 FROM public.user_roles AS role_assignment WHERE role_assignment.user_id = _user_id AND role_assignment.role = 'agent' ) $function$

REVOKE ALL ON FUNCTION public.get_visible_agent_ids(uuid) FROM PUBLIC, anon

GRANT EXECUTE ON FUNCTION public.get_visible_agent_ids(uuid) TO authenticated, service_role

DROP POLICY IF EXISTS "Special agents can view own grants" ON public.agent_visibility_grants

DROP POLICY IF EXISTS "Agents can view own grants" ON public.agent_visibility_grants

CREATE POLICY "Agents can view own grants" ON public.agent_visibility_grants FOR SELECT TO authenticated USING ( has_role(auth.uid(), 'agent'::app_role) AND agent_id IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()) )

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['admin'::text, 'supervisor'::text, 'agent'::text]))

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_no_special_agent

ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_no_special_agent CHECK (role <> 'special_agent'::app_role)
