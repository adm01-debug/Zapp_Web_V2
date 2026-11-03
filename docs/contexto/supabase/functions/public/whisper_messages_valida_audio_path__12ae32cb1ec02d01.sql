CREATE OR REPLACE FUNCTION public.whisper_messages_valida_audio_path()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage', 'pg_temp'
AS $function$
DECLARE
  v_limite_bytes bigint:=10485760;
  v_limite_segundos numeric:=300;
  v_remetente uuid; v_size bigint; v_mime text; v_duracao numeric;
BEGIN
  IF new.audio_path IS NULL THEN RETURN new; END IF;
  SELECT profile.user_id INTO v_remetente FROM public.profiles AS profile WHERE profile.id=new.sender_id;
  IF v_remetente IS NULL THEN RAISE EXCEPTION 'sussurro com audio exige remetente com perfil' USING ERRCODE='23514'; END IF;
  IF split_part(new.audio_path,'/',1)<>v_remetente::text THEN RAISE EXCEPTION 'audio_path % nao esta na pasta do remetente', new.audio_path USING ERRCODE='23514'; END IF;
  IF auth.uid() IS NOT NULL AND split_part(new.audio_path,'/',1)<>auth.uid()::text THEN RAISE EXCEPTION 'audio_path % nao esta na propria pasta', new.audio_path USING ERRCODE='23514'; END IF;
  IF split_part(new.audio_path,'/',2)<>new.contact_id::text THEN RAISE EXCEPTION 'audio_path % nao e da conversa % do sussurro', new.audio_path, new.contact_id USING ERRCODE='23514'; END IF;
  SELECT (o.metadata->>'size')::bigint, o.metadata->>'mimetype', nullif(o.metadata->>'duration','')::numeric INTO v_size, v_mime, v_duracao FROM storage.objects AS o WHERE o.bucket_id='audio-messages' AND o.name=new.audio_path;
  IF NOT FOUND THEN RAISE EXCEPTION 'audio_path % nao existe no bucket audio-messages', new.audio_path USING ERRCODE='23514'; END IF;
  IF v_size IS NULL OR v_size<=0 THEN RAISE EXCEPTION 'nao consegui medir o tamanho do audio do sussurro' USING ERRCODE='23514'; END IF;
  IF v_size>v_limite_bytes THEN RAISE EXCEPTION 'audio do sussurro com % bytes excede o limite de % bytes', v_size, v_limite_bytes USING ERRCODE='23514'; END IF;
  IF v_mime IS NULL OR v_mime NOT LIKE 'audio/%' THEN RAISE EXCEPTION 'audio do sussurro com tipo % nao e audio', coalesce(v_mime,'(ausente)') USING ERRCODE='23514'; END IF;
  IF v_duracao IS NOT NULL AND v_duracao>v_limite_segundos THEN RAISE EXCEPTION 'audio do sussurro com % s excede o limite de % s', v_duracao, v_limite_segundos USING ERRCODE='23514'; END IF;
  RETURN new;
END;
$function$
