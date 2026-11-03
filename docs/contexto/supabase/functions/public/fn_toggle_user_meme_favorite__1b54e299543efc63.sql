CREATE OR REPLACE FUNCTION public.fn_toggle_user_meme_favorite(p_meme_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_exists uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_exists
    FROM public.audio_meme_favorites
    WHERE user_id = v_user AND meme_id = p_meme_id;

  IF v_exists IS NOT NULL THEN
    DELETE FROM public.audio_meme_favorites WHERE id = v_exists;
    RETURN false;
  ELSE
    INSERT INTO public.audio_meme_favorites (user_id, meme_id)
    VALUES (v_user, p_meme_id);
    RETURN true;
  END IF;
END;
$function$
