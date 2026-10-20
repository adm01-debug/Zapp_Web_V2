-- Regressao auto-inflingida: 20260916260000_talkx_links_slug_case_insensitive.sql
-- trocou o WHERE de record_talkx_link_click para lower(slug) = lower(p_slug),
-- mas 20260916270000_talkx_link_click_idor_guard.sql (renumerado de 230000
-- para 270000 durante resolucao de conflito de PR, sem revalidar a ordem de
-- dependencia de conteudo com a migration de case-insensitivity) tambem faz
-- CREATE OR REPLACE FUNCTION record_talkx_link_click com WHERE slug = p_slug
-- (match exato, versao anterior ao fix de case-insensitivity). Como 270000 >
-- 260000, ela sobrescreveu o fix ao aplicar por ultimo -- confirmado ao vivo
-- via pg_get_functiondef: producao estava de volta a match exato mesmo com o
-- indice unico ja trocado para lower(slug). Reaplica a versao definitiva
-- (lower() match + guard de IDOR), agora como a migration de versao mais
-- alta para nao ser sobrescrita de novo.
CREATE OR REPLACE FUNCTION public.record_talkx_link_click(
  p_slug        text,
  p_recipient   uuid DEFAULT NULL,
  p_ua          text DEFAULT NULL,
  p_ip_hash     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link               public.talkx_links%ROWTYPE;
  v_click_id            uuid;
  v_recipient_campaign  uuid;
BEGIN
  SELECT * INTO v_link FROM public.talkx_links WHERE lower(slug) = lower(p_slug);
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'link_not_found'); END IF;

  IF p_recipient IS NOT NULL THEN
    SELECT campaign_id INTO v_recipient_campaign
    FROM public.talkx_recipients WHERE id = p_recipient;
    IF v_recipient_campaign IS NULL OR v_recipient_campaign <> v_link.campaign_id THEN
      p_recipient := NULL;
    END IF;
  END IF;

  INSERT INTO public.talkx_link_clicks(link_id, recipient_id, ua, ip_hash)
  VALUES (v_link.id, p_recipient, p_ua, p_ip_hash)
  RETURNING id INTO v_click_id;

  IF p_recipient IS NOT NULL THEN
    UPDATE public.talkx_recipients
       SET clicked_at  = COALESCE(clicked_at, now()),
           click_count = click_count + 1
     WHERE id = p_recipient;
  END IF;

  RETURN jsonb_build_object(
    'click_id',    v_click_id,
    'link_id',     v_link.id,
    'target_url',  v_link.target_url,
    'campaign_id', v_link.campaign_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_talkx_link_click(text, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_talkx_link_click(text, uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_talkx_link_click(text, uuid, text, text) TO service_role;
