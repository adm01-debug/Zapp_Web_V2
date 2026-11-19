-- X065/BUG — `talkx_next_recipients` passa a devolver `variant_id`.
--
-- O QUE ESTAVA ERRADO (achado da revisao da PR #3262, confirmado no codigo e no
-- banco ao vivo em 18/11/2026):
--
-- A 20261118190000 fez o snapshot da campanha atribuir a variante por hash do
-- `contact_id` e gravar o resultado em `talkx_recipients.variant_id`. O worker
-- deveria honrar essa atribuicao: `process-recipient.ts:350` le
-- `recipient.variant_id` e, quando ela existe, busca exatamente aquela variante.
--
-- So que a linha nunca chega la. Esta funcao e a unica fonte da fila do worker e
-- o RETURNS TABLE dela nao tinha `variant_id` (conferido ao vivo:
-- pg_get_function_result(...) like '%variant_id%' = false), e
-- `talkx-send/index.ts` tampouco mapeava o campo. Logo `recipient.variant_id` era
-- SEMPRE undefined, `existingVid` caia para null e a linha 382 RE-SORTEAVA a
-- variante com `pickVariant(..., recipient.id)` — outro identificador, outro hash.
--
-- Resultado: a mensagem enviada podia ser a da variante B enquanto
-- `talkx_recipients.variant_id` dizia A. Como `talkx_campaign_variant_stats`
-- agrupa pela coluna da linha, a resposta do contato entrava na variante errada
-- e `decide_talkx_ab_winner` escolheria a vencedora com numero mentiroso.
--
-- IMPACTO ATE AGORA: nenhum. `ab_enabled` e falso em todas as campanhas (medido
-- em 18/11/2026), entao nenhum teste A/B rodou e nenhuma decisao foi tomada com
-- numero errado. O defeito era latente: mentiria no primeiro A/B ligado.
--
-- POR QUE DROP E NAO CREATE OR REPLACE: o Postgres recusa trocar o tipo de
-- retorno de uma funcao existente ("cannot change return type of existing
-- function"). O DROP exige recriar os grants, porque funcao nova nasce com
-- EXECUTE para PUBLIC — os dois comandos no fim reproduzem exatamente o ACL de
-- hoje ({postgres=X/postgres,service_role=X/postgres}), sem alargar acesso.
--
-- O corpo abaixo e o de 20261001311230 com UMA linha somada no SELECT
-- (`recipient.variant_id`); nenhum filtro, ordem ou limite muda.
--
-- Rollback: recriar a versao de 20261001311230 (sem variant_id no RETURNS TABLE)
-- e reaplicar os mesmos REVOKE/GRANT.

DROP FUNCTION IF EXISTS public.talkx_next_recipients(uuid, integer);

CREATE FUNCTION public.talkx_next_recipients(
  p_campaign_id uuid,
  p_limit       integer DEFAULT 20
)
RETURNS TABLE(
  recipient_id          uuid,
  contact_id            uuid,
  status                text,
  attempt_count         integer,
  retry_after           timestamptz,
  personalized_message  text,
  variant_id            uuid,
  contact_name          text,
  contact_nickname      text,
  contact_phone         text,
  contact_company       text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_now timestamptz := statement_timestamp();
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_id' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT recipient.id,
         recipient.contact_id,
         recipient.status,
         recipient.attempt_count,
         recipient.retry_after,
         recipient.personalized_message,
         recipient.variant_id,
         contact.name,
         contact.nickname,
         contact.phone,
         contact.company
  FROM public.talkx_recipients AS recipient
  JOIN public.talkx_campaigns AS campaign ON campaign.id = recipient.campaign_id
  LEFT JOIN public.contacts AS contact ON contact.id = recipient.contact_id
  WHERE recipient.campaign_id = p_campaign_id
    AND campaign.status = 'sending'
    AND recipient.provider_dispatch_started_at IS NULL
    AND (
      (
        recipient.status = 'pending'
        AND (recipient.retry_after IS NULL OR recipient.retry_after <= v_now)
      )
      OR
      (
        recipient.status = 'sending'
        AND recipient.delivery_claim_expires_at IS NOT NULL
        AND recipient.delivery_claim_expires_at <= v_now
      )
    )
  ORDER BY recipient.created_at, recipient.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 200);
END;
$function$;

-- Reproduz o ACL de hoje: funcao nova nasceria com EXECUTE para PUBLIC.
REVOKE ALL ON FUNCTION public.talkx_next_recipients(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_next_recipients(uuid, integer)
  TO service_role;
