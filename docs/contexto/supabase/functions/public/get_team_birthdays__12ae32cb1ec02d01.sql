CREATE OR REPLACE FUNCTION public.get_team_birthdays()
 RETURNS TABLE(id uuid, birthday_day integer, birthday_month integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p.id, extract(day FROM p.birthday)::integer, extract(month FROM p.birthday)::integer
  FROM public.profiles p WHERE p.is_active=true AND p.birthday IS NOT NULL;
$function$
