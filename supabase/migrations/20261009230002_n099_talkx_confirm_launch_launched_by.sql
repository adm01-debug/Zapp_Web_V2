-- n099_talkx_confirm_launch_launched_by
-- versão 20261009230002 reservada para hermes-n099-talkx-confirmacoes-2610091923718c em 2026-10-09T20:30:00-03:00 (hermes-db-migrar --nova)
-- rollback: 1) DROP FUNCTION confirm_talkx_campaign_launch; 2) ALTER TABLE talkx_campaigns DROP COLUMN launched_by, launched_at;
--
-- Rollback: remove as colunas launched_by/launched_at e restaura a funcao confirm_talkx_campaign_launch sem gravacao de launched_by/at
-- Rollback (SQL executavel, na ordem):
--   ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS launched_by;
--   ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS launched_at;
--   CREATE OR REPLACE FUNCTION public.confirm_talkx_campaign_launch(uuid,bigint,jsonb,text) RETURNS TABLE(campaign_id uuid, revision bigint, launched_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ DECLARE v_campaign public.talkx_campaigns%ROWTYPE; BEGIN IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN RAISE EXCEPTION 'talkx_confirm_launch_unauthorized' USING ERRCODE = '42501'; END IF; SELECT * INTO v_campaign FROM public.talkx_campaigns WHERE id = p_campaign_id; IF NOT FOUND THEN RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0001'; END IF; IF v_campaign.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001'; END IF; IF p_confirmations ? 'consent' IS NOT TRUE OR p_confirmations ? 'content' IS NOT TRUE OR p_confirmations ? 'suppression' IS NOT TRUE THEN RAISE EXCEPTION 'talkx_confirm_launch_missing_keys' USING ERRCODE = '22023'; END IF; UPDATE public.talkx_campaigns SET launch_confirmations = p_confirmations, launch_confirmed_by = auth.uid(), launch_confirmed_at = statement_timestamp(), revision = revision + 1 WHERE id = p_campaign_id RETURNING id, revision, launch_confirmed_at INTO campaign_id, revision, launched_at; RETURN NEXT; END; $$;
--   REVOKE ALL ON FUNCTION public.confirm_talkx_campaign_launch(uuid,bigint,jsonb,text) FROM PUBLIC, anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.confirm_talkx_campaign_launch(uuid,bigint,jsonb,text) TO service_role;

-- N-099: adiciona launched_by e launched_at em talkx_campaigns e atualiza a RPC para gravar esses campos

-- 1) Colunas de quem lancou --------------------------------------------------
ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS launched_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS launched_at timestamptz;

-- 2) RPC de confirmacao de lancamento (atualizada para gravar launched_by/at) -
CREATE OR REPLACE FUNCTION public.confirm_talkx_campaign_launch(
  p_campaign_id       uuid,
  p_expected_revision bigint,
  p_confirmations     jsonb,
  p_mode              text
)
RETURNS TABLE(campaign_id uuid, revision bigint, launched_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campaign public.talkx_campaigns%ROWTYPE;
BEGIN
  -- O chamador precisa ser admin ou supervisor.
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_confirm_launch_unauthorized' USING ERRCODE = '42501';
  END IF;

  -- A campaign deve existir.
  SELECT * INTO v_campaign
  FROM public.talkx_campaigns
  WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Conflito de versao: revisao antiga e rejeitada.
  IF v_campaign.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
  END IF;

  -- As 3 chaves de confirmacao devem estar presentes.
  IF p_confirmations ? 'consent' IS NOT TRUE
     OR p_confirmations ? 'content' IS NOT TRUE
     OR p_confirmations ? 'suppression' IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_confirm_launch_missing_keys' USING ERRCODE = '22023';
  END IF;

  -- Registra a confirmacao, o lancamento e quem lancou.
  UPDATE public.talkx_campaigns
    SET launch_confirmations = p_confirmations,
        launch_confirmed_by  = auth.uid(),
        launch_confirmed_at  = statement_timestamp(),
        launched_by          = auth.uid(),
        launched_at          = statement_timestamp(),
        revision             = talkx_campaigns.revision + 1
  WHERE id = p_campaign_id
  RETURNING talkx_campaigns.id, talkx_campaigns.revision, talkx_campaigns.launch_confirmed_at INTO campaign_id, revision, launched_at;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_talkx_campaign_launch(uuid,bigint,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_talkx_campaign_launch(uuid,bigint,jsonb,text)
  TO service_role;

COMMENT ON FUNCTION public.confirm_talkx_campaign_launch(uuid,bigint,jsonb,text) IS
  'N-099: confirma o lancamento de uma campanha Talk X. Exige admin/supervisor, as 3 chaves (consent, content, suppression) em p_confirmations, e rejeita revisao antiga. Grava launch_confirmations/by/at, launched_by/at e incrementa revision.';