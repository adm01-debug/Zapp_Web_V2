ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS is_lid_legacy BOOLEAN NOT NULL DEFAULT false

CREATE INDEX IF NOT EXISTS idx_contacts_is_lid_legacy
  ON public.contacts(is_lid_legacy)
  WHERE is_lid_legacy = true

UPDATE public.contacts
SET is_lid_legacy = true
WHERE
  (length(phone) >= 15)
  OR (length(phone) = 14 AND phone NOT LIKE '55%')

DO $$
DECLARE
  marked   INTEGER;
  total    INTEGER;
  normal   INTEGER;
BEGIN
  SELECT count(*) INTO marked  FROM contacts WHERE is_lid_legacy = true;
  SELECT count(*) INTO total   FROM contacts;
  SELECT count(*) INTO normal  FROM contacts WHERE is_lid_legacy = false;

  IF marked < 400 OR marked > 700 THEN
    RAISE EXCEPTION 'E31: contagem inesperada de LIDs marcados: %. Esperado 400-700.', marked;
  END IF;

  IF normal + marked <> total THEN
    RAISE EXCEPTION 'E31: inconsistência — normal(%) + lid(%) != total(%)', normal, marked, total;
  END IF;

  RAISE NOTICE 'E31: OK — total=%, lid_legacy=%, normal=%.', total, marked, normal;
END;
$$
