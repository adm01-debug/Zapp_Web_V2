-- Achado na revisao exaustiva do plano de 50 etapas (2026-09-16): slug de
-- talkx_links era case-sensitive (UNIQUE(slug) simples). Um slug curto
-- compartilhado em WhatsApp/SMS/impresso e tipado por humanos -- "Abc123" e
-- "abc123" deveriam ser o MESMO link, nao dois links distintos colidindo por
-- capitalizacao. Zero linhas na tabela hoje (feature sem UI de criacao
-- ainda), seguro trocar a constraint sem migracao de dados.
ALTER TABLE public.talkx_links DROP CONSTRAINT talkx_links_slug_key;
CREATE UNIQUE INDEX talkx_links_slug_lower_key ON public.talkx_links (lower(slug));

-- record_talkx_link_click precisa casar por lower(slug) para a unicidade
-- acima ter efeito pratico no lookup usado pelo redirect publico.
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
