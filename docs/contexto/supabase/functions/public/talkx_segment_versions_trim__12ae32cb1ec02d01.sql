CREATE OR REPLACE FUNCTION public.talkx_segment_versions_trim()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  delete from public.talkx_segment_versions
   where segment_id = new.segment_id
     and version_no not in (
       select version_no
         from public.talkx_segment_versions
        where segment_id = new.segment_id
        order by version_no desc
        limit 20
     );
  return null;
end;
$function$
