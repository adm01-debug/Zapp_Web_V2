CREATE OR REPLACE FUNCTION public.multiplix_audiences_validate_shared_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  invalido text;
BEGIN
  IF NEW.shared_with_roles IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.role_name
    INTO invalido
    FROM unnest(NEW.shared_with_roles) AS s(role_name)
   WHERE NOT EXISTS (
           SELECT 1
             FROM unnest(enum_range(NULL::public.app_role)) AS v(role_enum)
            WHERE v.role_enum::text = s.role_name
         )
   LIMIT 1;

  IF invalido IS NOT NULL THEN
    RAISE EXCEPTION
      'multiplix_audiences.shared_with_roles: papel "%" fora do catalogo app_role. Validos: %',
      invalido,
      (SELECT string_agg(v.role_enum::text, ', ' ORDER BY v.role_enum::text)
         FROM unnest(enum_range(NULL::public.app_role)) AS v(role_enum))
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$
