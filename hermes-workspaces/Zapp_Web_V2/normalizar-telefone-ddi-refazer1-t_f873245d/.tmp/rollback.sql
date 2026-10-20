CREATE OR REPLACE FUNCTION public.normalize_contact_phone() RETURNS trigger LANGUAGE plpgsql SET search_path = 'public' AS $rb$ BEGIN IF NEW.phone IS NOT NULL THEN NEW.phone := regexp_replace(NEW.phone, '[^0-9]', '', 'g'); END IF; RETURN NEW; END; $rb$;
ALTER TABLE public.contacts DISABLE TRIGGER update_contacts_updated_at;
UPDATE public.contacts AS c SET phone = r.phone_anterior FROM public._rb_normalize_contact_phone_ddi AS r WHERE c.id = r.id;
ALTER TABLE public.contacts ENABLE TRIGGER update_contacts_updated_at;
DROP TABLE IF EXISTS public._rb_normalize_contact_phone_ddi;
REVOKE EXECUTE ON FUNCTION public.normalize_contact_phone() FROM PUBLIC, anon, authenticated;
