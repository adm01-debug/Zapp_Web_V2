-- E90 hardening (auditoria multi-agente 2026-09-16, 2a rodada): record_talkx_link_click()
-- aceitava qualquer p_recipient sem validar que ele pertence a campanha do link
-- clicado (slug). Um destinatario de OUTRA campanha passado em ?r= inflava
-- click_count/clicked_at desse destinatario e atribuia o clique a campanha
-- errada em talkx_link_clicks -- sem nenhuma constraint de banco que impedisse.
--
-- Fix: se p_recipient nao pertencer a campanha do link, o clique ainda e
-- registrado e o redirect ainda funciona (nunca falhar a experiencia real do
-- usuario clicando no link), mas sem atribuicao -- equivalente a um clique
-- anonimo (p_recipient tratado como NULL).
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
  SELECT * INTO v_link FROM public.talkx_links WHERE slug = p_slug;
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

-- Grants nao sobrevivem implicitamente a troca de corpo em todo motor/ferramenta;
-- reafirma explicitamente em vez de confiar em CREATE OR REPLACE preservar os
-- grants de PR #428 (mesma cautela que motivou aquele fix).
REVOKE ALL ON FUNCTION public.record_talkx_link_click(text, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_talkx_link_click(text, uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_talkx_link_click(text, uuid, text, text) TO service_role;
