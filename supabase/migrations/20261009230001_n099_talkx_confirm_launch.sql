-- n099_talkx_confirm_launch
-- versão 20261009230001 reservada para hermes-n099-talkx-confirmacoes-2610091923718c em 2026-10-09T20:30:00-03:00 (hermes-db-migrar --nova)
-- rollback: 1) DROP FUNCTION confirm_talkx_campaign_launch; 2) ALTER TABLE talkx_campaigns DROP COLUMN launch_confirmations, launch_confirmed_by, launch_confirmed_at;
--
-- Rollback: remove a funcao confirm_talkx_campaign_launch e as 3 colunas de talkx_campaigns
-- Rollback (SQL executavel, na ordem):
--   DROP FUNCTION IF EXISTS public.confirm_talkx_campaign_launch(uuid,bigint,jsonb,text);
--   ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS launch_confirmations;
--   ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS launch_confirmed_by;
--   ALTER TABLE public.talkx_campaigns DROP COLUMN IF EXISTS launch_confirmed_at;

-- N-099: guardar as 3 confirmacoes de lancamento e quem lancou a campanha
-- em talkx_campaigns, e criar a RPC confirm_talkx_campaign_launch.

-- 1) Colunas de confirmacao de lancamento -----------------------------------
ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS launch_confirmations jsonb,
  ADD COLUMN IF NOT EXISTS launch_confirmed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS launch_confirmed_at timestamptz;

-- 2) RPC de confirmacao de lancamento --------------------------------------
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

  -- Registra a confirmacao e o lancamento.
  UPDATE public.talkx_campaigns
    SET launch_confirmations = p_confirmations,
        launch_confirmed_by  = auth.uid(),
        launch_confirmed_at  = statement_timestamp(),
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
  'N-099: confirma o lancamento de uma campanha Talk X. Exige admin/supervisor, as 3 chaves (consent, content, suppression) em p_confirmations, e rejeita revisao antiga. Grava launch_confirmations/by/at e incrementa revision.';
