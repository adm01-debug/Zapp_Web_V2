-- Function to strip non-digit characters from phone
CREATE OR REPLACE FUNCTION public.normalize_contact_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    NEW.phone := regexp_replace(NEW.phone, '[^0-9]', '', 'g');
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger to auto-normalize phone on insert/update
CREATE TRIGGER trg_normalize_contact_phone
BEFORE INSERT OR UPDATE OF phone ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.normalize_contact_phone();