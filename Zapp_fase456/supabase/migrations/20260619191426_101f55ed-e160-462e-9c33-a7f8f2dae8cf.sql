
-- =====================================================================
-- FASE A — Schema das Jornadas WhatsApp (ZAPP Web)
-- =====================================================================

-- 1) Tabela de favoritos por usuário
CREATE TABLE IF NOT EXISTS public.audio_meme_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meme_id uuid NOT NULL REFERENCES public.audio_memes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, meme_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audio_meme_favorites TO authenticated;
GRANT ALL ON public.audio_meme_favorites TO service_role;

ALTER TABLE public.audio_meme_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own meme favorites"
  ON public.audio_meme_favorites FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_audio_meme_favorites_user
  ON public.audio_meme_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_audio_meme_favorites_meme
  ON public.audio_meme_favorites(meme_id);

-- 2) Colunas na tabela messages para suportar todas as jornadas
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS ptt boolean,
  ADD COLUMN IF NOT EXISTS audio_meme_id uuid REFERENCES public.audio_memes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_mimetype text,
  ADD COLUMN IF NOT EXISTS media_filename text,
  ADD COLUMN IF NOT EXISTS media_size bigint,
  ADD COLUMN IF NOT EXISTS media_meta jsonb,
  ADD COLUMN IF NOT EXISTS caption text,
  ADD COLUMN IF NOT EXISTS link_preview jsonb,
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_audio_meme ON public.messages(audio_meme_id) WHERE audio_meme_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON public.messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_media_type ON public.messages(media_type) WHERE media_type IS NOT NULL;

-- 3) RPC: listar memes com favoritos do usuário primeiro
CREATE OR REPLACE FUNCTION public.fn_list_audio_memes_for_user(
  p_category text DEFAULT NULL,
  p_only_favs boolean DEFAULT false,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  audio_url text,
  category text,
  duration_seconds numeric,
  use_count integer,
  is_favorite boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.name,
    m.audio_url,
    m.category,
    m.duration_seconds,
    m.use_count,
    (f.id IS NOT NULL) AS is_favorite,
    m.created_at
  FROM public.audio_memes m
  LEFT JOIN public.audio_meme_favorites f
    ON f.meme_id = m.id AND f.user_id = auth.uid()
  WHERE auth.uid() IS NOT NULL
    AND (p_category IS NULL OR m.category = p_category)
    AND (NOT p_only_favs OR f.id IS NOT NULL)
    AND (
      p_search IS NULL
      OR p_search = ''
      OR m.name ILIKE '%' || p_search || '%'
      OR m.category ILIKE '%' || p_search || '%'
    )
  ORDER BY (f.id IS NOT NULL) DESC, m.use_count DESC, m.name ASC
  LIMIT 1000;
$$;

GRANT EXECUTE ON FUNCTION public.fn_list_audio_memes_for_user(text, boolean, text) TO authenticated;

-- 4) RPC: toggle favorito do usuário
CREATE OR REPLACE FUNCTION public.fn_toggle_user_meme_favorite(p_meme_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.fn_toggle_user_meme_favorite(uuid) TO authenticated;

-- 5) RPC: categorias com contagem
CREATE OR REPLACE FUNCTION public.fn_list_audio_meme_categories()
RETURNS TABLE (category text, total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT category, COUNT(*)::bigint AS total
  FROM public.audio_memes
  GROUP BY category
  ORDER BY total DESC, category ASC;
$$;

GRANT EXECUTE ON FUNCTION public.fn_list_audio_meme_categories() TO authenticated;

-- 6) RPC: registrar envio do meme (incrementa use_count)
CREATE OR REPLACE FUNCTION public.fn_send_audio_meme(p_meme_id uuid)
RETURNS public.audio_memes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.fn_send_audio_meme(uuid) TO authenticated;
