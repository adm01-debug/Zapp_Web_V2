CREATE OR REPLACE FUNCTION public.enforce_department_invitations_code_format_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.code is null or new.code !~ '^[A-Z0-9]{8}$' then
    raise exception 'department_invitations_code_format'
      using errcode = '23514',
            constraint = 'department_invitations_code_format',
            table = 'department_invitations',
            schema = 'public';
  end if;

  return new;
end;
$function$
