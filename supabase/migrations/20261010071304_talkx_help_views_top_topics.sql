-- N-135 · Talk X: rastreio de visualizações dos artigos de ajuda + ranking dos mais vistos.
-- Rollback: DELETE FROM public.talkx_settings WHERE key IN ('support_contact','specialist_contact'); DROP FUNCTION IF EXISTS public.talkx_help_top_topics(integer); DROP TABLE IF EXISTS public.talkx_help_views;
-- (tudo aqui é objeto NOVO: DROP TABLE leva junto índice, RLS, policies e GRANTs da tabela;
--  DROP FUNCTION leva junto os GRANTs da função. Nada existente foi alterado.)

CREATE TABLE IF NOT EXISTS public.talkx_help_views (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  article_id text NOT NULL CHECK (length(article_id) BETWEEN 1 AND 200),
  user_id    uuid NOT NULL DEFAULT auth.uid(),
  viewed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_talkx_help_views_viewed_at_article
  ON public.talkx_help_views (viewed_at DESC, article_id);

ALTER TABLE public.talkx_help_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.talkx_help_views FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.talkx_help_views TO authenticated;
GRANT ALL ON public.talkx_help_views TO service_role;

DROP POLICY IF EXISTS talkx_help_views_insert_own ON public.talkx_help_views;
CREATE POLICY talkx_help_views_insert_own ON public.talkx_help_views
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS talkx_help_views_select_own ON public.talkx_help_views;
CREATE POLICY talkx_help_views_select_own ON public.talkx_help_views
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Ranking agregado: SECURITY DEFINER para somar as visualizações de todos sem abrir a
-- tabela; devolve só article_id e contagens — nunca user_id nem nome.
CREATE OR REPLACE FUNCTION public.talkx_help_top_topics(p_days integer DEFAULT 30)
RETURNS TABLE (article_id text, views bigint, unique_viewers bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT v.article_id, count(*) AS views, count(DISTINCT v.user_id) AS unique_viewers
  FROM public.talkx_help_views v
  WHERE auth.uid() IS NOT NULL
    AND v.viewed_at >= now() - make_interval(days => GREATEST(COALESCE(p_days, 30), 1))
  GROUP BY v.article_id
  ORDER BY views DESC, unique_viewers DESC, v.article_id
  LIMIT 50
$$;

REVOKE ALL ON FUNCTION public.talkx_help_top_topics(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_help_top_topics(integer) TO authenticated, service_role;

-- Seeds: contatos exibidos na Ajuda. Vazios até o Joaquim preencher; reaplicar não
-- sobrescreve o que já foi editado. O formato (canal whatsapp|chat_interno|email,
-- destino, horário) é validado por quem lê (src/components/talkx/TalkXHelp.tsx:
-- canal fora da lista ou sem destino não vira linha).
INSERT INTO public.talkx_settings (key, value, description) VALUES
  ('support_contact',    jsonb_build_object('canal', NULL, 'destino', NULL, 'horario', NULL), 'Contato de suporte exibido na Ajuda do Talk X'),
  ('specialist_contact', jsonb_build_object('canal', NULL, 'destino', NULL, 'horario', NULL), 'Contato do especialista exibido na Ajuda do Talk X')
ON CONFLICT (key) DO NOTHING;
