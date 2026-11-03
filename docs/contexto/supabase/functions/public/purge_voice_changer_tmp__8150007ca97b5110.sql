CREATE OR REPLACE FUNCTION public.purge_voice_changer_tmp(p_ttl_hours integer DEFAULT 24, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage', 'pg_temp'
AS $function$
declare
  c_bucket constant text := 'voice-changer-tmp';
  v_enq    integer := 0;
begin
  -- Enfileira na fila unica de expurgo de Storage os objetos temporarios ja
  -- vencidos (mais antigos primeiro). O drenador existente (Edge talkx-storage-purge)
  -- apaga pela API do Storage; aqui NAO se toca storage.objects direto.
  insert into public.talkx_storage_purge_queue (bucket_id, object_name, object_id, reason)
  select o.bucket_id, o.name, o.id, 'voice_changer_temp_ttl'
    from storage.objects o
   where o.bucket_id = c_bucket
     and o.created_at < now() - make_interval(hours => greatest(p_ttl_hours, 1))
   order by o.created_at
   limit greatest(p_limit, 1)
  on conflict (bucket_id, object_name) where processed_at is null do nothing;

  get diagnostics v_enq = row_count;

  return jsonb_build_object(
    'enqueued',  v_enq,
    'bucket',    c_bucket,
    'ttl_hours', greatest(p_ttl_hours, 1)
  );
end;
$function$
