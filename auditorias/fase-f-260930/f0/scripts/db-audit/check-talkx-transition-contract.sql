-- Guard fail-closed (V02): public.transition_talkx_campaign precisa ter UMA
-- assinatura, a de 3 argumentos com p_pause_reason DEFAULT — e o CHECK de
-- public.talkx_campaigns.status precisa aceitar 'scheduled'.
--
-- Por que os dois juntos num guard so: sao o mesmo caminho de escrita do motor
-- de disparo. Dois overloads ao vivo fazem o PostgREST responder HTTP 300
-- PGRST203 para a chamada de 2 args (start/pause/cancel do talkx-send), e um
-- CHECK sem 'scheduled' derruba o agendamento. Os dois falham so em runtime.
--
-- A verificacao do DEFAULT e explicita: se alguem recriar a funcao sem
-- DEFAULT, a chamada de 2 args deixa de casar e a ambiguidade "desaparece"
-- por outro motivo — o guard precisa pegar os dois jeitos.

\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
SET search_path TO pg_catalog;

WITH target AS (
  SELECT p.oid, p.pronargs, p.pronargdefaults, p.proargnames, p.proargtypes
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'transition_talkx_campaign'
),
campaign_check AS (
  SELECT pg_get_constraintdef(c.oid) AS def
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'talkx_campaigns'
    AND c.conname = 'talkx_campaigns_status_check'
    AND c.contype = 'c'
),
checks AS (
  SELECT
    (SELECT count(*) FROM target) = 1 AS assinatura_unica,
    COALESCE(
      (SELECT bool_and(
         pronargs = 3
         AND pronargdefaults = 1
         -- proargnames carrega entrada E saída (a RPC devolve SETOF de uma
         -- linha com campaign_id/previous_status/current_status, que o
         -- talkx-send le). Conferido ao vivo no banco canônico: os nomes são
         -- justamente estes seis.
         AND proargnames[1:3] = ARRAY['p_campaign_id', 'p_action', 'p_pause_reason']
         AND proargnames[4:6] = ARRAY['campaign_id', 'previous_status', 'current_status']
       ) FROM target),
      false
    ) AS assinatura_esperada,
    (SELECT count(*) FROM campaign_check) = 1 AS check_existe,
    COALESCE(
      (SELECT bool_and(
         def ~ 'scheduled' AND def ~ 'draft' AND def ~ 'sending'
         AND def ~ 'paused' AND def ~ 'completed' AND def ~ 'cancelled'
       ) FROM campaign_check),
      false
    ) AS check_com_scheduled
),
result AS (
  SELECT
    assinatura_unica AND assinatura_esperada AND check_existe AND check_com_scheduled AS contrato_ok,
    jsonb_build_object(
      'assinatura_unica', assinatura_unica,
      'assinatura_esperada', assinatura_esperada,
      'check_existe', check_existe,
      'check_com_scheduled', check_com_scheduled
    )::text AS resumo
  FROM checks
)
SELECT contrato_ok, resumo FROM result \gset

\echo :resumo
\if :contrato_ok
  \echo 'OK: transition_talkx_campaign com assinatura unica e CHECK de status com scheduled.'
\else
  \echo 'FALHA: contrato de transicao de campanha do Talk X foi violado.'
  DO $talkx_transition_contract_guard$
  BEGIN
    RAISE EXCEPTION 'contrato de transicao de campanha do Talk X foi violado';
  END
  $talkx_transition_contract_guard$;
\endif
