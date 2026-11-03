CREATE OR REPLACE FUNCTION public.fn_send_audio_meme(p_meme_id uuid)
 RETURNS audio_memes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_meme public.audio_memes;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.audio_memes
     SET use_count = use_count + 1
   WHERE id = p_meme_id
  RETURNING * INTO v_meme;

  IF v_meme.id IS NULL THEN
    RAISE EXCEPTION 'Meme not found';
  END IF;

  RETURN v_meme;
END;
$function$
