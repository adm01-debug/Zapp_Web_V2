CREATE OR REPLACE FUNCTION public.stamp_message_transcribed_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.transcription_status='completed' AND NEW.transcribed_at IS NULL THEN NEW.transcribed_at:=now(); END IF;
  RETURN NEW;
END;
$function$
